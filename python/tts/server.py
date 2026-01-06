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
                        
                        if not text:
                            await websocket.send(json.dumps({
                                'type': 'error',
                                'message': '文本内容为空'
                            }))
                            continue
                        
                        logger.info(f"收到 TTS 请求: {text[:50]}... (音色: {voice or '默认'})")
                        
                        # 使用 Edge TTS（推荐）或 Coqui TTS
                        try:
                            import edge_tts
                            tts_engine = get_engine()
                            if tts_engine == edge_tts:
                                # Edge TTS - 流式发送
                                await text_to_speech_edge_stream(text, voice, websocket)
                            else:
                                # Coqui TTS - 非流式
                                audio_data = await text_to_speech_coqui(text, voice)
                                if audio_data:
                                    await websocket.send(json.dumps({
                                        'type': 'audio_start',
                                        'total_size': len(audio_data),
                                        'format': 'wav'
                                    }))
                                    await websocket.send(audio_data)
                                    await websocket.send(json.dumps({
                                        'type': 'audio_end'
                                    }))
                                else:
                                    await websocket.send(json.dumps({
                                        'type': 'error',
                                        'message': '语音生成失败'
                                    }))
                        except:
                            # Coqui TTS
                            audio_data = await text_to_speech_coqui(text, voice)
                            if audio_data:
                                await websocket.send(json.dumps({
                                    'type': 'audio_start',
                                    'total_size': len(audio_data),
                                    'format': 'wav'
                                }))
                                await websocket.send(audio_data)
                                await websocket.send(json.dumps({
                                    'type': 'audio_end'
                                }))
                            else:
                                await websocket.send(json.dumps({
                                    'type': 'error',
                                    'message': '语音生成失败'
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

