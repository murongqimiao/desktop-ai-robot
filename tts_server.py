#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TTS 文本转语音服务器
支持流式输出和音色切换
使用 Coqui TTS 库
"""

import json
import sys
import os
import asyncio
import websockets
import logging
from typing import Optional

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# TTS 配置
TTS_HOST = 'localhost'
TTS_PORT = 8766
DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'  # 默认音色

# 全局变量
tts_engine = None
current_voice = None

def init_tts(voice_name: Optional[str] = None):
    """初始化 TTS 引擎"""
    global tts_engine, current_voice
    
    try:
        from TTS.api import TTS
        
        # 如果没有指定音色，使用默认音色
        voice = voice_name or DEFAULT_VOICE
        
        # 可用的中文模型列表（Coqui TTS 支持的中文模型）
        # 可以通过切换模型来切换音色
        available_models = {
            'zh-cn-xiaoxiao': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-xiaoyi': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunjian': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunxi': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunyang': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunye': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunxia': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
        }
        
        # 如果使用 Coqui TTS，选择模型
        # 注意：Coqui TTS 的中文模型较少，也可以使用其他方案
        model_name = available_models.get(voice.lower(), 'tts_models/zh-CN/baker/tacotron2-DDC-GST')
        
        logger.info(f"正在加载 TTS 模型: {model_name}")
        tts_engine = TTS(model_name=model_name, progress_bar=False)
        current_voice = voice
        
        logger.info(f"TTS 引擎初始化完成，当前音色: {voice}")
        return True
        
    except ImportError:
        logger.error("TTS 库未安装，请运行: pip install TTS")
        logger.info("或者使用其他 TTS 方案，如 edge-tts（推荐，支持更多音色）")
        return False
    except Exception as e:
        logger.error(f"初始化 TTS 引擎失败: {e}")
        return False

def init_edge_tts():
    """初始化 Edge TTS（推荐方案，支持更多音色和流式输出）"""
    global tts_engine, current_voice
    
    try:
        import edge_tts
        
        logger.info("使用 Edge TTS（支持更多音色和流式输出）")
        tts_engine = edge_tts
        current_voice = DEFAULT_VOICE
        
        logger.info("Edge TTS 初始化完成")
        return True
        
    except ImportError:
        logger.error("edge-tts 未安装，请运行: pip install edge-tts")
        return False
    except Exception as e:
        logger.error(f"初始化 Edge TTS 失败: {e}")
        return False

async def text_to_speech_edge(text: str, voice: Optional[str] = None) -> bytes:
    """使用 Edge TTS 进行文本转语音（流式输出）"""
    import edge_tts
    
    voice_name = voice or current_voice or DEFAULT_VOICE
    
    try:
        # 获取可用的中文语音列表
        voices = await edge_tts.list_voices()
        chinese_voices = [v for v in voices if v['Locale'].startswith('zh-')]
        
        # 如果指定的音色不存在，使用默认音色
        available_voice = None
        for v in chinese_voices:
            if voice_name in v['ShortName'] or voice_name in v['Name']:
                available_voice = v['ShortName']
                break
        
        if not available_voice:
            # 使用第一个可用的中文语音
            available_voice = chinese_voices[0]['ShortName'] if chinese_voices else DEFAULT_VOICE
            logger.warning(f"音色 {voice_name} 不可用，使用 {available_voice}")
        
        # 生成语音（流式）
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

async def text_to_speech_coqui(text: str, voice: Optional[str] = None) -> bytes:
    """使用 Coqui TTS 进行文本转语音"""
    if not tts_engine:
        return b''
    
    try:
        import io
        import wave
        import numpy as np
        
        # 生成语音
        wav = tts_engine.tts(text)
        
        # 转换为字节流
        wav_bytes_io = io.BytesIO()
        
        # 假设 wav 是 numpy 数组，需要转换为 WAV 格式
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

async def handle_tts_request(websocket):
    """处理 TTS 请求"""
    logger.info(f"新 TTS 客户端连接: {websocket.remote_address}")
    
    try:
        async for message in websocket:
            try:
                if isinstance(message, str):
                    data = json.loads(message)
                    request_type = data.get('type')
                    
                    if request_type == 'synthesize':
                        # 文本转语音请求
                        text = data.get('text', '')
                        voice = data.get('voice')  # 可选的音色参数
                        
                        if not text:
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': '文本内容为空'
                            }))
                            continue
                        
                        logger.info(f"收到 TTS 请求: {text[:50]}... (音色: {voice or '默认'})")
                        
                        # 使用 Edge TTS（推荐）或 Coqui TTS
                        # 检查是否使用 Edge TTS（通过检查 tts_engine 是否为 edge_tts 模块）
                        try:
                            import edge_tts
                            if tts_engine == edge_tts:
                                # Edge TTS
                                audio_data = await text_to_speech_edge(text, voice)
                            else:
                                # Coqui TTS
                                audio_data = await text_to_speech_coqui(text, voice)
                        except:
                            # Coqui TTS
                            audio_data = await text_to_speech_coqui(text, voice)
                        
                        if audio_data:
                            # 发送音频数据（直接发送完整音频，Edge TTS 返回的是 MP3 格式）
                            # 先发送元数据
                            await websocket.send(json.dumps({
                                'type': 'audio_start',
                                'total_size': len(audio_data),
                                'format': 'mp3'
                            }))
                            
                            # 发送完整音频数据（Edge TTS 返回的是 MP3 字节流）
                            await websocket.send(audio_data)
                            
                            # 发送结束标志
                            await websocket.send(json.dumps({
                                'type': 'audio_end'
                            }))
                            
                            logger.info(f"TTS 音频发送完成: {len(audio_data)} 字节")
                        else:
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': '语音生成失败'
                            }))
                    
                    elif request_type == 'list_voices':
                        # 获取可用音色列表
                        try:
                            import edge_tts
                            voices = await edge_tts.list_voices()
                            chinese_voices = [
                                {
                                    'name': v['Name'],
                                    'short_name': v['ShortName'],
                                    'locale': v['Locale'],
                                    'gender': v['Gender']
                                }
                                for v in voices if v['Locale'].startswith('zh-')
                            ]
                            
                            await websocket.send(json.dumps({
                                'type': 'voices_list',
                                'voices': chinese_voices
                            }))
                        except Exception as e:
                            logger.error(f"获取音色列表失败: {e}")
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': f'获取音色列表失败: {str(e)}'
                            }))
                    
                    elif request_type == 'set_voice':
                        # 设置音色
                        voice = data.get('voice')
                        if voice:
                            global current_voice
                            current_voice = voice
                            await websocket.send(json.dumps({
                                'type': 'voice_set',
                                'voice': voice
                            }))
                            logger.info(f"音色已切换为: {voice}")
                
            except json.JSONDecodeError as e:
                logger.error(f"JSON 解析错误: {e}")
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': f'JSON 解析错误: {str(e)}'
                }))
            except Exception as e:
                logger.error(f"处理请求时出错: {e}")
                await websocket.send(json.dumps({
                    'type': 'error',
                    'message': f'处理请求失败: {str(e)}'
                }))
                
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"TTS 客户端断开连接: {websocket.remote_address}")
    except Exception as e:
        logger.error(f"TTS 连接错误: {e}")

async def main():
    """主函数"""
    # 优先尝试使用 Edge TTS（推荐，支持更多音色）
    if not init_edge_tts():
        # 如果 Edge TTS 不可用，尝试 Coqui TTS
        logger.info("尝试使用 Coqui TTS...")
        if not init_tts():
            logger.error("TTS 引擎初始化失败，请安装 edge-tts 或 TTS")
            logger.info("推荐安装: pip install edge-tts")
            sys.exit(1)
    
    logger.info(f"启动 TTS WebSocket 服务器: ws://{TTS_HOST}:{TTS_PORT}")
    
    async with websockets.serve(handle_tts_request, TTS_HOST, TTS_PORT):
        logger.info("TTS 服务器已启动，等待连接...")
        await asyncio.Future()  # 永久运行

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("TTS 服务器已停止")
    except Exception as e:
        logger.error(f"TTS 服务器错误: {e}")
        sys.exit(1)

