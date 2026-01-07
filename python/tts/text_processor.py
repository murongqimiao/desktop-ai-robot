#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
文本处理模块
处理文本清理、表情包检测、情绪提取等功能
"""

import re
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)

# 需要屏蔽的特殊字符（不发出声音）
# 注意：保留常用标点符号（。！？；，、：）用于断句
# 注意：保留括号 () 因为可能用于说明，只移除特殊符号
SPECIAL_CHARS_TO_REMOVE = r'[*#@$%^&_+=\[\]{}|\\:";\'<>?./`~]'

# 表情包到情绪的映射
EMOJI_TO_EMOTION = {
    # 开心类
    '😀': 'happy', '😃': 'happy', '😄': 'happy', '😁': 'happy', '😆': 'happy',
    '😊': 'happy', '😍': 'happy', '🥰': 'happy', '😘': 'happy', '😗': 'happy',
    '😙': 'happy', '😚': 'happy', '🙂': 'happy', '🤗': 'happy', '🤩': 'happy',
    '😎': 'happy', '🥳': 'happy', '😋': 'happy', '😛': 'happy', '😜': 'happy',
    '🤪': 'happy', '😝': 'happy', '🤑': 'happy', '🤗': 'happy',
    
    # 难过类
    '😢': 'sad', '😭': 'sad', '😤': 'sad', '😠': 'sad', '😡': 'sad',
    '🤬': 'sad', '😞': 'sad', '😟': 'sad', '😕': 'sad', '🙁': 'sad',
    '☹️': 'sad', '😣': 'sad', '😖': 'sad', '😫': 'sad', '😩': 'sad',
    '🥺': 'sad', '😦': 'sad', '😧': 'sad', '😨': 'sad', '😰': 'sad',
    '😥': 'sad', '😓': 'sad', '🤕': 'sad', '🤒': 'sad',
    
    # 思考类
    '🤔': 'thinking', '🧐': 'thinking', '🤓': 'thinking', '🤨': 'thinking',
    '😐': 'thinking', '😑': 'thinking', '😶': 'thinking', '😏': 'thinking',
    
    # 狡猾类
    '😏': 'cunning', '😒': 'cunning', '🙄': 'cunning', '😬': 'cunning',
    '🤥': 'cunning', '😈': 'cunning', '👿': 'cunning', '💀': 'cunning',
    
    # 正常类（中性表情）
    '😐': 'normal', '😑': 'normal', '😶': 'normal', '🙂': 'normal',
}

# 表情包正则表达式（匹配常见表情包）
# 注意：移除了 [\U000024C2-\U0001F251] 范围，因为它包含了中文字符范围
EMOJI_PATTERN = re.compile(
    r'[\U0001F600-\U0001F64F]'  # 表情符号 (Emoticons)
    r'|[\U0001F300-\U0001F5FF]'  # 符号和象形文字 (Misc Symbols and Pictographs)
    r'|[\U0001F680-\U0001F6FF]'  # 交通和地图符号 (Transport and Map)
    r'|[\U0001F1E0-\U0001F1FF]'  # 旗帜 (Flags)
    r'|[\U00002702-\U000027B0]'  # 其他符号 (Dingbats)
    r'|[\U0001F900-\U0001F9FF]'  # 补充符号和象形文字 (Supplemental Symbols and Pictographs)
    r'|[\U0001FA00-\U0001FA6F]'  # 扩展符号 (Extended-A)
    r'|[\U0001FA70-\U0001FAFF]'  # 扩展符号 (Extended-B)
    r'|[\U00002600-\U000026FF]'  # 杂项符号 (Misc Symbols)
    r'|[\U00002700-\U000027BF]'  # 装饰符号 (Dingbats)
    r'|[\U0001F018-\U0001F270]'  # 补充符号 (Enclosed Alphanumeric Supplement)
)


def clean_text(text: str) -> str:
    """
    清理文本：移除特殊字符
    
    Args:
        text: 原始文本
    
    Returns:
        清理后的文本
    """
    
    # 移除特殊字符
    cleaned = re.sub(SPECIAL_CHARS_TO_REMOVE, '', text)
    
    # 移除多余空格
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = cleaned.strip()
    return cleaned


def extract_emotion_from_text(text: str) -> str:
    """
    从文本中提取情绪（基于表情包）
    
    Args:
        text: 文本内容
    
    Returns:
        情绪类型：'happy', 'sad', 'thinking', 'cunning', 'normal'
    """
    # 查找文本中的表情包
    emotions_found = []
    for emoji, emotion in EMOJI_TO_EMOTION.items():
        if emoji in text:
            emotions_found.append(emotion)
    
    # 如果找到多个情绪，优先返回第一个
    if emotions_found:
        return emotions_found[0]
    
    # 默认返回 normal
    return 'normal'


def remove_emojis(text: str) -> str:
    """
    移除文本中的表情包
    
    Args:
        text: 原始文本
    
    Returns:
        移除表情包后的文本
    """
    
    # 移除所有表情包
    cleaned = EMOJI_PATTERN.sub('', text)
    
    # 移除多余空格
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = cleaned.strip()
    return cleaned


def process_text(text: str) -> Tuple[str, str]:
    """
    处理文本：清理、移除表情包、提取情绪
    
    Args:
        text: 原始文本
    
    Returns:
        (清理后的文本, 情绪)
    """
    
    # 提取情绪（在移除表情包之前）
    emotion = extract_emotion_from_text(text)
    
    # 移除表情包
    text_without_emoji = remove_emojis(text)
    
    # 清理特殊字符
    cleaned_text = clean_text(text_without_emoji)
    
    return cleaned_text, emotion

