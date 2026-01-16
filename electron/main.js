const { app, BrowserWindow, screen, ipcMain, crashReporter, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let isMoving = false; // 防止递归移动
let lastPosition = { x: null, y: null }; // 记录上次位置
const WINDOW_HEIGHT = 550; // 固定窗口高度（展开后的高度）

// 崩溃日志文件路径
const CRASH_LOG_PATH = path.join(__dirname, '../crash-reports.log');

/**
 * 写入崩溃日志
 */
function writeCrashLog(type, details) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    type,
    details,
    platform: process.platform,
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node
  };
  
  const logLine = `[${timestamp}] ${type}: ${JSON.stringify(logEntry, null, 2)}\n\n`;
  
  try {
    fs.appendFileSync(CRASH_LOG_PATH, logLine, 'utf8');
    console.error('崩溃日志已写入:', CRASH_LOG_PATH);
    console.error('崩溃详情:', logEntry);
  } catch (error) {
    console.error('写入崩溃日志失败:', error);
  }
}

/**
 * 初始化崩溃报告
 */
function setupCrashReporter() {
  // 启用崩溃报告服务（如果可用）
  try {
    crashReporter.start({
      productName: 'Desktop AI Robot',
      companyName: 'Desktop AI Robot',
      submitURL: '', // 不提交到服务器，只本地记录
      uploadToServer: false,
      compress: false
    });
    console.log('崩溃报告服务已启动');
  } catch (error) {
    console.warn('启动崩溃报告服务失败:', error);
  }
  
  // 监听应用级别的未捕获异常
  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    writeCrashLog('uncaughtException', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
  });
  
  // 监听未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的 Promise 拒绝:', reason);
    writeCrashLog('unhandledRejection', {
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
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    // width: 300,  // face 宽度的 1/2
    width: 600,
    height: WINDOW_HEIGHT, // 固定高度，通过 CSS 控制显示内容
    transparent: true,  // 透明窗口
    frame: false,  // 无边框
    alwaysOnTop: false,  // 不总是在最上层（可根据需要调整）
    resizable: false,  // 不可调整大小
    skipTaskbar: true,  // 不在任务栏显示
    roundedCorners: true,  // 启用圆角（macOS）
    backgroundColor: '#00000000', // 使用完全透明的颜色，避免 macOS 上的渲染问题
    useContentSize: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      // preload 脚本路径
      // 在开发模式下，electron-vite 会将文件构建到 out/preload/index.js
      // __dirname 在构建后指向 out/main，所以需要正确计算相对路径
      preload: path.join(__dirname, '../preload/index.js'), // 加载 preload 脚本
      backgroundThrottling: false, // 防止后台时渲染被节流
      offscreen: false, // 确保使用正常的渲染路径
      // 添加渲染保护选项，减少崩溃风险
      sandbox: false,
      webSecurity: true,
      // 禁用可能导致崩溃的 Blink 特性
      enableBlinkFeatures: '',
      disableBlinkFeatures: 'Auxclick'
    }
  });

  // 加载 Vue 应用
  // electron-vite 在开发模式下会设置 VITE_DEV_SERVER_URL
  // 如果未打包，则认为是开发模式（即使 VITE_DEV_SERVER_URL 暂时未设置）
  const isDev = !app.isPackaged
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  
  console.log('环境检查:', {
    isPackaged: app.isPackaged,
    devServerUrl: devServerUrl,
    isDev: isDev,
    __dirname: __dirname,
    NODE_ENV: process.env.NODE_ENV
  })
  
  if (isDev) {
    // 开发环境：使用开发服务器 URL
    // 如果 VITE_DEV_SERVER_URL 已设置，直接使用
    // 如果未设置，等待一下再尝试（开发服务器可能还在启动）
    if (devServerUrl) {
      console.log('开发模式：加载开发服务器 URL:', devServerUrl)
      mainWindow.loadURL(devServerUrl)
      // 开发模式下自动打开 DevTools（分离模式，避免与透明窗口的渲染冲突）
      mainWindow.webContents.openDevTools({ mode: 'detach' })
    } else {
      // VITE_DEV_SERVER_URL 未设置，可能是开发服务器还在启动
      // 等待一下，然后尝试使用默认的开发服务器地址
      console.warn('VITE_DEV_SERVER_URL 未设置，等待开发服务器启动...')
      
      // 尝试使用默认的 Vite 开发服务器地址
      const defaultDevUrl = 'http://localhost:5173'
      
      // 等待开发服务器启动
      const tryLoadDevServer = () => {
        const http = require('http')
        let retryCount = 0
        const maxRetries = 20 // 最多等待 10 秒 (20 * 500ms)
        
        const checkServer = () => {
          const req = http.get(defaultDevUrl, (res) => {
            console.log('开发服务器已启动，加载 URL:', defaultDevUrl)
            mainWindow.loadURL(defaultDevUrl)
            // 分离模式打开 DevTools，避免与透明窗口的渲染冲突
            mainWindow.webContents.openDevTools({ mode: 'detach' })
          })
          req.on('error', (err) => {
            retryCount++
            if (retryCount < maxRetries) {
              // 服务器未启动，继续等待
              console.log(`等待开发服务器启动... (${retryCount}/${maxRetries})`)
              setTimeout(checkServer, 500)
            } else {
              console.error('开发服务器启动超时，尝试加载默认 URL')
              // 超时后仍然尝试加载，可能服务器在其他端口
              mainWindow.loadURL(defaultDevUrl)
              // 分离模式打开 DevTools，避免与透明窗口的渲染冲突
              mainWindow.webContents.openDevTools({ mode: 'detach' })
            }
          })
          req.setTimeout(1000, () => {
            req.destroy()
          })
        }
        checkServer()
      }
      
      tryLoadDevServer()
    }
  } else {
    // 生产环境：加载构建后的 HTML 文件
    // electron-vite 会将 renderer 构建到 out/renderer 目录
    // __dirname 在构建后指向 out/main，所以需要正确计算相对路径
    const rendererPath = path.join(__dirname, '../renderer/index.html')
    console.log('生产模式：加载文件:', rendererPath)
    
    // 检查文件是否存在
    if (!fs.existsSync(rendererPath)) {
      console.error('Renderer 文件不存在:', rendererPath)
      console.error('当前 __dirname:', __dirname)
    } else {
      mainWindow.loadFile(rendererPath)
    }
  }

  // 窗口可拖动
  mainWindow.setIgnoreMouseEvents(false);

  // 边缘吸附功能
  setupEdgeSnapping();

  // 注意：DevTools 现在在加载 URL/文件时根据环境自动打开
  // 开发模式下会在 loadURL 后自动打开，生产模式下不打开

  // 监听渲染进程崩溃事件
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('渲染进程崩溃:', details);
    writeCrashLog('render-process-gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      killed: details.killed
    });
    
    // 如果是段错误（exitCode 11），提供更详细的诊断信息
    let errorMessage = `渲染进程已崩溃。\n原因: ${details.reason}\n退出代码: ${details.exitCode}`;
    
    if (details.exitCode === 11) {
      errorMessage += '\n\n这是段错误（SIGSEGV），通常由以下原因引起：';
      errorMessage += '\n1. GPU 渲染问题（透明窗口 + DevTools）';
      errorMessage += '\n2. 内存访问错误';
      errorMessage += '\n3. Electron 版本问题';
      errorMessage += '\n\n建议：';
      errorMessage += '\n- 使用分离式 DevTools（已自动启用）';
      errorMessage += '\n- 避免在 DevTools Elements 面板中频繁操作';
      errorMessage += '\n- 考虑升级 Electron 版本';
    }
    
    errorMessage += `\n\n详细信息已记录到: ${CRASH_LOG_PATH}`;
    
    // 显示错误提示
    dialog.showErrorBox('渲染进程崩溃', errorMessage);
    
    // 尝试重新加载窗口（如果可能）
    if (!details.killed && mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        try {
          mainWindow.reload();
        } catch (error) {
          console.error('重新加载窗口失败:', error);
        }
      }, 1000);
    }
  });

  // 注意：'crashed' 事件已弃用，使用 'render-process-gone' 代替
  // 已移除 'crashed' 事件监听以避免警告

  // 监听 GPU 进程崩溃
  app.on('gpu-process-crashed', (event, killed) => {
    console.error('GPU 进程崩溃:', killed);
    writeCrashLog('gpu-process-crashed', {
      killed
    });
  });

  // 监听子进程崩溃
  app.on('child-process-gone', (event, details) => {
    console.error('子进程崩溃:', details);
    writeCrashLog('child-process-gone', {
      type: details.type,
      name: details.name,
      reason: details.reason,
      exitCode: details.exitCode
    });
  });

  // 监听未捕获的异常（在渲染进程中）
  mainWindow.webContents.on('unresponsive', () => {
    console.warn('窗口无响应');
    writeCrashLog('unresponsive', {
      message: '窗口无响应'
    });
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('窗口恢复响应');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 监听渲染进程错误报告
  ipcMain.on('renderer-error', (event, { type, details }) => {
    console.error('收到渲染进程错误报告:', type, details);
    writeCrashLog(type, details);
  });

  // 注意：已移除窗口高度切换逻辑，窗口高度固定，通过 CSS 控制内容显示
}

// 初始化崩溃报告（必须在 app.whenReady() 之前）
setupCrashReporter();

// 添加命令行参数以缓解 GPU 渲染问题
// 这些参数可以帮助减少 "value out of range" 警告和崩溃
if (process.platform === 'darwin') {
  // macOS 特定的优化
  // 限制渲染进程数量，减少内存压力和渲染冲突
  app.commandLine.appendSwitch('renderer-process-limit', '1');
  
  // 添加日志级别，帮助调试（可选）
  // app.commandLine.appendSwitch('enable-logging');
}

// 当 Electron 完成初始化并准备创建浏览器窗口时调用此方法
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 当所有窗口都被关闭时退出应用
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 边缘吸附功能
function setupEdgeSnapping() {
  // const SNAP_THRESHOLD = 30; // 吸附阈值（像素）
  // const VISIBLE_PIXELS = 20; // 保留在屏幕内的像素数

  // mainWindow.on('move', () => {
  //   if (isMoving) return; // 防止递归

  //   const [x, y] = mainWindow.getPosition();
  //   const [width, height] = mainWindow.getSize();
    
  //   // 获取窗口当前所在的显示器
  //   const display = screen.getDisplayNearestPoint({ x: x + width / 2, y: y + height / 2 });
  //   const { width: screenWidth, height: screenHeight } = display.workAreaSize;
  //   const { x: screenX, y: screenY } = display.workArea;

  //   // 检查窗口是否在屏幕内（至少有一部分可见）
  //   const isInScreen = x < screenX + screenWidth && x + width > screenX && 
  //                      y < screenY + screenHeight && y + height > screenY;

  //   let newX = x;
  //   let newY = y;
  //   let shouldMove = false;

  //   // 只在窗口在屏幕内或接近屏幕边缘时检测吸附
  //   if (isInScreen || (x >= screenX - SNAP_THRESHOLD && x <= screenX + screenWidth + SNAP_THRESHOLD &&
  //                      y >= screenY - SNAP_THRESHOLD && y <= screenY + screenHeight + SNAP_THRESHOLD)) {
      
  //     // 检测左边缘
  //     if (x >= screenX - SNAP_THRESHOLD && x <= screenX + SNAP_THRESHOLD) {
  //       newX = screenX - width + VISIBLE_PIXELS;
  //       shouldMove = true;
  //     }
  //     // 检测右边缘
  //     else if (x + width >= screenX + screenWidth - SNAP_THRESHOLD && x + width <= screenX + screenWidth + SNAP_THRESHOLD) {
  //       newX = screenX + screenWidth - VISIBLE_PIXELS;
  //       shouldMove = true;
  //     }

  //     // 检测上边缘
  //     if (y >= screenY - SNAP_THRESHOLD && y <= screenY + SNAP_THRESHOLD) {
  //       newY = screenY - height + VISIBLE_PIXELS;
  //       shouldMove = true;
  //     }
  //     // 检测下边缘
  //     else if (y + height >= screenY + screenHeight - SNAP_THRESHOLD && y + height <= screenY + screenHeight + SNAP_THRESHOLD) {
  //       newY = screenY + screenHeight - VISIBLE_PIXELS;
  //       shouldMove = true;
  //     }
  //   }

  //   // 执行移动
  //   if (shouldMove) {
  //     isMoving = true;
  //     mainWindow.setPosition(newX, newY);
  //     // 使用 setTimeout 确保移动完成后再重置标志
  //     setTimeout(() => {
  //       isMoving = false;
  //     }, 100);
  //   }

  //   // 更新上次位置
  //   lastPosition.x = x;
  //   lastPosition.y = y;
  // });
}

