#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
VOSK ASR 服务器
提供 WebSocket 服务，接收音频数据并返回识别结果
"""

import json
import sys
import os
import asyncio
import websockets
import httpx
import time
import re
from vosk import Model, KaldiRecognizer
from typing import Optional, List
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 模型路径配置
CN_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'vosk-model-small-cn-0.22')
EN_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'vosk-model-small-en-us-0.22')
SAMPLE_RATE = 16000  # VOSK 模型要求的采样率

# 全局变量
cn_model = None
en_model = None
use_bilingual = False  # 是否使用双语模式
deepseek_token = None  # DeepSeek API token

# 断句配置
SILENCE_TIMEOUT = 2.0  # 静音超时时间（秒），超过此时间认为用户说完了
SENTENCE_END_PATTERNS = [r'[。！？]', r'[.!?]']  # 句子结束标志
MIN_SENTENCE_LENGTH = 2  # 最小句子长度（字符数）

def load_deepseek_token():
    """从配置文件加载 DeepSeek token"""
    global deepseek_token
    token_path = os.path.join(os.path.dirname(__file__), 'conf', 'token.json')
    
    try:
        if os.path.exists(token_path):
            with open(token_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
                deepseek_token = config.get('deepseek_token')
                if deepseek_token:
                    logger.info("DeepSeek token 加载成功")
                else:
                    logger.warning("DeepSeek token 未在配置文件中找到")
        else:
            logger.warning(f"配置文件不存在: {token_path}")
    except Exception as e:
        logger.error(f"加载 DeepSeek token 失败: {e}")

def init_model():
    """初始化 VOSK 模型（支持中英文双语）"""
    global cn_model, en_model, use_bilingual
    
    # 加载 DeepSeek token
    load_deepseek_token()
    
    # 加载中文模型（必需）
    if not os.path.exists(CN_MODEL_PATH):
        logger.error(f"中文模型路径不存在: {CN_MODEL_PATH}")
        sys.exit(1)
    
    logger.info(f"正在加载中文模型: {CN_MODEL_PATH}")
    cn_model = Model(CN_MODEL_PATH)
    logger.info("中文模型加载完成")
    
    # 尝试加载英文模型（可选）
    if os.path.exists(EN_MODEL_PATH):
        logger.info(f"正在加载英文模型: {EN_MODEL_PATH}")
        en_model = Model(EN_MODEL_PATH)
        use_bilingual = True
        logger.info("英文模型加载完成，启用双语识别模式")
    else:
        logger.warning(f"英文模型不存在: {EN_MODEL_PATH}")
        logger.warning("将仅使用中文模型。要启用中英文混合识别，请下载英文模型：")
        logger.warning("  wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.22.zip")
        logger.warning("  unzip vosk-model-small-en-us-0.22.zip -d models/")
        use_bilingual = False

def merge_results(cn_result, en_result):
    """合并中英文识别结果"""
    cn_text = cn_result.get('text', '').strip()
    en_text = en_result.get('text', '').strip()
    cn_confidence = cn_result.get('confidence', 0) if 'confidence' in cn_result else 0
    en_confidence = en_result.get('confidence', 0) if 'confidence' in en_result else 0
    
    # 如果只有一个结果，直接返回
    if not cn_text and not en_text:
        return None
    if not cn_text:
        return en_result
    if not en_text:
        return cn_result
    
    # 两个结果都存在，根据置信度选择或合并
    # 如果英文结果置信度明显更高，且包含常见英文单词，优先使用英文
    common_english_words = ['curl', 'get', 'post', 'http', 'api', 'json', 'code', 'file', 'dir', 'cd', 'ls', 'pwd']
    has_english_word = any(word in en_text.lower() for word in common_english_words)
    
    if has_english_word and en_confidence > cn_confidence * 0.7:
        # 英文结果更可信
        return en_result
    elif cn_confidence > en_confidence * 0.7:
        # 中文结果更可信
        return cn_result
    else:
        # 置信度相近，合并结果（优先中文，补充英文）
        # 简单策略：如果英文结果很短且是单词，可能是英文单词，合并进去
        if len(en_text.split()) <= 2 and en_text.isalpha():
            merged_text = f"{cn_text} {en_text}" if cn_text else en_text
        else:
            merged_text = cn_text if cn_confidence >= en_confidence else en_text
        
        return {
            'text': merged_text.strip(),
            'confidence': max(cn_confidence, en_confidence)
        }

class SentenceManager:
    """句子管理器：处理断句逻辑"""
    
    def __init__(self):
        self.current_sentence = ""  # 当前累积的句子
        self.last_update_time = time.time()  # 最后更新时间
        self.silence_timer = None  # 静音定时器
        
    def add_text(self, text: str) -> Optional[str]:
        """添加新的识别文本，返回完整的句子（如果检测到句子结束）"""
        if not text or not text.strip():
            return None
            
        # 更新当前句子
        if self.current_sentence:
            self.current_sentence += " " + text.strip()
        else:
            self.current_sentence = text.strip()
        
        self.last_update_time = time.time()
        
        # 检查是否包含句子结束标志
        for pattern in SENTENCE_END_PATTERNS:
            if re.search(pattern, self.current_sentence):
                sentence = self.current_sentence.strip()
                self.current_sentence = ""
                if len(sentence) >= MIN_SENTENCE_LENGTH:
                    return sentence
        
        return None
    
    def check_silence_timeout(self) -> Optional[str]:
        """检查静音超时，如果超时返回当前句子"""
        if not self.current_sentence:
            return None
        
        elapsed = time.time() - self.last_update_time
        if elapsed >= SILENCE_TIMEOUT:
            sentence = self.current_sentence.strip()
            self.current_sentence = ""
            if len(sentence) >= MIN_SENTENCE_LENGTH:
                return sentence
        
        return None
    
    def reset(self):
        """重置句子管理器"""
        self.current_sentence = ""
        self.last_update_time = time.time()

async def call_deepseek_api(message: str) -> Optional[str]:
    """调用 DeepSeek Chat API"""
    if not deepseek_token:
        logger.warning("DeepSeek token 未配置，跳过 API 调用")
        return None
    
    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {deepseek_token}"
    }
    
    data = {
        "model": "deepseek-chat",
        "messages": [
            {
                "role": "user",
                "content": message
            }
        ],
        "temperature": 0.7,
        "max_tokens": 2000
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=data)
            if response.status_code == 200:
                result = response.json()
                content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
                logger.info(f"DeepSeek API 响应成功: {content[:100]}...")
                return content
            else:
                logger.error(f"DeepSeek API 调用失败: {response.status_code} - {response.text}")
                return None
    except httpx.TimeoutException:
        logger.error("DeepSeek API 调用超时")
        return None
    except Exception as e:
        logger.error(f"DeepSeek API 调用异常: {e}")
        return None

async def handle_audio(websocket):
    """处理音频数据（支持中英文双语识别）"""
    logger.info(f"新客户端连接: {websocket.remote_address}")
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
                # 调用 DeepSeek API
                response = await call_deepseek_api(complete_sentence)
                if response:
                    await websocket.send(json.dumps({
                        'type': 'ai_response',
                        'user_input': complete_sentence,
                        'response': response
                    }))
                else:
                    await websocket.send(json.dumps({
                        'type': 'sentence_complete',
                        'text': complete_sentence
                    }))
    
    try:
        async for message in websocket:
            try:
                # 接收音频数据（PCM 格式，16-bit，单声道）
                if isinstance(message, bytes):
                    # 二进制音频数据
                    if current_cn_recognizer is None:
                        current_cn_recognizer = KaldiRecognizer(cn_model, SAMPLE_RATE)
                        current_cn_recognizer.SetWords(True)
                    
                    if use_bilingual and current_en_recognizer is None:
                        current_en_recognizer = KaldiRecognizer(en_model, SAMPLE_RATE)
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
                                
                                # 如果检测到完整句子，调用 DeepSeek API
                                if complete_sentence:
                                    logger.info(f"检测到完整句子: {complete_sentence}")
                                    response = await call_deepseek_api(complete_sentence)
                                    if response:
                                        await websocket.send(json.dumps({
                                            'type': 'ai_response',
                                            'user_input': complete_sentence,
                                            'response': response
                                        }))
                                    else:
                                        await websocket.send(json.dumps({
                                            'type': 'sentence_complete',
                                            'text': complete_sentence
                                        }))
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
                                
                                # 如果检测到完整句子，调用 DeepSeek API
                                if complete_sentence:
                                    logger.info(f"检测到完整句子: {complete_sentence}")
                                    response = await call_deepseek_api(complete_sentence)
                                    if response:
                                        await websocket.send(json.dumps({
                                            'type': 'ai_response',
                                            'user_input': complete_sentence,
                                            'response': response
                                        }))
                                    else:
                                        await websocket.send(json.dumps({
                                            'type': 'sentence_complete',
                                            'text': complete_sentence
                                        }))
                        elif cn_partial:
                            await websocket.send(json.dumps({
                                'type': 'partial',
                                'text': cn_partial
                            }))
                            
                elif isinstance(message, str):
                    # JSON 控制消息
                    data = json.loads(message)
                    if data.get('type') == 'start':
                        current_cn_recognizer = KaldiRecognizer(cn_model, SAMPLE_RATE)
                        current_cn_recognizer.SetWords(True)
                        
                        if use_bilingual:
                            current_en_recognizer = KaldiRecognizer(en_model, SAMPLE_RATE)
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
                            
                            # 如果有完整句子，调用 DeepSeek API
                            if complete_sentence and len(complete_sentence) >= MIN_SENTENCE_LENGTH:
                                logger.info(f"处理最终完整句子: {complete_sentence}")
                                response = await call_deepseek_api(complete_sentence)
                                if response:
                                    await websocket.send(json.dumps({
                                        'type': 'ai_response',
                                        'user_input': complete_sentence,
                                        'response': response
                                    }))
                                else:
                                    await websocket.send(json.dumps({
                                        'type': 'sentence_complete',
                                        'text': complete_sentence
                                    }))
                        
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
    init_model()
    
    # 启动 WebSocket 服务器
    host = 'localhost'
    port = 8765
    
    mode_info = "中英文双语" if use_bilingual else "中文"
    logger.info(f"启动 WebSocket 服务器: ws://{host}:{port} ({mode_info}模式)")
    
    async with websockets.serve(handle_audio, host, port):
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

