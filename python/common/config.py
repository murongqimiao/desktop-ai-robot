#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
配置管理模块
统一管理项目配置，包括路径、API token 等
"""

import os
import json
import logging
from typing import Optional
from pathlib import Path

logger = logging.getLogger(__name__)

# 项目根目录（相对于此文件的路径）
PROJECT_ROOT = Path(__file__).parent.parent.parent.absolute()

# 模型目录
MODELS_DIR = PROJECT_ROOT / 'models'

# 配置文件目录
CONF_DIR = PROJECT_ROOT / 'conf'

# ASR 模型路径
ASR_CN_MODEL_PATH = MODELS_DIR / 'vosk-model-small-cn-0.22'
ASR_EN_MODEL_PATH = MODELS_DIR / 'vosk-model-small-en-us-0.22'

# ASR 配置
ASR_SAMPLE_RATE = 16000  # VOSK 模型要求的采样率
ASR_SILENCE_TIMEOUT = 2.0  # 静音超时时间（秒）
ASR_SENTENCE_END_PATTERNS = [r'[。！？]', r'[.!?]']  # 句子结束标志
ASR_MIN_SENTENCE_LENGTH = 2  # 最小句子长度（字符数）

# ASR 服务器配置
ASR_HOST = 'localhost'
ASR_PORT = 8765

# TTS 配置
TTS_HOST = 'localhost'
TTS_PORT = 8766
TTS_DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural'  # 默认音色

# DeepSeek API 配置
DEEPSEEK_TOKEN_FILE = CONF_DIR / 'token.json'


def load_deepseek_token() -> Optional[str]:
    """从配置文件加载 DeepSeek token"""
    try:
        if DEEPSEEK_TOKEN_FILE.exists():
            with open(DEEPSEEK_TOKEN_FILE, 'r', encoding='utf-8') as f:
                config = json.load(f)
                token = config.get('deepseek_token')
                if token:
                    logger.info("DeepSeek token 加载成功")
                    return token
                else:
                    logger.warning("DeepSeek token 未在配置文件中找到")
        else:
            logger.warning(f"配置文件不存在: {DEEPSEEK_TOKEN_FILE}")
    except Exception as e:
        logger.error(f"加载 DeepSeek token 失败: {e}")
    
    return None


def get_model_path(model_name: str) -> Path:
    """获取模型路径"""
    return MODELS_DIR / model_name


def ensure_dirs():
    """确保必要的目录存在"""
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    CONF_DIR.mkdir(parents=True, exist_ok=True)

