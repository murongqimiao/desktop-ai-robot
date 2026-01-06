#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ASR 模型管理模块
负责加载和管理 VOSK 模型
"""

import os
import sys
import logging
from vosk import Model
from typing import Optional, Tuple

from python.common.config import ASR_CN_MODEL_PATH, ASR_EN_MODEL_PATH, load_deepseek_token

logger = logging.getLogger(__name__)

# 全局模型实例
cn_model: Optional[Model] = None
en_model: Optional[Model] = None
use_bilingual: bool = False
deepseek_token: Optional[str] = None


def init_models() -> Tuple[bool, bool]:
    """
    初始化 VOSK 模型（支持中英文双语）
    
    Returns:
        (cn_loaded, en_loaded): 中文模型和英文模型是否加载成功
    """
    global cn_model, en_model, use_bilingual, deepseek_token
    
    # 加载 DeepSeek token
    deepseek_token = load_deepseek_token()
    
    cn_loaded = False
    en_loaded = False
    
    # 加载中文模型（必需）
    if not ASR_CN_MODEL_PATH.exists():
        logger.error(f"中文模型路径不存在: {ASR_CN_MODEL_PATH}")
        return False, False
    
    try:
        logger.info(f"正在加载中文模型: {ASR_CN_MODEL_PATH}")
        cn_model = Model(str(ASR_CN_MODEL_PATH))
        cn_loaded = True
        logger.info("中文模型加载完成")
    except Exception as e:
        logger.error(f"加载中文模型失败: {e}")
        return False, False
    
    # 尝试加载英文模型（可选）
    if ASR_EN_MODEL_PATH.exists():
        try:
            logger.info(f"正在加载英文模型: {ASR_EN_MODEL_PATH}")
            en_model = Model(str(ASR_EN_MODEL_PATH))
            en_loaded = True
            use_bilingual = True
            logger.info("英文模型加载完成，启用双语识别模式")
        except Exception as e:
            logger.warning(f"加载英文模型失败: {e}")
            use_bilingual = False
    else:
        logger.warning(f"英文模型不存在: {ASR_EN_MODEL_PATH}")
        logger.warning("将仅使用中文模型。要启用中英文混合识别，请下载英文模型：")
        logger.warning("  wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.22.zip")
        logger.warning("  unzip vosk-model-small-en-us-0.22.zip -d models/")
        use_bilingual = False
    
    return cn_loaded, en_loaded


def get_models() -> Tuple[Optional[Model], Optional[Model], bool]:
    """
    获取已加载的模型
    
    Returns:
        (cn_model, en_model, use_bilingual): 中文模型、英文模型、是否使用双语
    """
    return cn_model, en_model, use_bilingual


def get_deepseek_token() -> Optional[str]:
    """获取 DeepSeek token"""
    return deepseek_token

