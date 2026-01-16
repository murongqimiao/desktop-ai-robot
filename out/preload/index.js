"use strict";
const { contextBridge, ipcRenderer } = require("electron");
require("path");
const appPath = __dirname || process.cwd();
const electronAPI = {
  getAppPath: () => appPath,
  // 注意：已移除 toggleWindowHeight，窗口高度固定，通过 CSS 控制显示
  reportError: (type, details) => {
    if (ipcRenderer) {
      ipcRenderer.send("renderer-error", { type, details });
    }
  }
};
if (typeof contextBridge !== "undefined") {
  try {
    contextBridge.exposeInMainWorld("electronAPI", electronAPI);
  } catch (e) {
    window.electronAPI = electronAPI;
  }
} else {
  window.electronAPI = electronAPI;
}
console.log("[Preload] 应用路径已准备:", appPath);
