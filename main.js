const { app, BrowserWindow, screen } = require('electron');
const path = require('path');

let mainWindow;
let isMoving = false; // 防止递归移动
let lastPosition = { x: null, y: null }; // 记录上次位置

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
    backgroundColor: 'transparent',
    useContentSize: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      preload: path.join(__dirname, 'preload.js') // 加载 preload 脚本
    }
  });

  // 加载 HTML 文件
  mainWindow.loadFile('index.html');

  // 窗口可拖动
  mainWindow.setIgnoreMouseEvents(false);

  // 边缘吸附功能
  setupEdgeSnapping();

  // 打开开发者工具（调试时使用）
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.openDevTools();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

