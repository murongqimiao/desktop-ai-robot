# Vue 迁移说明

项目已从纯 HTML/JS 迁移到 Vue 3 + Vite + Electron 架构。

## 项目结构

```
desktop-ai-robot/
├── electron/              # Electron 主进程文件
│   ├── main.js           # 主进程（原 main.js）
│   └── preload.js        # 预加载脚本（原 preload.js）
├── src/                   # Vue 应用源码
│   ├── components/       # Vue 组件
│   │   ├── RobotFace.vue
│   │   ├── ChatHistory.vue
│   │   └── ChatInput.vue
│   ├── composables/      # Vue Composables（替代原来的类）
│   │   ├── useFace.js
│   │   ├── useHear.js
│   │   └── useSpeak.js
│   ├── scripts/          # 原有脚本（保留）
│   │   ├── client/
│   │   └── robot/
│   ├── styles/           # 样式文件
│   │   ├── main.css
│   │   ├── robot-face.css
│   │   ├── chat-history.css
│   │   └── chat-input.css
│   ├── App.vue           # 主应用组件
│   └── main.js           # Vue 应用入口
├── electron.vite.config.js  # Electron-Vite 配置
└── index.html            # HTML 入口（简化版）

```

## 安装依赖

```bash
npm install
```

## 开发模式

```bash
npm run dev
```

这会同时启动：
- ASR 服务器（Python）
- TTS 服务器（Python）
- Electron 应用（Vue + Vite 开发服务器）

## 构建

```bash
npm run build
```

## 主要变化

1. **组件化**：将原来的 HTML 结构拆分为 Vue 组件
2. **Composables**：将原来的类转换为 Vue Composables
3. **样式分离**：CSS 从 HTML 中提取到独立文件
4. **构建工具**：使用 Vite 替代直接加载 HTML
5. **开发体验**：支持热重载、更好的代码组织

## 注意事项

1. **FaceController**：仍然使用全局 DOM 查询，因为需要操作具体的 DOM 元素
2. **原有脚本**：`scripts/robot` 和 `scripts/client` 保持不变，直接复用
3. **样式**：部分复杂样式（如机器人脸部动画）需要从原 index.html 完整复制

## 待完成

- [ ] 完整迁移机器人脸部的所有 CSS 样式
- [ ] 测试所有功能是否正常
- [ ] 优化 FaceController 以更好地支持 Vue
