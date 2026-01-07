// TTS 文本转语音模块
// 负责文本转语音功能的初始化和播放
// 重构版本：支持流式处理、情绪识别、状态管理

import ttsManager from '../client/tts-manager.js';

export class SpeakController {
  constructor(faceController) {
    this.faceController = faceController;
    this.ttsManager = null;
    this.ttsInitialized = false;
    
    // ========== State 管理 ==========
    // 1. 大模型下发的文本（累加的）
    this.accumulatedText = '';
    
    // 2. 等待发送的文本（数组，经过标点符号拆分）
    // 每个item: { text: string, emotion: string, isLast: boolean }
    this.pendingTexts = [];
    
    // 3. 等待播放的内容（数组）
    // 每个item: { 
    //   text: string,           // 文本内容
    //   emotion: string,         // 情绪
    //   voice: string,           // 音色
    //   audioData: ArrayBuffer,  // 转换后的语音内容（二进制）
    //   status: 'pending' | 'converting' | 'ready' | 'playing' | 'completed',  // 转换状态
    //   isLast: boolean          // 是否是最后一条
    // }
    this.pendingPlayback = [];
    
    // 播放相关
    this.isPlaying = false;
    this.currentPlayingItem = null; // 当前正在播放的项
    this.currentAudioContext = null;
    this.currentSource = null;
    this.audioQueue = []; // 待播放的音频数据队列
    
    // 标点符号正则（用于拆分文本）
    this.punctuationPattern = /[。！？；，、：\n]/;
  }

  // ========== 初始化流程 ==========
  /**
   * 初始化 TTS 管理器
   * 步骤：
   * 1. 获取 TTS 管理器实例
   * 2. 初始化 TTS 连接
   * 3. 设置音频就绪回调
   * 4. 设置错误回调
   */
  async init() {
    if (this.ttsInitialized) return;
    
    try {
      // 步骤1: 获取 TTS 管理器实例
      this.ttsManager = ttsManager;
      
      // 步骤2: 初始化 TTS 连接
      await this.ttsManager.init();
      
      // 步骤3: 设置音频就绪回调
      this.ttsManager.onAudioReady((audioUrl, metadata) => {
        this.handleAudioReady(audioUrl, metadata);
      });
      
      // 步骤4: 设置错误回调
      this.ttsManager.onError((error) => {
        console.error('TTS 错误:', error);
      });
      
      this.ttsInitialized = true;
      console.log('TTS 管理器初始化完成');
    } catch (error) {
      console.warn('TTS 初始化失败（将在使用时重试）:', error);
    }
  }

  // ========== 大模型文本处理 ==========
  /**
   * 添加大模型下发的文本（实时累加）
   * 步骤：
   * 1. 累加到 accumulatedText
   * 2. 检查是否需要拆分（标点符号）
   * 3. 如果有完整句子，添加到 pendingTexts
   * 4. 检查并处理 pendingTexts
   */
  addText(text) {
    if (!text || !text.trim()) return;
    
    // 步骤1: 累加文本
    this.accumulatedText += text;
    
    // 步骤2 & 3: 检查并拆分
    this.splitAndAddToPending();
    
    // 步骤4: 处理待发送的文本
    this.processPendingTexts();
  }

  /**
   * 标记大模型返回结束
   * 步骤：
   * 1. 处理剩余的 accumulatedText
   * 2. 标记最后一条为 isLast
   * 3. 处理待发送的文本
   */
  markEnd() {
    // 步骤1: 处理剩余文本
    if (this.accumulatedText.trim()) {
      // 将剩余文本添加到 pendingTexts
      this.pendingTexts.push({
        text: this.accumulatedText.trim(),
        emotion: 'normal', // 默认情绪，实际应该从文本中提取
        isLast: true
      });
      this.accumulatedText = '';
    }
    
    // 步骤2: 标记最后一条（如果还有未标记的）
    if (this.pendingTexts.length > 0) {
      const lastItem = this.pendingTexts[this.pendingTexts.length - 1];
      lastItem.isLast = true;
    }
    
    // 步骤3: 处理待发送的文本
    this.processPendingTexts();
  }

  /**
   * 拆分文本并添加到 pendingTexts
   * 根据标点符号拆分，完整句子添加到 pendingTexts
   */
  splitAndAddToPending() {
    if (!this.accumulatedText.trim()) return;
    
    // 按标点符号拆分
    const segments = [];
    let currentSegment = '';
    
    for (let i = 0; i < this.accumulatedText.length; i++) {
      const char = this.accumulatedText[i];
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
    
    // 如果有完整句子，添加到 pendingTexts
    if (segments.length > 0) {
      segments.forEach(segment => {
        if (segment.trim()) {
          // TODO: 从文本中提取情绪（需要前端处理或后端返回）
          this.pendingTexts.push({
            text: segment.trim(),
            emotion: 'normal', // 默认情绪
            isLast: false
          });
        }
      });
      
      // 保留未完成的片段
      this.accumulatedText = currentSegment;
    }
  }

  // ========== TTS 转换处理 ==========
  /**
   * 处理待发送的文本
   * 步骤：
   * 1. 检查 pendingTexts 是否为空
   * 2. 如果不为空，取出第一条
   * 3. 添加到 pendingPlayback（状态为 converting）
   * 4. 调用 TTS 转换
   */
  async processPendingTexts() {
    // 步骤1: 检查是否为空
    if (this.pendingTexts.length === 0) return;

    // 步骤2: 取出第一条
    const item = this.pendingTexts.shift();
    
    // 步骤3: 添加到 pendingPlayback
    const playbackItem = {
      text: item.text,
      emotion: item.emotion,
      voice: null, // 将在 TTS 返回时更新
      audioData: null,
      status: 'converting',
      isLast: item.isLast
    };
    this.pendingPlayback.push(playbackItem);
    
    // 步骤4: 调用 TTS 转换
    if(item.text.trim()) {
      console.log('convertToSpeech', item.text);
      await this.convertToSpeech(playbackItem);
    }
  }

  /**
   * 调用 TTS 转换语音
   * @param {Object} playbackItem - 播放项
   */
  async convertToSpeech(playbackItem) {
    if (!this.ttsInitialized) {
      await this.init();
    }
    
    try {
      // 调用 TTS 管理器转换
      // 注意：这里需要修改 ttsManager.synthesize 来支持返回 metadata
      await this.ttsManager.synthesize(playbackItem.text);
      
      // 状态会在 handleAudioReady 中更新
    } catch (error) {
      console.error('TTS 转换失败:', error);
      playbackItem.status = 'error';
    }
  }

  /**
   * 处理 TTS 返回的音频数据
   * @param {string|null} audioUrl - 音频 URL（流式模式下为 null）
   * @param {Object} metadata - 元数据 { voice, emotion }
   */
  handleAudioReady(audioUrl, metadata = {}) {
    // 流式播放开始/完成的情况（audioUrl 为 null）
    if (audioUrl === null) {
      // 找到状态为 converting 的项（流式模式开始）
      let item = this.pendingPlayback.find(p => p.status === 'converting');
      
      if (item) {
        // 流式播放开始：更新状态和 metadata
        item.status = 'playing'; // 流式模式下直接标记为 playing
        item.voice = metadata.voice || null;
        item.emotion = metadata.emotion || item.emotion;
        item.audioUrl = null; // 流式模式没有 audioUrl
        
        // 如果情绪改变，更新面部表情
        if (this.faceController && item.emotion) {
          this.faceController.setEmotion(item.emotion);
        }
        
        // 开始播放（如果是第一条）
        if (!this.isPlaying) {
          this.isPlaying = true;
          this.currentPlayingItem = item;
          
          // 触发说话动画
          if (this.faceController && !this.faceController.isSpeaking) {
            this.faceController.toggleSpeaking();
          }
        }
      } else {
        // 流式播放完成：找到当前正在播放的项
        item = this.pendingPlayback.find(p => p.status === 'playing');
        if (item) {
          // 更新 metadata
          item.voice = metadata.voice || item.voice;
          item.emotion = metadata.emotion || item.emotion;
          
          // 标记为 completed
          item.status = 'completed';
          this.currentPlayingItem = null;
          
          // 如果是最后一条，停止播放
          if (item.isLast) {
            this.stopPlayback();
            return;
          }
          
          // 处理下一条
          this.processNextPlayback();
        }
      }
      return;
    }
    
    // 非流式模式：找到状态为 converting 的第一项
    const item = this.pendingPlayback.find(p => p.status === 'converting');
    if (!item) return;
    
    // 更新状态和数据
    item.status = 'ready';
    item.voice = metadata.voice || null;
    item.emotion = metadata.emotion || item.emotion;
    item.audioUrl = audioUrl;
    
    // 如果情绪改变，更新面部表情
    if (this.faceController && item.emotion) {
      this.faceController.setEmotion(item.emotion);
    }
    
    // 开始播放（如果是第一条）
    if (!this.isPlaying) {
      this.startPlayback();
    } else {
      // 如果正在播放，检查是否可以累加下一条
      this.checkAndQueueNext();
    }
  }

  // ========== 音频播放处理 ==========
  /**
   * 开始播放音频
   * 步骤：
   * 1. 找到第一条 ready 状态的项
   * 2. 开始播放（流式或非流式）
   * 3. 播放完成后处理下一条
   */
  async startPlayback() {
    const readyItem = this.pendingPlayback.find(p => p.status === 'ready');
    if (!readyItem) return;
    
    this.isPlaying = true;
    readyItem.status = 'playing';
    this.currentPlayingItem = readyItem;
    
    // 触发说话动画
    if (this.faceController && !this.faceController.isSpeaking) {
      this.faceController.toggleSpeaking();
    }
    
    try {
      // 流式模式下，audioUrl 为 null，播放已经在流式接收时开始
      if (readyItem.audioUrl === null) {
        // 流式播放已经在进行，等待完成
        // 这里不需要额外操作，流式播放完成时会调用 processNextPlayback
        // 但需要检查下一条是否已 ready，如果 ready 可以累加
        this.checkAndQueueNext();
        return;
      }
      
      // 非流式模式：播放音频
      await this.ttsManager.playAudio(readyItem.audioUrl);
      
      // 播放完成
      readyItem.status = 'completed';
      this.currentPlayingItem = null;
      
      // 如果是最后一条，停止播放
      if (readyItem.isLast) {
        this.stopPlayback();
        return;
      }
      
      // 处理下一条
      this.processNextPlayback();
    } catch (error) {
      console.error('音频播放失败:', error);
      readyItem.status = 'error';
      this.currentPlayingItem = null;
      this.processNextPlayback();
    }
  }

  /**
   * 处理下一条播放
   */
  async processNextPlayback() {
    // 移除已完成的项
    this.pendingPlayback = this.pendingPlayback.filter(p => p.status !== 'completed');
    
    // 检查是否有下一条 ready 的项
    const nextReady = this.pendingPlayback.find(p => p.status === 'ready');
    if (nextReady) {
      // 有下一条 ready，继续播放
      await this.startPlayback();
    } else {
      // 检查是否还有 converting 的项
      const hasConverting = this.pendingPlayback.some(p => p.status === 'converting');
      if (!hasConverting) {
        // 没有待处理的项，停止播放
        this.stopPlayback();
      }
    }
  }

  /**
   * 检查并累加下一条音频
   * 如果下一条已经 ready，可以提前准备
   * 注意：流式模式下，音频已经在接收时开始播放，这里主要是检查状态
   */
  checkAndQueueNext() {
    const nextItem = this.pendingPlayback.find(p => p.status === 'ready' && p !== this.currentPlayingItem);
    if (nextItem) {
      // 流式模式下，音频已经在播放，这里只需要确保状态正确
      // 非流式模式下，下一条会在当前播放完成后自动开始
      console.log('下一条音频已准备就绪:', nextItem.text.substring(0, 20));
    }
  }

  /**
   * 停止播放
   */
  stopPlayback() {
    this.isPlaying = false;
    
    if (this.faceController && this.faceController.isSpeaking) {
      this.faceController.toggleSpeaking();
    }
  }

  // ========== 清空和重置 ==========
  /**
   * 清空所有状态
   */
  clear() {
    this.accumulatedText = '';
    this.pendingTexts = [];
    this.pendingPlayback = [];
    this.isPlaying = false;
    this.stopPlayback();
  }

  // ========== 兼容旧接口 ==========
  /**
   * 播放文本（兼容旧接口）
   * @param {string} text - 文本内容
   * @param {string} voice - 音色（可选）
   */
  async speak(text, voice = null) {
    if (!text || !text.trim()) return;
    this.addText(text);
    this.markEnd();
  }
}
