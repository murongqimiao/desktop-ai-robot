# Python 环境设置指南

本项目集成了基于 Python + VOSK 的离线中文语音识别功能。

## 前置要求

1. **Python 3.7+** 已安装
2. **VOSK 中文模型** 已下载到 `models/vosk-model-small-cn-0.22/` 目录

## 安装步骤

### 1. 安装 Python 依赖

```bash
pip3 install -r requirements.txt
```

或者使用虚拟环境（推荐）：

```bash
# 创建虚拟环境
python3 -m venv venv

# 激活虚拟环境
# macOS/Linux:
source venv/bin/activate
# Windows:
# venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt
```

### 2. 验证模型文件

确保模型文件存在于以下路径：
```
models/vosk-model-small-cn-0.22/
```

如果模型不存在，请运行：
```bash
./download-model.sh
```

### 3. 测试 Python ASR 服务

可以手动测试 Python 服务是否正常：

```bash
python3 asr_server.py
```

如果看到 "ASR 服务器已启动，等待连接..." 说明服务正常。

## 功能说明

- **自动启动**: 运行 `npm start` 时，Electron 会自动启动 Python ASR 服务
- **WebSocket 通信**: Python 服务监听 `localhost:8765` 端口
- **麦克风权限**: 首次使用时，浏览器会请求麦克风权限
- **点击激活**: 点击窗口后，自动开始录音，10秒后自动停止
- **实时识别**: 识别结果会实时显示在控制台，并触发机器人"说话"动画

## 故障排除

### Python 服务无法启动

1. 检查 Python 版本：`python3 --version`（需要 3.7+）
2. 检查依赖是否安装：`pip3 list | grep vosk`
3. 检查模型路径是否正确

### 无法连接 WebSocket

1. 检查 Python 服务是否正在运行
2. 检查端口 8765 是否被占用
3. 查看 Electron 控制台的错误信息

### 无法访问麦克风

1. 检查浏览器/系统麦克风权限
2. 确保麦克风设备正常工作
3. 检查是否有其他应用占用麦克风

## 技术细节

- **采样率**: 16000 Hz
- **音频格式**: PCM 16-bit 单声道
- **通信协议**: WebSocket (ws://localhost:8765)
- **识别引擎**: VOSK (离线，无需网络)

