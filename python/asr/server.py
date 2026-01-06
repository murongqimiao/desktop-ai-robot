#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VOSK ASR 服务器
提供 WebSocket 服务，接收音频数据并返回识别结果
"""

import json
import sys
import asyncio
import websockets
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError
from vosk import KaldiRecognizer
import logging

from python.common.logger import setup_logger
from python.common.config import ASR_HOST, ASR_PORT, ASR_SAMPLE_RATE, ASR_MIN_SENTENCE_LENGTH
from python.asr.model_manager import init_models, get_models
from python.asr.sentence_manager import SentenceManager
from python.asr.result_merger import merge_results
from python.asr.ai_client import call_deepseek_api_stream

# 配置日志
logger = setup_logger(__name__)


async def handle_audio(websocket):
    """处理音频数据（支持中英文双语识别）"""
    logger.info(f"新客户端连接: {websocket.remote_address}")
    
    cn_model, en_model, use_bilingual = get_models()
    if not cn_model:
        logger.error("中文模型未加载，无法处理音频")
        return
    
    current_cn_recognizer = None
    current_en_recognizer = None
    sentence_manager = SentenceManager()
    silence_check_task = None
    
    async def check_silence_periodically():
        """定期检查静音超时"""
        while True:
            await asyncio.sleep(0.5)  # 每0.5秒检查一次
            complete_sentence = sentence_manager.check_silence_timeout()
            if complete_sentence:
                logger.info(f"检测到静音超时，完整句子: {complete_sentence}")
                # 流式调用 DeepSeek API
                asyncio.create_task(call_deepseek_api_stream(complete_sentence, websocket))
    
    try:
        async for message in websocket:
            try:
                # 接收音频数据（PCM 格式，16-bit，单声道）
                if isinstance(message, bytes):
                    # 二进制音频数据
                    if current_cn_recognizer is None:
                        current_cn_recognizer = KaldiRecognizer(cn_model, ASR_SAMPLE_RATE)
                        current_cn_recognizer.SetWords(True)
                    
                    if use_bilingual and en_model and current_en_recognizer is None:
                        current_en_recognizer = KaldiRecognizer(en_model, ASR_SAMPLE_RATE)
                        current_en_recognizer.SetWords(True)
                    
                    # 使用中文模型识别
                    cn_final = False
                    cn_result = None
                    cn_partial = None
                    
                    if current_cn_recognizer.AcceptWaveform(message):
                        cn_result = json.loads(current_cn_recognizer.Result())
                        cn_final = True
                    else:
                        cn_partial_data = json.loads(current_cn_recognizer.PartialResult())
                        cn_partial = cn_partial_data.get('partial', '')
                    
                    # 如果启用双语模式，同时使用英文模型识别
                    if use_bilingual and current_en_recognizer:
                        en_final = False
                        en_result = None
                        en_partial = None
                        
                        if current_en_recognizer.AcceptWaveform(message):
                            en_result = json.loads(current_en_recognizer.Result())
                            en_final = True
                        else:
                            en_partial_data = json.loads(current_en_recognizer.PartialResult())
                            en_partial = en_partial_data.get('partial', '')
                        
                        # 合并结果
                        if cn_final or en_final:
                            # 最终结果
                            merged = merge_results(cn_result or {}, en_result or {})
                            if merged and merged.get('text'):
                                text = merged['text']
                                logger.info(f"识别结果 (双语): {text}")
                                
                                # 添加到句子管理器并检查是否完成句子
                                complete_sentence = sentence_manager.add_text(text)
                                
                                await websocket.send(json.dumps({
                                    'type': 'result',
                                    'text': text
                                }))
                                
                                # 如果检测到完整句子，流式调用 DeepSeek API
                                if complete_sentence:
                                    logger.info(f"检测到完整句子: {complete_sentence}")
                                    asyncio.create_task(call_deepseek_api_stream(complete_sentence, websocket))
                        elif cn_partial or en_partial:
                            # 部分结果 - 优先显示有内容的
                            partial_text = cn_partial if cn_partial else en_partial
                            if partial_text:
                                await websocket.send(json.dumps({
                                    'type': 'partial',
                                    'text': partial_text
                                }))
                    else:
                        # 仅中文模式
                        if cn_final:
                            if cn_result.get('text'):
                                text = cn_result['text']
                                logger.info(f"识别结果 (中文): {text}")
                                
                                # 添加到句子管理器并检查是否完成句子
                                complete_sentence = sentence_manager.add_text(text)
                                
                                await websocket.send(json.dumps({
                                    'type': 'result',
                                    'text': text
                                }))
                                
                                # 如果检测到完整句子，流式调用 DeepSeek API
                                if complete_sentence:
                                    logger.info(f"检测到完整句子: {complete_sentence}")
                                    asyncio.create_task(call_deepseek_api_stream(complete_sentence, websocket))
                        elif cn_partial:
                            await websocket.send(json.dumps({
                                'type': 'partial',
                                'text': cn_partial
                            }))
                            
                elif isinstance(message, str):
                    # JSON 控制消息
                    data = json.loads(message)
                    if data.get('type') == 'start':
                        current_cn_recognizer = KaldiRecognizer(cn_model, ASR_SAMPLE_RATE)
                        current_cn_recognizer.SetWords(True)
                        
                        if use_bilingual and en_model:
                            current_en_recognizer = KaldiRecognizer(en_model, ASR_SAMPLE_RATE)
                            current_en_recognizer.SetWords(True)
                        
                        # 重置句子管理器
                        sentence_manager.reset()
                        
                        # 启动静音检测任务
                        if silence_check_task is None:
                            silence_check_task = asyncio.create_task(check_silence_periodically())
                        
                        await websocket.send(json.dumps({'type': 'ready'}))
                        mode = "双语" if use_bilingual else "中文"
                        logger.info(f"识别器已就绪 ({mode}模式)")
                    elif data.get('type') == 'stop':
                        # 获取最终结果
                        final_text = None
                        
                        if current_cn_recognizer:
                            cn_final = json.loads(current_cn_recognizer.FinalResult())
                            final_text = cn_final.get('text', '')
                        
                        if use_bilingual and current_en_recognizer:
                            en_final = json.loads(current_en_recognizer.FinalResult())
                            en_text = en_final.get('text', '')
                            if en_text:
                                merged = merge_results(
                                    {'text': final_text} if final_text else {},
                                    {'text': en_text}
                                )
                                if merged:
                                    final_text = merged.get('text', '')
                        
                        if final_text:
                            logger.info(f"最终识别结果: {final_text}")
                            
                            # 添加到句子管理器
                            complete_sentence = sentence_manager.add_text(final_text)
                            
                            # 如果当前还有未完成的句子，也处理它
                            if not complete_sentence and sentence_manager.current_sentence:
                                complete_sentence = sentence_manager.current_sentence.strip()
                                sentence_manager.reset()
                            
                            await websocket.send(json.dumps({
                                'type': 'final',
                                'text': final_text
                            }))
                            
                            # 如果有完整句子，流式调用 DeepSeek API
                            if complete_sentence and len(complete_sentence) >= ASR_MIN_SENTENCE_LENGTH:
                                logger.info(f"处理最终完整句子: {complete_sentence}")
                                asyncio.create_task(call_deepseek_api_stream(complete_sentence, websocket))
                        
                        # 停止静音检测任务
                        if silence_check_task:
                            silence_check_task.cancel()
                            try:
                                await silence_check_task
                            except asyncio.CancelledError:
                                pass
                            silence_check_task = None
                        
                        sentence_manager.reset()
                        current_cn_recognizer = None
                        current_en_recognizer = None
                        
            except json.JSONDecodeError as e:
                logger.error(f"JSON 解析错误: {e}")
            except Exception as e:
                logger.error(f"处理消息时出错: {e}")
                
    except websockets.exceptions.ConnectionClosed:
        logger.info(f"客户端断开连接: {websocket.remote_address}")
    except Exception as e:
        logger.error(f"连接错误: {e}")
    finally:
        # 停止静音检测任务
        if silence_check_task:
            silence_check_task.cancel()
            try:
                await silence_check_task
            except asyncio.CancelledError:
                pass
        
        sentence_manager.reset()
        current_cn_recognizer = None
        current_en_recognizer = None


async def main():
    """主函数"""
    # 初始化模型
    cn_loaded, en_loaded = init_models()
    if not cn_loaded:
        logger.error("中文模型加载失败，服务器无法启动")
        sys.exit(1)
    
    # 启动 WebSocket 服务器
    cn_model, en_model, use_bilingual = get_models()
    mode_info = "中英文双语" if use_bilingual else "中文"
    logger.info(f"启动 WebSocket 服务器: ws://{ASR_HOST}:{ASR_PORT} ({mode_info}模式)")
    
    async with websockets.serve(handle_audio, ASR_HOST, ASR_PORT):
        logger.info("ASR 服务器已启动，等待连接...")
        await asyncio.Future()  # 永久运行


if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("服务器已停止")
    except Exception as e:
        logger.error(f"服务器错误: {e}")
        sys.exit(1)

