const { app, BrowserWindow, screen, ipcMain, crashReporter, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let isMoving = false; // 防止递归移动
let lastPosition = { x: null, y: null }; // 记录上次位置
const COLLAPSED_HEIGHT = 133; // 折叠高度
const EXPANDED_HEIGHT = 550; // 展开高度
let isExpanded = false; // 当前是否展开

// 崩溃日志文件路径
const CRASH_LOG_PATH = path.join(__dirname, 'crash-reports.log');

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
    height: 133, // face 高度的 1/2
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
      preload: path.join(__dirname, 'preload.js'), // 加载 preload 脚本
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

  // 加载 HTML 文件
  mainWindow.loadFile('index.html');

  // 窗口可拖动
  mainWindow.setIgnoreMouseEvents(false);

  // 边缘吸附功能
  setupEdgeSnapping();

  // 打开开发者工具（调试时使用）
  // 使用分离式 DevTools 避免与透明窗口的渲染冲突
  mainWindow.webContents.once('did-finish-load', () => {
    // 等待渲染稳定后再打开 DevTools，使用分离模式减少崩溃风险
    setTimeout(() => {
      try {
        // 分离式 DevTools 可以减少与透明窗口的渲染冲突
        mainWindow.webContents.openDevTools({ mode: 'detach' });
      } catch (error) {
        console.error('打开 DevTools 失败:', error);
      }
    }, 500);
  });

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

  // 监听窗口大小变化事件，在 macOS 上重新计算阴影
  mainWindow.on('resized', () => {
    if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
      // 延迟调用，确保渲染完成
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.invalidateShadow();
        }
      }, 50);
    }
  });

  // 监听渲染进程错误报告
  ipcMain.on('renderer-error', (event, { type, details }) => {
    console.error('收到渲染进程错误报告:', type, details);
    writeCrashLog(type, details);
  });

  // 监听切换窗口高度的 IPC 消息
  ipcMain.on('toggle-window-height', () => {
    if (mainWindow) {
      // 切换高度
      isExpanded = !isExpanded;
      const newHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
      
      // 使用 setTimeout 确保在下一个事件循环执行，避免渲染冲突
      setTimeout(() => {
        if (!mainWindow) return; // 检查窗口是否还存在
        
        const [currentWidth, currentHeight] = mainWindow.getSize();
        const [x, y] = mainWindow.getPosition();
        
        // 计算新位置（保持窗口顶部位置不变，底部扩展或收缩）
        const heightDiff = newHeight - currentHeight;
        let newY = y - heightDiff; // 向上调整位置，保持底部位置不变
        
        // 确保窗口不会移出屏幕顶部
        const display = screen.getDisplayNearestPoint({ x, y: newY });
        const { y: screenY } = display.workArea;
        if (newY < screenY) {
          newY = screenY; // 如果会移出屏幕，则保持在屏幕顶部
        }
        
        // 使用 setBounds 一次性设置位置和大小，避免分别调用导致的渲染问题
        // 这可以减少透明窗口在 macOS 上的渲染错误
        try {
          mainWindow.setBounds({
            x: x,
            y: newY,
            width: currentWidth,
            height: newHeight
          });
          
          // macOS 上调整透明窗口大小后需要重新计算阴影，避免渲染错误
          if (process.platform === 'darwin') {
            // 延迟调用 invalidateShadow，确保大小调整完成
            setTimeout(() => {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.invalidateShadow();
              }
            }, 100);
          }
          
          console.log(`窗口高度切换为: ${newHeight}px (${isExpanded ? '展开' : '折叠'})`);
        } catch (error) {
          console.error('窗口大小切换失败:', error);
        }
      }, 0); // 延迟到下一个事件循环
    }
  });
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

