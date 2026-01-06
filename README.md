# 桌面宠物机器人

一个基于 Electron 的桌面宠物应用，展示一个可爱的机器人表情。

## 功能特性

- ✅ 透明无边框窗口
- ✅ 窗口大小与机器人脸部大小一致（300x200）
- ✅ 可在桌面随意拖动
- ✅ 边缘吸附功能（拖动到屏幕边缘自动隐藏，保留 20px 可见）
- ✅ 自动眨眼动画
- ✅ 随机情绪变化（正常、开心、难过、思考、狡猾）
- ✅ 眼睛和瞳孔的动画效果
- ✅ **离线中文语音识别（ASR）** - 触摸窗口后自动激活，10秒无操作自动休眠

## 安装依赖

```bash
npm install

根目录新增一个conf目录，里面新增一个token.json文件，内容为：

{
    "deepseek_token": "这里面是你的deepseek的token"
}

```

## ASR 语音识别功能设置

本项目集成了基于 Vosk-Browser 的离线中文语音识别功能。

### 快速开始

1. **下载模型文件**（首次使用需要）：
   ```bash
   ./download-model.sh
   ```
   或手动下载模型到 `models/` 目录（详见 [ASR_SETUP.md](./ASR_SETUP.md)）

2. **功能说明**：
   - 触摸/点击窗口后，ASR 会在 10 秒内自动激活
   - 激活后如果 10 秒内没有新的交互，会自动进入休眠状态
   - 识别结果会在控制台输出，并触发机器人"说话"动画

详细设置说明请参考 [ASR_SETUP.md](./ASR_SETUP.md)

## 运行项目

```bash
npm start
```

或者

```bash
npm run dev
```

## 项目结构

```
desktop-ai-robot/
├── main.js              # Electron 主进程文件
├── index.html           # 机器人界面 HTML
├── package.json         # 项目配置文件
├── download-model.sh    # 模型下载脚本
├── ASR_SETUP.md         # ASR 功能设置指南
├── README.md            # 说明文档
├── scripts/             # 前端脚本目录
│   ├── client/          # 客户端管理器
│   │   ├── asr-manager.js  # ASR 语音识别管理器
│   │   └── tts-manager.js   # TTS 文本转语音管理器
│   └── robot/           # 机器人控制脚本
│       ├── face.js      # 面部动画控制
│       ├── hear.js      # 听觉控制
│       └── speak.js      # 语音控制
└── models/              # ASR 模型目录（需要下载）
    └── vosk-model-small-cn-0.22/
```

## 窗口配置

- **透明窗口**: `transparent: true`
- **无边框**: `frame: false`
- **窗口大小**: 300x200 像素（与机器人脸部大小一致）
- **可拖动**: 通过 CSS `-webkit-app-region: drag` 实现
- **不在任务栏显示**: `skipTaskbar: true`

## 使用说明

1. 运行应用后，会在桌面上显示一个机器人表情
2. 可以拖动窗口到任意位置
3. 机器人会自动眨眼，并随机切换情绪
4. 关闭窗口即可退出应用

## 技术栈

- Electron
- HTML/CSS/JavaScript
- Vosk-Browser (离线语音识别)

