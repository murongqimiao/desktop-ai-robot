#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
识别结果合并模块
合并中英文识别结果
"""

from typing import Optional, Dict, Any


def merge_results(cn_result: Dict[str, Any], en_result: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    合并中英文识别结果
    
    Args:
        cn_result: 中文识别结果
        en_result: 英文识别结果
    
    Returns:
        合并后的结果，如果两个结果都为空则返回 None
    """
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

