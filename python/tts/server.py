#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TTS 文本转语音服务器
支持流式输出和音色切换
"""

import json
import sys
import asyncio
import websockets
import logging

from python.common.logger import setup_logger
from python.common.config import TTS_HOST, TTS_PORT, TTS_DEFAULT_VOICE
from python.tts.engine_manager import init_edge_tts, init_coqui_tts, get_engine, get_edge_voices, set_current_voice
from python.tts.synthesizer import text_to_speech_edge_stream, text_to_speech_coqui
from python.tts.text_processor import process_text

# 配置日志
logger = setup_logger(__name__)


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
                        
                        print(f"\n[TTS 服务器] ========== 收到 TTS 请求 ==========")
                        print(f"[TTS 服务器] 原始请求文本: '{text}' (长度: {len(text) if text else 0}, 类型: {type(text)})")
                        print(f"[TTS 服务器] 音色参数: {voice}")
                        
                        if not text:
                            print(f"[TTS 服务器] 错误: 文本内容为空")
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': '文本内容为空'
                            }))
                            continue
                        
                        # 处理文本：清理、移除表情包、提取情绪
                        cleaned_text, emotion = process_text(text)
                        print(f"[TTS 服务器] 处理结果 - 清理后文本: '{cleaned_text}' (长度: {len(cleaned_text) if cleaned_text else 0})")
                        print(f"[TTS 服务器] 处理结果 - 情绪: '{emotion}'")
                        
                        # 如果清理后的文本为空，发送空音频响应并跳过
                        if not cleaned_text or not cleaned_text.strip():
                            logger.info(f"文本清理后为空，跳过 TTS 转换（原始文本: {text[:50]}...）")
                            try:
                                await websocket.send(json.dumps({
                                    'type': 'audio_start',
                                    'voice': voice or TTS_DEFAULT_VOICE,
                                    'emotion': emotion,
                                    'format': 'pcm',
                                    'sample_rate': 24000,
                                    'channels': 1,
                                    'bits_per_sample': 16,
                                    'streaming': True
                                }))
                                await websocket.send(json.dumps({
                                    'type': 'audio_end',
                                    'voice': voice or TTS_DEFAULT_VOICE,
                                    'emotion': emotion,
                                    'total_size': 0
                                }))
                            except websockets.exceptions.ConnectionClosed:
                                logger.warning("WebSocket 连接已关闭")
                            continue
                        
                        # 黄色console输出，显示接收到的文本
                        print(f"\033[33m[TTS] 接收到文本转语音请求: {cleaned_text[:100]}{'...' if len(cleaned_text) > 100 else ''} (音色: {voice or '默认'}, 情绪: {emotion})\033[0m")
                        logger.info(f"收到 TTS 请求: {cleaned_text[:50]}... (音色: {voice or '默认'}, 情绪: {emotion})")
                        
                        # 使用 Edge TTS（推荐）或 Coqui TTS
                        import time
                        start_time = time.time()
                        
                        try:
                            import edge_tts
                            tts_engine = get_engine()
                            
                            # 检查是否是 Edge TTS 模块
                            if tts_engine == edge_tts:
                                # Edge TTS - 流式发送（计时在函数内部处理）
                                try:
                                    await text_to_speech_edge_stream(cleaned_text, voice, websocket, emotion)
                                except websockets.exceptions.ConnectionClosed:
                                    logger.warning("WebSocket 连接已关闭，停止处理 TTS 请求")
                                    break  # 退出消息循环
                                except Exception as e:
                                    # Edge TTS 流式处理失败，记录错误但不fallback到Coqui
                                    # 因为 tts_engine 是 edge_tts 模块，不是 Coqui TTS 对象
                                    logger.error(f"Edge TTS 流式处理失败: {e}")
                                    await websocket.send(json.dumps({
                                        'type': 'error',
                                        'message': f'Edge TTS 处理失败: {str(e)}'
                                    }))
                            else:
                                # Coqui TTS - 非流式（tts_engine 是 TTS.api.TTS 实例）
                                audio_data = await text_to_speech_coqui(cleaned_text, voice)
                                elapsed_time = time.time() - start_time
                                
                                if audio_data:
                                    await websocket.send(json.dumps({
                                        'type': 'audio_start',
                                        'voice': voice or TTS_DEFAULT_VOICE,
                                        'emotion': emotion,
                                        'total_size': len(audio_data),
                                        'format': 'wav'
                                    }))
                                    await websocket.send(audio_data)
                                    await websocket.send(json.dumps({
                                        'type': 'audio_end',
                                        'voice': voice or TTS_DEFAULT_VOICE,
                                        'emotion': emotion,
                                        'total_size': len(audio_data)
                                    }))
                                    
                                    # 蓝色console输出，显示转语音完成和耗时
                                    print(f"\033[34m[TTS] 文本转语音完成，耗时: {elapsed_time:.2f}秒，音频大小: {len(audio_data)} 字节，情绪: {emotion}\033[0m")
                                else:
                                    await websocket.send(json.dumps({
                                        'type': 'error',
                                        'message': '语音生成失败'
                                    }))
                        except Exception as e:
                            # 处理其他异常
                            logger.error(f"TTS 处理异常: {e}")
                            import traceback
                            logger.error(f"详细错误信息:\n{traceback.format_exc()}")
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': f'TTS 处理失败: {str(e)}'
                            }))
                    
                    elif request_type == 'list_voices':
                        # 获取可用音色列表（使用缓存）
                        try:
                            chinese_voices = await get_edge_voices()
                            
                            if chinese_voices:
                                formatted_voices = [
                                    {
                                        'name': v['Name'],
                                        'short_name': v['ShortName'],
                                        'locale': v['Locale'],
                                        'gender': v.get('Gender', 'Unknown')
                                    }
                                    for v in chinese_voices
                                ]
                            else:
                                # 如果无法获取音色列表，返回默认音色
                                formatted_voices = [{
                                    'name': '默认音色',
                                    'short_name': TTS_DEFAULT_VOICE,
                                    'locale': 'zh-CN',
                                    'gender': 'Unknown'
                                }]
                            
                            await websocket.send(json.dumps({
                                'type': 'voices_list',
                                'voices': formatted_voices
                            }))
                        except Exception as e:
                            logger.error(f"获取音色列表失败: {e}")
                            # 即使失败也返回默认音色，而不是错误
                            await websocket.send(json.dumps({
                                'type': 'voices_list',
                                'voices': [{
                                    'name': '默认音色',
                                    'short_name': TTS_DEFAULT_VOICE,
                                    'locale': 'zh-CN',
                                    'gender': 'Unknown'
                                }]
                            }))
                    
                    elif request_type == 'set_voice':
                        # 设置音色
                        voice = data.get('voice')
                        if voice:
                            set_current_voice(voice)
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
        if not init_coqui_tts():
            logger.error("TTS 引擎初始化失败，请安装 edge-tts 或 TTS")
            logger.info("推荐安装: pip install edge-tts")
            sys.exit(1)
    
    logger.info(f"启动 TTS WebSocket 服务器: ws://{TTS_HOST}:{TTS_PORT}")
    
    # 增加 keepalive 设置，避免长时间处理时连接断开
    async with websockets.serve(
        handle_tts_request, 
        TTS_HOST, 
        TTS_PORT,
        ping_interval=20,  # 每20秒发送一次ping
        ping_timeout=10,   # ping超时时间10秒
        close_timeout=10   # 关闭超时时间10秒
    ):
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

