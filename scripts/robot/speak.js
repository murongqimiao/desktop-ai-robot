// TTS 文本转语音模块
// 负责文本转语音功能的初始化和播放

import ttsManager from '../client/tts-manager.js';

export class SpeakController {
  constructor(faceController) {
    this.faceController = faceController;
    this.ttsManager = null;
    this.ttsInitialized = false;
    this.playQueue = []; // 待播放队列
    this.isPlaying = false; // 是否正在播放
    this.currentBuffer = ''; // 当前累积的文本缓冲区
    this.punctuationPattern = /[。！？；，、：\n]/; // 标点符号正则（包括换行符）
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

  // 按标点符号拆分文本
  splitByPunctuation(text) {
    const segments = [];
    let currentSegment = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      currentSegment += char;
      
      // 检查是否是标点符号
      if (this.punctuationPattern.test(char)) {
        const trimmed = currentSegment.trim();
        if (trimmed) {
          segments.push(trimmed);
        }
        currentSegment = '';
      }
    }
    
    // 添加剩余文本（如果没有以标点符号结尾）
    const remaining = currentSegment.trim();
    if (remaining) {
      segments.push(remaining);
    }
    
    return segments;
  }

  // 添加文本到缓冲区，按标点符号拆分后加入队列
  addToQueue(text, voice = null) {
    // 累积到缓冲区（即使 text 为空，也允许处理剩余缓冲区）
    if (text) {
      this.currentBuffer += text;
    }

    // 如果缓冲区为空，不处理
    if (!this.currentBuffer.trim()) {
      return;
    }
    
    // 按标点符号拆分
    const segments = this.splitByPunctuation(this.currentBuffer);
    
    // 如果有完整的句子（以标点符号结尾），加入队列
    // 最后一个片段如果没有标点符号，保留在缓冲区
    if (segments.length > 0) {
      // 检查最后一个片段是否以标点符号结尾
      const lastSegment = segments[segments.length - 1];
      const hasPunctuation = this.punctuationPattern.test(lastSegment);
      
      if (hasPunctuation) {
        // 所有片段都完整，全部加入队列
        segments.forEach(segment => {
          if (segment.trim()) {
            this.playQueue.push({ text: segment.trim(), voice });
          }
        });
        this.currentBuffer = '';
      } else {
        // 最后一个片段不完整，保留在缓冲区
        for (let i = 0; i < segments.length - 1; i++) {
          if (segments[i].trim()) {
            this.playQueue.push({ text: segments[i].trim(), voice });
          }
        }
        this.currentBuffer = segments[segments.length - 1];
      }
    }
    
    // 开始播放队列
    this.processQueue();
  }

  // 强制处理剩余缓冲区（流式响应结束时调用）
  flushBuffer(voice = null) {
    if (this.currentBuffer.trim()) {
      // 将剩余缓冲区作为最后一个片段加入队列
      this.playQueue.push({ text: this.currentBuffer.trim(), voice });
      this.currentBuffer = '';
      // 开始播放队列
      this.processQueue();
    }
  }

  // 处理播放队列
  async processQueue() {
    // 如果正在播放或队列为空，不处理
    if (this.isPlaying || this.playQueue.length === 0) {
      return;
    }

    this.isPlaying = true;

    // 确保 TTS 已初始化
    if (!this.ttsInitialized) {
      await this.init();
    }

    // 如果还没连接，初始化连接
    if (!this.ttsManager.isConnected) {
      await this.ttsManager.init();
    }

    // 触发说话动画（只在开始播放时触发一次）
    if (this.faceController && !this.faceController.isSpeaking) {
      this.faceController.toggleSpeaking();
    }

    // 循环播放队列中的内容
    while (this.playQueue.length > 0) {
      const item = this.playQueue.shift(); // 取出第一条
      
      try {
        console.log('播放队列项:', item.text);
        // 合成并播放语音
        await this.ttsManager.speak(item.text, item.voice);
      } catch (error) {
        console.error('TTS 播放失败:', error);
      }
    }

    // 播放完成，停止说话动画
    if (this.faceController && this.faceController.isSpeaking) {
      this.faceController.toggleSpeaking();
    }

    this.isPlaying = false;
  }

  // 清空缓冲区和队列
  clearQueue() {
    this.playQueue = [];
    this.currentBuffer = '';
    this.isPlaying = false;
  }

  // 播放文本（文本转语音并播放）- 兼容旧接口
  async speak(text, voice = null) {
    if (!text || !text.trim()) {
      return;
    }

    // 使用队列播放机制
    this.addToQueue(text, voice);
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

