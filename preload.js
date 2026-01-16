// Electron preload 脚本
// 在渲染进程加载前执行，可以安全地访问 Node.js API

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');

// 准备应用路径
const appPath = __dirname || process.cwd();

// 将应用信息暴露给渲染进程
const electronAPI = {
  getAppPath: () => appPath,
  toggleWindowHeight: () => {
    // 发送切换窗口高度的消息
    if (ipcRenderer) {
      ipcRenderer.send('toggle-window-height');
    }
  },
  reportError: (type, details) => {
    // 发送错误报告到主进程
    if (ipcRenderer) {
      ipcRenderer.send('renderer-error', { type, details });
    }
  }
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

console.log('[Preload] 应用路径已准备:', appPath);
