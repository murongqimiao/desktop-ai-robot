#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TTS 引擎管理模块
负责初始化和管理 TTS 引擎（Edge TTS 或 Coqui TTS）
"""

import logging
from typing import Optional

from python.common.config import TTS_DEFAULT_VOICE

logger = logging.getLogger(__name__)

# 全局变量
tts_engine = None
current_voice = None
cached_voices = None  # 缓存的音色列表


def init_edge_tts() -> bool:
    """
    初始化 Edge TTS（推荐方案，支持更多音色和流式输出）
    
    Returns:
        是否初始化成功
    """
    global tts_engine, current_voice
    
    try:
        import edge_tts
        
        logger.info("使用 Edge TTS（支持更多音色和流式输出）")
        tts_engine = edge_tts
        current_voice = TTS_DEFAULT_VOICE
        
        logger.info("Edge TTS 初始化完成")
        return True
        
    except ImportError:
        logger.error("edge-tts 未安装，请运行: pip install edge-tts")
        return False
    except Exception as e:
        logger.error(f"初始化 Edge TTS 失败: {e}")
        return False


def init_coqui_tts(voice_name: Optional[str] = None) -> bool:
    """
    初始化 Coqui TTS 引擎
    
    Args:
        voice_name: 音色名称（可选）
    
    Returns:
        是否初始化成功
    """
    global tts_engine, current_voice
    
    try:
        from TTS.api import TTS
        
        # 如果没有指定音色，使用默认音色
        voice = voice_name or TTS_DEFAULT_VOICE
        
        # 可用的中文模型列表（Coqui TTS 支持的中文模型）
        available_models = {
            'zh-cn-xiaoxiao': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-xiaoyi': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunjian': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunxi': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunyang': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunye': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
            'zh-cn-yunxia': 'tts_models/zh-CN/baker/tacotron2-DDC-GST',
        }
        
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


async def get_edge_voices():
    """
    获取 Edge TTS 音色列表（带缓存）
    
    Returns:
        中文音色列表
    """
    global cached_voices
    
    # 如果已有缓存，直接返回
    if cached_voices is not None:
        return cached_voices
    
    try:
        import edge_tts
        voices = await edge_tts.list_voices()
        chinese_voices = [v for v in voices if v['Locale'].startswith('zh-')]
        cached_voices = chinese_voices
        logger.info(f"获取到 {len(chinese_voices)} 个中文音色")
        return chinese_voices
    except Exception as e:
        logger.warning(f"获取音色列表失败: {e}，使用默认音色")
        return []


def get_engine():
    """获取当前 TTS 引擎"""
    return tts_engine


def get_current_voice() -> Optional[str]:
    """获取当前音色"""
    return current_voice


def set_current_voice(voice: str):
    """设置当前音色"""
    global current_voice
    current_voice = voice

