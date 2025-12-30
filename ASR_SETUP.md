# ASR 语音识别功能设置指南

## 概述

本项目集成了基于 Vosk-Browser 的离线中文语音识别功能。ASR 服务会在用户触摸窗口后 10 秒内激活，如果 10 秒内没有使用，会自动进入休眠状态。

## 安装步骤

### 1. 安装依赖

依赖已经通过 `npm install` 安装完成，包括：
- `vosk-browser`: 前端离线语音识别库

### 2. 下载中文模型

Vosk-Browser 需要下载对应的中文模型文件。推荐使用轻量级模型以平衡性能和效果：

**选项 1：小型中文模型（推荐，约 40MB）**
```bash
# 创建模型目录
mkdir -p models

# 下载小型中文模型
cd models
wget https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip
unzip vosk-model-small-cn-0.22.zip
cd ..
```

**选项 2：中型中文模型（更好的效果，约 1.5GB）**
```bash
cd models
wget https://alphacephei.com/vosk/models/vosk-model-cn-0.22.zip
unzip vosk-model-cn-0.22.zip
cd ..
```

**选项 3：从 GitHub 下载**
访问 https://github.com/alphacep/vosk-api 查看所有可用模型

### 3. 模型目录结构

下载并解压后，模型目录结构应该是：
```
desktop-ai-robot/
├── models/
│   └── vosk-model-small-cn-0.22/  (或 vosk-model-cn-0.22/)
│       ├── am/
│       ├── graph/
│       ├── conf/
│       └── ...
```

### 4. 更新模型路径（如需要）

如果使用不同的模型，请在 `asr-manager.js` 中更新 `modelPath`：

```javascript
this.modelPath = './models/vosk-model-small-cn-0.22'; // 改为你的模型路径
```

## 功能说明

### 激活机制

1. **触摸检测**：用户点击、触摸或移动鼠标到窗口上时，会触发触摸检测
2. **延迟激活**：检测到触摸后，ASR 会在 10 秒内准备激活
3. **自动激活**：10 秒后自动激活 ASR 服务，开始监听语音

### 休眠机制

1. **无操作检测**：激活后，如果 10 秒内没有新的用户交互
2. **自动休眠**：ASR 服务会自动停止，释放资源
3. **等待下次激活**：进入休眠状态，等待用户下次触摸窗口

### 识别结果处理

识别结果会通过回调函数返回，当前实现：
- 在控制台输出识别结果
- 触发机器人"说话"动画

你可以在 `index.html` 中修改 `asrManager.onResult()` 回调来自定义处理逻辑。

## 权限要求

ASR 功能需要麦克风权限。首次使用时，浏览器会请求麦克风权限，请点击"允许"。

## 故障排除

### 模型加载失败

1. 检查模型文件是否已下载并解压到正确位置
2. 检查 `asr-manager.js` 中的 `modelPath` 是否正确
3. 查看浏览器控制台的错误信息

### 麦克风无法访问

1. 检查系统麦克风权限设置
2. 确保浏览器已授予麦克风权限
3. 检查是否有其他应用占用麦克风

### 识别效果不佳

1. 尝试使用更大的模型（如 vosk-model-cn-0.22）
2. 确保环境安静，减少背景噪音
3. 说话清晰，距离麦克风适中

## 性能优化建议

1. **使用小型模型**：如果性能优先，使用 `vosk-model-small-cn-0.22`
2. **及时休眠**：确保休眠机制正常工作，避免长时间占用资源
3. **延迟初始化**：ASR 管理器在页面加载 2 秒后才初始化，避免影响启动速度

## 参考资料

- Vosk 官网：https://alphacephei.com/vosk/
- Vosk-Browser GitHub：https://github.com/ccoreilly/vosk-browser
- 模型下载：https://alphacephei.com/vosk/models

