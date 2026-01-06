#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 客户端模块
处理与 DeepSeek API 的流式通信
"""

import json
import logging
import httpx
from typing import Optional
from websockets.exceptions import ConnectionClosedOK, ConnectionClosedError

from python.asr.model_manager import get_deepseek_token

logger = logging.getLogger(__name__)


async def call_deepseek_api_stream(message: str, websocket):
    """
    流式调用 DeepSeek Chat API（SSE）
    
    Args:
        message: 用户输入的消息
        websocket: WebSocket 连接对象
    """
    deepseek_token = get_deepseek_token()
    
    if not deepseek_token:
        logger.warning("DeepSeek token 未配置，跳过 API 调用")
        try:
            await websocket.send(json.dumps({
                'type': 'ai_response_stream_end',
                'error': 'DeepSeek token 未配置'
            }))
        except Exception:
            pass  # WebSocket 可能已关闭，忽略错误
        return
    
    # 辅助函数：安全发送 WebSocket 消息
    async def safe_send(data):
        try:
            # 检查 WebSocket 是否仍然打开
            if hasattr(websocket, 'closed') and websocket.closed:
                return False
            await websocket.send(json.dumps(data))
            return True
        except (ConnectionError, RuntimeError, ConnectionClosedOK, ConnectionClosedError) as e:
            logger.debug(f"WebSocket 连接已关闭，无法发送消息: {e}")
            return False
        except Exception as e:
            # 检查是否是连接关闭相关的异常
            error_str = str(type(e).__name__)
            if 'ConnectionClosed' in error_str or '1005' in str(e):
                logger.debug(f"WebSocket 连接已关闭: {e}")
                return False
            logger.warning(f"发送 WebSocket 消息失败: {e}")
            return False
    
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
        "max_tokens": 2000,
        "stream": True  # 启用流式响应
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream('POST', url, headers=headers, json=data) as response:
                if response.status_code != 200:
                    error_text = await response.aread()
                    logger.error(f"DeepSeek API 调用失败: {response.status_code} - {error_text.decode()}")
                    await safe_send({
                        'type': 'ai_response_stream_end',
                        'error': f'API 调用失败: {response.status_code}'
                    })
                    return
                
                # 发送流开始消息
                if not await safe_send({
                    'type': 'ai_response_stream_start',
                    'user_input': message
                }):
                    logger.warning("WebSocket 连接已关闭，停止流式处理")
                    return
                
                buffer = ""  # 累积文本缓冲区
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    
                    # SSE 格式：data: {...}
                    if line.startswith('data: '):
                        line = line[6:]  # 移除 "data: " 前缀
                        
                        if line.strip() == '[DONE]':
                            break
                        
                        try:
                            chunk_data = json.loads(line)
                            choices = chunk_data.get('choices', [])
                            if choices:
                                delta = choices[0].get('delta', {})
                                content = delta.get('content', '')
                                
                                if content:
                                    buffer += content
                                    
                                    # 发送流式片段
                                    if not await safe_send({
                                        'type': 'ai_response_stream',
                                        'chunk': content,
                                        'accumulated': buffer
                                    }):
                                        logger.warning("WebSocket 连接已关闭，停止流式处理")
                                        return
                        except json.JSONDecodeError:
                            continue
                
                # 发送流结束消息
                await safe_send({
                    'type': 'ai_response_stream_end',
                    'full_text': buffer
                })
                
                logger.info(f"DeepSeek API 流式响应完成: {len(buffer)} 字符")
                
    except httpx.TimeoutException:
        logger.error("DeepSeek API 调用超时")
        await safe_send({
            'type': 'ai_response_stream_end',
            'error': 'API 调用超时'
        })
    except Exception as e:
        logger.error(f"DeepSeek API 调用异常: {e}")
        # 检查是否是 WebSocket 连接关闭异常
        error_str = str(e)
        if 'ConnectionClosed' in error_str or '1005' in error_str:
            logger.warning("WebSocket 连接已关闭，忽略异常")
            return
        try:
            await safe_send({
                'type': 'ai_response_stream_end',
                'error': f'API 调用异常: {str(e)}'
            })
        except Exception:
            pass  # 如果发送失败，忽略

