#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
句子管理模块
处理断句逻辑，检测完整句子
"""

import time
import re
from typing import Optional

from python.common.config import (
    ASR_SILENCE_TIMEOUT,
    ASR_SENTENCE_END_PATTERNS,
    ASR_MIN_SENTENCE_LENGTH
)


class SentenceManager:
    """句子管理器：处理断句逻辑"""
    
    def __init__(self):
        self.current_sentence = ""  # 当前累积的句子
        self.last_update_time = time.time()  # 最后更新时间
        self.silence_timer = None  # 静音定时器
        
    def add_text(self, text: str) -> Optional[str]:
        """
        添加新的识别文本，返回完整的句子（如果检测到句子结束）
        
        Args:
            text: 新的识别文本
        
        Returns:
            完整的句子（如果检测到句子结束），否则返回 None
        """
        if not text or not text.strip():
            return None
            
        # 更新当前句子
        if self.current_sentence:
            self.current_sentence += " " + text.strip()
        else:
            self.current_sentence = text.strip()
        
        self.last_update_time = time.time()
        
        # 检查是否包含句子结束标志
        for pattern in ASR_SENTENCE_END_PATTERNS:
            if re.search(pattern, self.current_sentence):
                sentence = self.current_sentence.strip()
                self.current_sentence = ""
                if len(sentence) >= ASR_MIN_SENTENCE_LENGTH:
                    return sentence
        
        return None
    
    def check_silence_timeout(self) -> Optional[str]:
        """
        检查静音超时，如果超时返回当前句子
        
        Returns:
            完整的句子（如果超时），否则返回 None
        """
        if not self.current_sentence:
            return None
        
        elapsed = time.time() - self.last_update_time
        if elapsed >= ASR_SILENCE_TIMEOUT:
            sentence = self.current_sentence.strip()
            self.current_sentence = ""
            if len(sentence) >= ASR_MIN_SENTENCE_LENGTH:
                return sentence
        
        return None
    
    def reset(self):
        """重置句子管理器"""
        self.current_sentence = ""
        self.last_update_time = time.time()

