// TTS 文本转语音模块
// 负责文本转语音功能的初始化和播放

import ttsManager from '../../tts-manager.js';

export class SpeakController {
  constructor(faceController) {
    this.faceController = faceController;
    this.ttsManager = null;
    this.ttsInitialized = false;
  }

  // 初始化 TTS
  async init() {
    if (this.ttsInitialized) return;
    
    try {
      this.ttsManager = ttsManager;
      
      // 初始化 TTS 连接
      await this.ttsManager.init();
      
      this.ttsInitialized = true;
      console.log('TTS 管理器初始化完成');
    } catch (error) {
      console.warn('TTS 初始化失败（将在使用时重试）:', error);
    }
  }

  // 播放文本（文本转语音并播放）
  async speak(text, voice = null) {
    if (!text || !text.trim()) {
      return;
    }

    try {
      // 确保 TTS 已初始化
      if (!this.ttsInitialized) {
        await this.init();
      }

      // 如果还没连接，初始化连接
      if (!this.ttsManager.isConnected) {
        await this.ttsManager.init();
      }

      // 触发说话动画
      if (this.faceController) {
        this.faceController.toggleSpeaking();
      }

      // 合成并播放语音
      await this.ttsManager.speak(text, voice);
      
      console.log('TTS 播放完成');
      
      // 停止说话动画
      if (this.faceController) {
        this.faceController.toggleSpeaking();
      }
    } catch (error) {
      console.error('TTS 播放失败:', error);
      // 停止说话动画
      if (this.faceController) {
        this.faceController.toggleSpeaking();
      }
    }
  }

  // 设置音色
  async setVoice(voice) {
    if (this.ttsManager) {
      await this.ttsManager.setVoice(voice);
    }
  }

  // 获取可用音色列表
  async listVoices() {
    if (this.ttsManager) {
      return await this.ttsManager.listVoices();
    }
    return [];
  }
}

