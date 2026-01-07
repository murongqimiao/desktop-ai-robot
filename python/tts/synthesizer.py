#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TTS 合成器模块
处理文本转语音的核心逻辑
"""

import json
import io
import subprocess
import tempfile
import os
import logging
import websockets
from typing import Optional

from python.tts.engine_manager import get_engine, get_current_voice, get_edge_voices, TTS_DEFAULT_VOICE

logger = logging.getLogger(__name__)


async def text_to_speech_edge(text: str, voice: Optional[str] = None) -> bytes:
    """
    使用 Edge TTS 进行文本转语音（非流式）
    
    Args:
        text: 要转换的文本
        voice: 音色名称（可选）
    
    Returns:
        音频数据（字节）
    """
    import edge_tts
    
    voice_name = voice or get_current_voice() or TTS_DEFAULT_VOICE
    
    try:
        # 获取可用的中文语音列表
        chinese_voices = await get_edge_voices()
        
        # 如果指定的音色不存在，使用默认音色
        available_voice = None
        if chinese_voices:
            for v in chinese_voices:
                if voice_name in v['ShortName'] or voice_name in v['Name']:
                    available_voice = v['ShortName']
                    break
        
        if not available_voice:
            if chinese_voices and len(chinese_voices) > 0:
                available_voice = chinese_voices[0]['ShortName']
                logger.info(f"音色 {voice_name} 未找到，使用 {available_voice}")
            else:
                available_voice = voice_name if voice_name else TTS_DEFAULT_VOICE
                logger.info(f"使用音色: {available_voice}（无法获取音色列表，使用默认）")
        
        # 生成语音
        communicate = edge_tts.Communicate(text, available_voice)
        stream = communicate.stream()
        
        if not hasattr(stream, '__aiter__'):
            raise TypeError(f"stream() 返回的对象不是异步迭代器: {type(stream)}")
        
        audio_data = b''
        async for chunk in stream:
            if chunk.get('type') == 'audio':
                audio_data += chunk.get('data', b'')
        
        logger.info(f"TTS 生成完成，音频大小: {len(audio_data)} 字节")
        return audio_data
        
    except Exception as e:
        logger.error(f"Edge TTS 生成失败: {e}")
        import traceback
        logger.error(f"详细错误信息:\n{traceback.format_exc()}")
        return b''


async def text_to_speech_edge_stream(text: str, voice: Optional[str], websocket, emotion: str = 'normal'):
    """
    使用 Edge TTS 进行文本转语音（流式发送 PCM 格式）
    
    Args:
        text: 要转换的文本
        voice: 音色名称（可选）
        websocket: WebSocket 连接对象
        emotion: 情绪类型（可选，默认 'normal'）
    """
    import edge_tts
    import time
    
    # 记录开始时间
    start_time = time.time()
    
    # 检查文本是否为空（清理后可能为空）
    if not text or not text.strip():
        logger.warning("文本为空，跳过 TTS 转换")
        try:
            await websocket.send(json.dumps({
                'type': 'audio_start',
                'voice': voice or get_current_voice() or TTS_DEFAULT_VOICE,
                'emotion': emotion,
                'format': 'pcm',
                'sample_rate': 24000,
                'channels': 1,
                'bits_per_sample': 16,
                'streaming': True
            }))
            await websocket.send(json.dumps({
                'type': 'audio_end',
                'voice': voice or get_current_voice() or TTS_DEFAULT_VOICE,
                'emotion': emotion,
                'total_size': 0
            }))
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket 连接已关闭")
        return
    
    voice_name = voice or get_current_voice() or TTS_DEFAULT_VOICE
    
    try:
        # 获取可用的中文语音列表
        chinese_voices = await get_edge_voices()
        
        # 如果指定的音色不存在，使用默认音色
        available_voice = None
        if chinese_voices:
            for v in chinese_voices:
                if voice_name in v['ShortName'] or voice_name in v['Name']:
                    available_voice = v['ShortName']
                    break
        
        if not available_voice:
            if chinese_voices and len(chinese_voices) > 0:
                available_voice = chinese_voices[0]['ShortName']
                logger.info(f"音色 {voice_name} 未找到，使用 {available_voice}")
            else:
                available_voice = voice_name if voice_name else TTS_DEFAULT_VOICE
                logger.info(f"使用音色: {available_voice}（无法获取音色列表，使用默认）")
        
        # 发送开始消息（PCM 格式），包含 voice 和 emotion
        try:
            await websocket.send(json.dumps({
                'type': 'audio_start',
                'voice': voice_name,
                'emotion': emotion,
                'format': 'pcm',
                'sample_rate': 24000,  # Edge TTS 默认采样率
                'channels': 1,  # 单声道
                'bits_per_sample': 16,  # 16位
                'streaming': True  # 标记为流式
            }))
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket 连接已关闭，无法发送音频开始消息")
            return
        
        # 生成语音（流式）
        communicate = edge_tts.Communicate(text, available_voice)
        stream = communicate.stream()
        
        if not hasattr(stream, '__aiter__'):
            raise TypeError(f"stream() 返回的对象不是异步迭代器: {type(stream)}")
        
        # 使用 ffmpeg 流式解码 MP3 为 PCM
        total_size = 0
        try:
            # 累积 MP3 数据块，当达到一定大小时进行解码
            mp3_chunks = []
            buffer_size = 0
            min_buffer_size = 8192  # 最小缓冲区大小（8KB）
            
            async for chunk in stream:
                if chunk.get('type') == 'audio':
                    audio_chunk = chunk.get('data', b'')
                    if audio_chunk:
                        mp3_chunks.append(audio_chunk)
                        buffer_size += len(audio_chunk)
                        
                        # 当缓冲区达到一定大小时，解码并发送
                        if buffer_size >= min_buffer_size:
                            # 合并 MP3 块
                            mp3_data = b''.join(mp3_chunks)
                            mp3_chunks = []
                            buffer_size = 0
                            
                            # 使用 ffmpeg 解码 MP3 为 PCM
                            with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as mp3_file:
                                mp3_file.write(mp3_data)
                                mp3_path = mp3_file.name
                            
                            try:
                                # 使用 ffmpeg 转换为 PCM (16位, 单声道, 24kHz)
                                process = subprocess.Popen(
                                    [
                                        'ffmpeg',
                                        '-i', mp3_path,
                                        '-f', 's16le',  # 16位 PCM，小端序
                                        '-acodec', 'pcm_s16le',
                                        '-ac', '1',  # 单声道
                                        '-ar', '24000',  # 24kHz 采样率
                                        '-'  # 输出到 stdout
                                    ],
                                    stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL
                                )
                                
                                raw_audio, _ = process.communicate()
                                
                                if raw_audio:
                                    # 发送 PCM 数据
                                    try:
                                        await websocket.send(raw_audio)
                                        total_size += len(raw_audio)
                                    except websockets.exceptions.ConnectionClosed:
                                        logger.warning("WebSocket 连接已关闭，停止发送音频数据")
                                        return
                            finally:
                                # 清理临时文件
                                try:
                                    os.unlink(mp3_path)
                                except:
                                    pass
            
            # 处理剩余的 MP3 数据
            if mp3_chunks:
                mp3_data = b''.join(mp3_chunks)
                with tempfile.NamedTemporaryFile(suffix='.mp3', delete=False) as mp3_file:
                    mp3_file.write(mp3_data)
                    mp3_path = mp3_file.name
                
                try:
                    process = subprocess.Popen(
                        [
                            'ffmpeg',
                            '-i', mp3_path,
                            '-f', 's16le',
                            '-acodec', 'pcm_s16le',
                            '-ac', '1',
                            '-ar', '24000',
                            '-'
                        ],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL
                    )
                    
                    raw_audio, _ = process.communicate()
                    
                    if raw_audio:
                        # 发送 PCM 数据
                        try:
                            await websocket.send(raw_audio)
                            total_size += len(raw_audio)
                        except websockets.exceptions.ConnectionClosed:
                            logger.warning("WebSocket 连接已关闭，停止发送音频数据")
                            return
                finally:
                    try:
                        os.unlink(mp3_path)
                    except:
                        pass
            
        except FileNotFoundError:
            logger.error("ffmpeg 未安装，无法转换为 PCM 格式")
            try:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': '需要安装 ffmpeg 以支持 PCM 格式转换'
                }))
            except websockets.exceptions.ConnectionClosed:
                logger.warning("WebSocket 连接已关闭，无法发送错误消息")
            return
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket 连接已关闭，停止处理")
            return
        except Exception as e:
            logger.error(f"PCM 转换失败: {e}")
            import traceback
            logger.error(f"详细错误信息:\n{traceback.format_exc()}")
            try:
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': f'PCM 转换失败: {str(e)}'
                }))
            except websockets.exceptions.ConnectionClosed:
                logger.warning("WebSocket 连接已关闭，无法发送错误消息")
            return
        
        # 发送结束消息，包含 voice 和 emotion
        try:
            await websocket.send(json.dumps({
                'type': 'audio_end',
                'voice': voice_name,
                'emotion': emotion,
                'total_size': total_size
            }))
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket 连接已关闭，无法发送音频结束消息")
        
        # 计算耗时
        elapsed_time = time.time() - start_time
        
        # 蓝色console输出，显示转语音完成和耗时
        print(f"\033[34m[TTS] 文本转语音完成，耗时: {elapsed_time:.2f}秒，音频大小: {total_size} 字节，情绪: {emotion}\033[0m")
        logger.info(f"TTS 流式发送完成（PCM 格式），总大小: {total_size} 字节，耗时: {elapsed_time:.2f}秒，情绪: {emotion}")
        
    except websockets.exceptions.ConnectionClosed:
        logger.warning("WebSocket 连接已关闭，停止处理")
        return
    except Exception as e:
        # 检查是否是 NoAudioReceived 错误
        error_str = str(e)
        if 'NoAudioReceived' in error_str or 'No audio was received' in error_str:
            logger.warning(f"Edge TTS 未收到音频数据: {e}，文本可能为空或音色参数不正确")
            # 发送空的音频结束消息
            try:
                await websocket.send(json.dumps({
                    'type': 'audio_end',
                    'voice': voice_name,
                    'emotion': emotion,
                    'total_size': 0
                }))
            except websockets.exceptions.ConnectionClosed:
                logger.warning("WebSocket 连接已关闭")
            return
        
        logger.error(f"Edge TTS 流式生成失败: {e}")
        import traceback
        logger.error(f"详细错误信息:\n{traceback.format_exc()}")
        try:
            await websocket.send(json.dumps({
                'type': 'error',
                'message': f'语音生成失败: {str(e)}'
            }))
        except (websockets.exceptions.ConnectionClosed, Exception):
            logger.warning("无法发送错误消息，连接可能已关闭")


async def text_to_speech_coqui(text: str, voice: Optional[str] = None) -> bytes:
    """
    使用 Coqui TTS 进行文本转语音
    
    Args:
        text: 要转换的文本
        voice: 音色名称（可选）
    
    Returns:
        音频数据（WAV 格式字节）
    """
    tts_engine = get_engine()
    if not tts_engine:
        logger.warning("TTS 引擎未初始化")
        return b''
    
    # 检查是否是 Coqui TTS 对象（TTS.api.TTS 实例）
    # 如果 tts_engine 是 edge_tts 模块，不应该调用这个方法
    try:
        from TTS.api import TTS
        if not isinstance(tts_engine, TTS):
            logger.warning(f"TTS 引擎类型不正确，期望 TTS.api.TTS 实例，实际: {type(tts_engine)}")
            return b''
    except ImportError:
        # 如果 TTS 库未安装，但 tts_engine 存在，可能是 edge_tts 模块
        import edge_tts
        if tts_engine == edge_tts:
            logger.warning("TTS 引擎是 edge_tts 模块，不应使用 Coqui TTS 方法")
            return b''
    
    try:
        import wave
        import numpy as np
        
        # 生成语音
        wav = tts_engine.tts(text)
        
        # 转换为字节流
        wav_bytes_io = io.BytesIO()
        
        # Coqui TTS 返回的是 numpy 数组
        sample_rate = tts_engine.synthesizer.output_sample_rate
        
        # 转换为 16-bit PCM
        wav_int16 = (wav * 32767).astype(np.int16)
        
        # 写入 WAV 文件格式
        with wave.open(wav_bytes_io, 'wb') as wav_file:
            wav_file.setnchannels(1)  # 单声道
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(wav_int16.tobytes())
        
        wav_bytes_io.seek(0)
        return wav_bytes_io.read()
        
    except Exception as e:
        logger.error(f"Coqui TTS 生成失败: {e}")
        return b''

