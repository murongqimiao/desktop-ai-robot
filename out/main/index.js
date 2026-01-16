"use strict";
const { app, BrowserWindow, screen, ipcMain, crashReporter, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
let mainWindow;
const WINDOW_HEIGHT = 550;
const CRASH_LOG_PATH = path.join(__dirname, "../crash-reports.log");
function writeCrashLog(type, details) {
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  const logEntry = {
    timestamp,
    type,
    details,
    platform: process.platform,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node
  };
  const logLine = `[${timestamp}] ${type}: ${JSON.stringify(logEntry, null, 2)}

`;
  try {
    fs.appendFileSync(CRASH_LOG_PATH, logLine, "utf8");
    console.error("崩溃日志已写入:", CRASH_LOG_PATH);
    console.error("崩溃详情:", logEntry);
  } catch (error) {
    console.error("写入崩溃日志失败:", error);
  }
}
function setupCrashReporter() {
  try {
    crashReporter.start({
      productName: "Desktop AI Robot",
      companyName: "Desktop AI Robot",
      submitURL: "",
      // 不提交到服务器，只本地记录
      uploadToServer: false,
      compress: false
    });
    console.log("崩溃报告服务已启动");
  } catch (error) {
    console.warn("启动崩溃报告服务失败:", error);
  }
  process.on("uncaughtException", (error) => {
    console.error("未捕获的异常:", error);
    writeCrashLog("uncaughtException", {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  });
  process.on("unhandledRejection", (reason, promise) => {
    console.error("未处理的 Promise 拒绝:", reason);
    writeCrashLog("unhandledRejection", {
      reason: reason instanceof Error ? {
        message: reason.message,
        stack: reason.stack,
        name: reason.name
      } : reason,
      promise: promise.toString()
    });
  });
}
function createWindow() {
  mainWindow = new BrowserWindow({
    // width: 300,  // face 宽度的 1/2
    width: 600,
    height: WINDOW_HEIGHT,
    // 固定高度，通过 CSS 控制显示内容
    transparent: true,
    // 透明窗口
    frame: false,
    // 无边框
    alwaysOnTop: false,
    // 不总是在最上层（可根据需要调整）
    resizable: false,
    // 不可调整大小
    skipTaskbar: true,
    // 不在任务栏显示
    roundedCorners: true,
    // 启用圆角（macOS）
    backgroundColor: "#00000000",
    // 使用完全透明的颜色，避免 macOS 上的渲染问题
    useContentSize: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      // preload 脚本路径
      // 在开发模式下，electron-vite 会将文件构建到 out/preload/index.js
      // __dirname 在构建后指向 out/main，所以需要正确计算相对路径
      preload: path.join(__dirname, "../preload/index.js"),
      // 加载 preload 脚本
      backgroundThrottling: false,
      // 防止后台时渲染被节流
      offscreen: false,
      // 确保使用正常的渲染路径
      // 添加渲染保护选项，减少崩溃风险
      sandbox: false,
      webSecurity: true,
      // 禁用可能导致崩溃的 Blink 特性
      enableBlinkFeatures: "",
      disableBlinkFeatures: "Auxclick"
    }
  });
  const isDev = !app.isPackaged;
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  console.log("环境检查:", {
    isPackaged: app.isPackaged,
    devServerUrl,
    isDev,
    __dirname,
    NODE_ENV: process.env.NODE_ENV
  });
  if (isDev) {
    if (devServerUrl) {
      console.log("开发模式：加载开发服务器 URL:", devServerUrl);
      mainWindow.loadURL(devServerUrl);
      mainWindow.webContents.openDevTools({ mode: "detach" });
    } else {
      console.warn("VITE_DEV_SERVER_URL 未设置，等待开发服务器启动...");
      const defaultDevUrl = "http://localhost:5173";
      const tryLoadDevServer = () => {
        const http = require("http");
        let retryCount = 0;
        const maxRetries = 20;
        const checkServer = () => {
          const req = http.get(defaultDevUrl, (res) => {
            console.log("开发服务器已启动，加载 URL:", defaultDevUrl);
            mainWindow.loadURL(defaultDevUrl);
            mainWindow.webContents.openDevTools({ mode: "detach" });
          });
          req.on("error", (err) => {
            retryCount++;
            if (retryCount < maxRetries) {
              console.log(`等待开发服务器启动... (${retryCount}/${maxRetries})`);
              setTimeout(checkServer, 500);
            } else {
              console.error("开发服务器启动超时，尝试加载默认 URL");
              mainWindow.loadURL(defaultDevUrl);
              mainWindow.webContents.openDevTools({ mode: "detach" });
            }
          });
          req.setTimeout(1e3, () => {
            req.destroy();
          });
        };
        checkServer();
      };
      tryLoadDevServer();
    }
  } else {
    const rendererPath = path.join(__dirname, "../renderer/index.html");
    console.log("生产模式：加载文件:", rendererPath);
    if (!fs.existsSync(rendererPath)) {
      console.error("Renderer 文件不存在:", rendererPath);
      console.error("当前 __dirname:", __dirname);
    } else {
      mainWindow.loadFile(rendererPath);
    }
  }
  mainWindow.setIgnoreMouseEvents(false);
  mainWindow.webContents.on("render-process-gone", (event, details) => {
    console.error("渲染进程崩溃:", details);
    writeCrashLog("render-process-gone", {
      reason: details.reason,
      exitCode: details.exitCode,
      killed: details.killed
    });
    let errorMessage = `渲染进程已崩溃。
原因: ${details.reason}
退出代码: ${details.exitCode}`;
    if (details.exitCode === 11) {
      errorMessage += "\n\n这是段错误（SIGSEGV），通常由以下原因引起：";
      errorMessage += "\n1. GPU 渲染问题（透明窗口 + DevTools）";
      errorMessage += "\n2. 内存访问错误";
      errorMessage += "\n3. Electron 版本问题";
      errorMessage += "\n\n建议：";
      errorMessage += "\n- 使用分离式 DevTools（已自动启用）";
      errorMessage += "\n- 避免在 DevTools Elements 面板中频繁操作";
      errorMessage += "\n- 考虑升级 Electron 版本";
    }
    errorMessage += `

详细信息已记录到: ${CRASH_LOG_PATH}`;
    dialog.showErrorBox("渲染进程崩溃", errorMessage);
    if (!details.killed && mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        try {
          mainWindow.reload();
        } catch (error) {
          console.error("重新加载窗口失败:", error);
        }
      }, 1e3);
    }
  });
  app.on("gpu-process-crashed", (event, killed) => {
    console.error("GPU 进程崩溃:", killed);
    writeCrashLog("gpu-process-crashed", {
      killed
    });
  });
  app.on("child-process-gone", (event, details) => {
    console.error("子进程崩溃:", details);
    writeCrashLog("child-process-gone", {
      type: details.type,
      name: details.name,
      reason: details.reason,
      exitCode: details.exitCode
    });
  });
  mainWindow.webContents.on("unresponsive", () => {
    console.warn("窗口无响应");
    writeCrashLog("unresponsive", {
      message: "窗口无响应"
    });
  });
  mainWindow.webContents.on("responsive", () => {
    console.log("窗口恢复响应");
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  ipcMain.on("renderer-error", (event, { type, details }) => {
    console.error("收到渲染进程错误报告:", type, details);
    writeCrashLog(type, details);
  });
}
setupCrashReporter();
if (process.platform === "darwin") {
  app.commandLine.appendSwitch("renderer-process-limit", "1");
}
app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
