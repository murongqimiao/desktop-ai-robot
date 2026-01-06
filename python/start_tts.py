#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TTS 服务器启动脚本
"""

import sys
import os

# 添加项目根目录到 Python 路径
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

# 导入并运行 TTS 服务器
from python.tts.server import main
import asyncio

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("TTS 服务器已停止")
    except Exception as e:
        print(f"TTS 服务器错误: {e}")
        sys.exit(1)

