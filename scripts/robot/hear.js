// ASR 语音识别模块
// 负责语音识别功能的初始化和事件处理

import asrManager from '../../asr-manager.js';

export class HearController {
  constructor(faceController) {
    this.faceController = faceController;
    this.asrManager = null;
    this.asrInitialized = false;
    this.touchEvents = ['mousedown', 'touchstart', 'click'];
    this.lastTouchTime = 0;
    this.TOUCH_DEBOUNCE = 100; // 防抖：100ms 内的多次触摸只算一次
    this.aiResponseCallback = null; // 保存 AI 响应回调
  }

  // 初始化 ASR（延迟加载，避免影响启动速度）
  async init() {
    if (this.asrInitialized) return;
    
    try {
      // 动态导入 ASR 管理器
      this.asrManager = asrManager;

      // 设置识别结果回调
      this.asrManager.onResult((text) => {
        console.log('ASR 识别结果:', text);
        if (text && text.trim() && this.faceController) {
          // 触发说话动画
          this.faceController.toggleSpeaking();
        }
      });

      // 设置句子完成回调
      this.asrManager.onSentenceComplete((text) => {
        console.log('句子完成:', text);
        // 可以在这里处理完整句子（但未调用 AI 的情况）
      });

      // 设置错误回调
      this.asrManager.onError((error) => {
        console.error('ASR 错误:', error);
      });

      // 设置 AI 响应回调（如果之前已经设置过）
      if (this.aiResponseCallback) {
        this.asrManager.onAIResponse(this.aiResponseCallback);
      }

      // 优化：初始化时预先准备连接和权限
      await this.asrManager.init();

      this.asrInitialized = true;
      console.log('ASR 管理器初始化完成');
    } catch (error) {
      console.error('ASR 初始化失败:', error);
      console.warn('ASR 功能将不可用，请确保已安装模型文件');
    }
  }

  // 设置 AI 响应回调（由外部设置，用于与 speak 模块通信）
  setAIResponseCallback(callback) {
    // 保存回调，即使 asrManager 还没初始化
    this.aiResponseCallback = callback;
    
    // 如果 asrManager 已经初始化，立即设置
    if (this.asrManager) {
      this.asrManager.onAIResponse(callback);
    }
  }

  // 触摸/点击检测
  setupTouchDetection() {
    this.touchEvents.forEach(eventType => {
      document.addEventListener(eventType, (e) => {
        const now = Date.now();
        if (now - this.lastTouchTime < this.TOUCH_DEBOUNCE) {
          return; // 防抖
        }
        this.lastTouchTime = now;

        // 初始化 ASR（如果还没初始化）
        if (!this.asrInitialized) {
          this.init();
        }

        // 通知 ASR 管理器检测到触摸
        if (this.asrManager) {
          this.asrManager.touchDetected();
        }
      }, { passive: true });
    });

    // 鼠标移动也重置休眠定时器（更自然的交互）
    document.addEventListener('mousemove', () => {
      if (this.asrManager && this.asrManager.isActive) {
        this.asrManager.resetSleepTimer();
      }
    }, { passive: true });
  }

  // 获取 ASR 管理器实例（供外部使用）
  getASRManager() {
    return this.asrManager;
  }
}

