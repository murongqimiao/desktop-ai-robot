// Electron preload 脚本
// 在渲染进程加载前执行，可以安全地访问 Node.js API

const { contextBridge } = require('electron');
const path = require('path');

// 准备模型路径（使用绝对路径）
const appPath = __dirname || process.cwd();
const modelPath = path.join(appPath, 'models', 'vosk-model-small-cn-0.22');
const modelUrl = `model://vosk-model-small-cn-0.22`;

// 尝试预加载 vosk-browser 模块
let voskModule = null;
try {
  voskModule = require('vosk-browser');
  console.log('[Preload] vosk-browser 模块已预加载');
} catch (error) {
  console.warn('[Preload] 无法预加载 vosk-browser:', error.message);
}

// 将模型信息和 vosk 模块暴露给渲染进程
const electronAPI = {
  getModelPath: () => modelPath,
  getModelUrl: () => modelUrl,
  getAppPath: () => appPath,
  getVoskModule: () => voskModule // 暴露预加载的 vosk 模块
};

if (typeof contextBridge !== 'undefined') {
  // 使用 contextBridge（更安全，但需要 contextIsolation: true）
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  } catch (e) {
    // 如果 contextIsolation 为 false，contextBridge 不可用
    window.electronAPI = electronAPI;
  }
} else {
  // 如果 contextIsolation 为 false，直接挂载到 window
  window.electronAPI = electronAPI;
}

console.log('[Preload] 模型路径已准备:', modelUrl);
console.log('[Preload] vosk-browser 模块:', voskModule ? '已加载' : '未加载');

