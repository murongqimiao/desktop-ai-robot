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

from python.common.logger import setup_logger
from python.asr.model_manager import get_deepseek_token

logger = setup_logger(__name__)


async def call_deepseek_api_stream(message: str, websocket):
    """
    流式调用 DeepSeek Chat API（SSE）
    
    Args:
        message: 用户输入的消息
        websocket: WebSocket 连接对象
    """
    # 确保 logger 已配置
    if not logger.handlers:
        logger.addHandler(logging.StreamHandler())
        logger.setLevel(logging.INFO)
    
    logger.info(f"[call_deepseek_api_stream] ========== 函数开始执行 ==========")
    logger.info(f"[call_deepseek_api_stream] 用户输入: {message}")
    logger.info(f"[call_deepseek_api_stream] logger 名称: {logger.name}, handlers: {len(logger.handlers)}")
    
    try:
        logger.info(f"[call_deepseek_api_stream] 步骤1: 获取 DeepSeek token...")
        deepseek_token = get_deepseek_token()
        logger.info(f"[call_deepseek_api_stream] 步骤1完成: token = {'已获取' if deepseek_token else 'None'}")
        
        if not deepseek_token:
            logger.warning("[call_deepseek_api_stream] DeepSeek token 未配置，跳过 API 调用")
            logger.warning("[call_deepseek_api_stream] 请检查配置文件: conf/token.json")
            try:
                await websocket.send(json.dumps({
                    'type': 'ai_response_stream_end',
                    'error': 'DeepSeek token 未配置，请检查 conf/token.json 文件'
                }))
                logger.info("[call_deepseek_api_stream] 已发送 token 错误消息到客户端")
            except Exception as e:
                logger.error(f"[call_deepseek_api_stream] 发送 token 错误消息失败: {e}")
            logger.info("[call_deepseek_api_stream] ========== 函数提前返回（token 未配置）==========")
            return
        
        logger.info(f"[call_deepseek_api_stream] 步骤2: DeepSeek token 已加载，token 长度: {len(deepseek_token)}")
        logger.info("[call_deepseek_api_stream] 步骤3: 准备调用 API...")
    except Exception as e:
        logger.error(f"[call_deepseek_api_stream] 函数开始部分出错: {e}", exc_info=True)
        raise
    
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
    
    try:
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
        
        logger.info(f"[call_deepseek_api_stream] 正在调用 DeepSeek API: {url}")
        logger.debug(f"[call_deepseek_api_stream] 请求数据: {json.dumps(data, ensure_ascii=False)}")
        
        logger.info("[call_deepseek_api_stream] 创建 HTTP 客户端...")
        async with httpx.AsyncClient(timeout=60.0) as client:
            logger.info("[call_deepseek_api_stream] 发送 HTTP 请求...")
            async with client.stream('POST', url, headers=headers, json=data) as response:
                logger.info(f"[call_deepseek_api_stream] DeepSeek API 响应状态码: {response.status_code}")
                
                if response.status_code != 200:
                    error_text = await response.aread()
                    error_msg = error_text.decode() if error_text else "未知错误"
                    logger.error(f"[call_deepseek_api_stream] DeepSeek API 调用失败: {response.status_code} - {error_msg}")
                    await safe_send({
                        'type': 'ai_response_stream_end',
                        'error': f'API 调用失败: {response.status_code} - {error_msg}'
                    })
                    return
                
                logger.info("[call_deepseek_api_stream] 步骤8: DeepSeek API 调用成功，开始接收流式响应")
                
                # 发送流开始消息
                logger.info("[call_deepseek_api_stream] 步骤9: 发送流开始消息到客户端...")
                if not await safe_send({
                    'type': 'ai_response_stream_start',
                    'user_input': message
                }):
                    logger.warning("[call_deepseek_api_stream] WebSocket 连接已关闭，停止流式处理")
                    return
                logger.info("[call_deepseek_api_stream] 步骤10: 流开始消息已发送，开始接收流式数据...")
                
                buffer = ""  # 累积文本缓冲区
                chunk_count = 0
                
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    
                    # SSE 格式：data: {...}
                    if line.startswith('data: '):
                        line = line[6:]  # 移除 "data: " 前缀
                        
                        if line.strip() == '[DONE]':
                            logger.info("收到流式响应结束标记 [DONE]")
                            break
                        
                        try:
                            chunk_data = json.loads(line)
                            
                            # 检查是否有错误
                            if 'error' in chunk_data:
                                error_info = chunk_data.get('error', {})
                                error_msg = error_info.get('message', '未知错误') if isinstance(error_info, dict) else str(error_info)
                                logger.error(f"DeepSeek API 返回错误: {error_msg}")
                                await safe_send({
                                    'type': 'ai_response_stream_end',
                                    'error': f'API 错误: {error_msg}'
                                })
                                return
                            
                            choices = chunk_data.get('choices', [])
                            if choices:
                                delta = choices[0].get('delta', {})
                                content = delta.get('content', '')
                                
                                if content:
                                    buffer += content
                                    chunk_count += 1
                                    
                                    # 发送流式片段
                                    if not await safe_send({
                                        'type': 'ai_response_stream',
                                        'chunk': content,
                                        'accumulated': buffer
                                    }):
                                        logger.warning("WebSocket 连接已关闭，停止流式处理")
                                        return
                        except json.JSONDecodeError as e:
                            logger.warning(f"解析 SSE 数据失败: {e}, 行内容: {line[:100]}")
                            continue
                
                logger.info(f"[call_deepseek_api_stream] 步骤11: 流式响应接收完成，共收到 {chunk_count} 个片段，总长度: {len(buffer)} 字符")
                
                # 发送流结束消息
                logger.info("[call_deepseek_api_stream] 步骤12: 发送流结束消息到客户端...")
                await safe_send({
                    'type': 'ai_response_stream_end',
                    'full_text': buffer
                })
                
                logger.info(f"[call_deepseek_api_stream] ========== 函数执行完成: {len(buffer)} 字符 ==========")
                
    except httpx.TimeoutException:
        logger.error("[call_deepseek_api_stream] DeepSeek API 调用超时")
        await safe_send({
            'type': 'ai_response_stream_end',
            'error': 'API 调用超时'
        })
    except Exception as e:
        logger.error(f"[call_deepseek_api_stream] DeepSeek API 调用异常: {e}", exc_info=True)
        # 检查是否是 WebSocket 连接关闭异常
        error_str = str(e)
        if 'ConnectionClosed' in error_str or '1005' in error_str:
            logger.warning("[call_deepseek_api_stream] WebSocket 连接已关闭，忽略异常")
            return
        try:
            await safe_send({
                'type': 'ai_response_stream_end',
                'error': f'API 调用异常: {str(e)}'
            })
        except Exception as send_error:
            logger.error(f"[call_deepseek_api_stream] 发送错误消息失败: {send_error}")

