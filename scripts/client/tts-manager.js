// TTS 文本转语音管理器
// 连接 Python tts_server.py 提供的 WebSocket 接口

class TTSManager {
  constructor() {
    this.websocket = null;
    this.WS_URL = 'ws://localhost:8766'; // TTS 服务器地址
    this.connectionPromise = null;
    this.isConnected = false;
    this.currentVoice = null;
    this.availableVoices = [];
    
    this.onAudioReadyCallback = null;
    this.onErrorCallback = null;
    this.audioQueue = []; // 音频播放队列
    this.isPlaying = false; // 是否正在播放
    this.currentAudioContext = null; // 当前音频上下文（用于流式播放）
    this.audioBuffers = []; // 音频缓冲区（用于累加）
    this.isStreaming = false; // 是否处于流式模式
    
    // Web Audio API 流式播放相关
    this.audioContext = null; // AudioContext 实例
    this.gainNode = null; // 增益节点
    this.scriptProcessorNode = null; // 音频处理节点
    this.pcmBuffer = null; // PCM 数据缓冲区（Float32Array）
    this.chunkSize = 2048; // 每段数据大小（采样点数）
    this.sampleRate = 24000; // 默认采样率
    this.isStreamingActive = false; // 流式播放是否激活
  }

  // 设置音频就绪回调（接收到音频数据时调用）
  onAudioReady(callback) {
    this.onAudioReadyCallback = callback;
  }

  // 设置错误回调
  onError(callback) {
    this.onErrorCallback = callback;
  }

  // 连接 WebSocket 服务器
  async connect() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.isConnected = true;
      return true;
    }
    
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.log('正在连接 TTS 服务器:', this.WS_URL);
        this.websocket = new WebSocket(this.WS_URL);
        
        this.websocket.onopen = () => {
          console.log('TTS 服务器连接成功');
          this.isConnected = true;
          this.connectionPromise = null;
          resolve(true);
        };
        
        this.websocket.onmessage = async (event) => {
          try {
            // 检查是否是二进制数据（音频）
            if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
              // 二进制音频数据
              if (this.isStreaming) {
                // 流式模式：接收到音频块就立即播放
                await this.handleStreamingAudioChunk(event.data);
              } else if (this.audioChunks) {
                // 非流式模式：累积音频块
                this.audioChunks.push(event.data);
              } else {
                // 单个音频块（完整音频）
                const blob = event.data instanceof Blob ? event.data : new Blob([event.data], { type: 'audio/mpeg' });
                const audioUrl = URL.createObjectURL(blob);
                if (this.onAudioReadyCallback) {
                  this.onAudioReadyCallback(audioUrl);
                }
              }
            } else {
              // JSON 消息
              const data = JSON.parse(event.data);
              
              if (data.type === 'audio_start') {
                console.log('开始接收音频数据', data.streaming ? '(流式)' : '', '格式:', data.format);
                this.isStreaming = data.streaming || false;
                this.audioFormat = data.format || 'pcm';
                // 如果是 PCM 格式，保存采样率等信息
                if (data.format === 'pcm') {
                  this.pcmSampleRate = data.sample_rate || 24000;
                  this.pcmChannels = data.channels || 1;
                  this.pcmBitsPerSample = data.bits_per_sample || 16;
                }
                
                if (this.isStreaming) {
                  // 流式模式：初始化播放
                  this.audioChunks = [];
                  this.audioBuffers = [];
                  await this.startStreamingPlayback();
                } else {
                  // 非流式模式：累积音频块
                  this.audioChunks = [];
                }
              } else if (data.type === 'audio_end') {
                console.log('音频数据接收完成');
                if (this.isStreaming) {
                  // 流式模式：结束播放
                  await this.endStreamingPlayback();
                  this.isStreaming = false;
                } else {
                  // 非流式模式：合并所有音频块
                  if (this.audioChunks && this.audioChunks.length > 0) {
                    const combinedAudio = new Blob(this.audioChunks, { type: `audio/${this.audioFormat || 'mpeg'}` });
                    const audioUrl = URL.createObjectURL(combinedAudio);
                    if (this.onAudioReadyCallback) {
                      this.onAudioReadyCallback(audioUrl);
                    }
                    this.audioChunks = [];
                    this.audioFormat = null;
                  }
                }
              } else if (data.type === 'voices_list') {
                this.availableVoices = data.voices || [];
                console.log('可用音色列表:', this.availableVoices);
              } else if (data.type === 'voice_set') {
                this.currentVoice = data.voice;
                console.log('音色已切换为:', data.voice);
              } else if (data.type === 'error') {
                console.error('TTS 错误:', data.message);
                if (this.onErrorCallback) {
                  this.onErrorCallback(new Error(data.message));
                }
              }
            }
          } catch (error) {
            // 如果不是 JSON，可能是二进制数据
            if (this.isStreaming) {
              await this.handleStreamingAudioChunk(event.data);
            } else if (this.audioChunks) {
              this.audioChunks.push(event.data);
            } else {
              console.error('处理 TTS 消息失败:', error);
            }
          }
        };
        
        this.websocket.onerror = (error) => {
          console.error('TTS WebSocket 连接错误:', error);
          this.connectionPromise = null;
          this.isConnected = false;
          reject(new Error('无法连接到 TTS 服务器，请确保 tts_server.py 正在运行'));
        };
        
        this.websocket.onclose = () => {
          console.log('TTS WebSocket 连接已关闭');
          this.websocket = null;
          this.isConnected = false;
          this.connectionPromise = null;
        };
      } catch (error) {
        this.connectionPromise = null;
        reject(error);
      }
    });
    
    return this.connectionPromise;
  }

  // 初始化 Web Audio API（用于流式播放）
  initAudioContext() {
    if (this.audioContext) {
      return;
    }
    
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContext();
      
      // 初始化增益节点
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = 1.0;
      
      // 初始化 ScriptProcessorNode（用于流式播放）
      // 注意：ScriptProcessorNode 已废弃，但为了兼容性仍使用
      // 可以考虑使用 AudioWorklet，但需要额外配置
      this.scriptProcessorNode = this.audioContext.createScriptProcessor(this.chunkSize, 0, 1);
      this.scriptProcessorNode.connect(this.gainNode);
      this.scriptProcessorNode.onaudioprocess = (event) => this.onAudioProcess(event);
      
      console.log('AudioContext 初始化完成，采样率:', this.audioContext.sampleRate);
    } catch (error) {
      console.error('初始化 AudioContext 失败:', error);
    }
  }

  // 音频处理回调（从缓冲区读取数据并播放）
  onAudioProcess(event) {
    const output = event.outputBuffer.getChannelData(0);
    
    if (this.pcmBuffer && this.pcmBuffer.length > 0) {
      // 从缓冲区读取数据
      const length = Math.min(this.chunkSize, this.pcmBuffer.length);
      output.set(this.pcmBuffer.subarray(0, length));
      
      // 移除已播放的数据
      if (this.pcmBuffer.length > length) {
        this.pcmBuffer = this.pcmBuffer.subarray(length);
      } else {
        this.pcmBuffer = new Float32Array(0);
      }
    } else {
      // 如果缓冲区为空，填充0
      for (let i = 0; i < output.length; i++) {
        output[i] = 0;
      }
    
    }
  }

  // 处理流式音频块（边接收边解码边播放）
  async handleStreamingAudioChunk(chunk) {
    if (!chunk) return;
    
    // 将音频块添加到缓冲区
    const blob = chunk instanceof Blob ? chunk : new Blob([chunk], { type: `audio/${this.audioFormat || 'mpeg'}` });
    this.audioBuffers.push(blob);
    
    // 如果还没有初始化 AudioContext，初始化它
    if (!this.audioContext) {
      this.initAudioContext();
    }
    
    // 如果还没有开始播放，开始播放
    if (!this.isStreamingActive && this.audioContext) {
      this.startStreamingPlayback();
    }
    
    // 解码并播放音频块
    this.decodeAndFeedAudio(blob);
  }

  // 解码音频块并添加到 PCM 缓冲区
  async decodeAndFeedAudio(blob) {
    if (!this.audioContext) {
      return;
    }
    
    try {
      const arrayBuffer = await blob.arrayBuffer();
      
      // 如果是 PCM 格式，直接转换为 Float32Array
      if (this.audioFormat === 'pcm') {
        // PCM 数据是 16位整数，需要转换为 Float32
        const int16Array = new Int16Array(arrayBuffer);
        const float32Array = new Float32Array(int16Array.length);
        
        // 转换为 -1.0 到 1.0 范围的浮点数
        for (let i = 0; i < int16Array.length; i++) {
          float32Array[i] = int16Array[i] / 32768.0;
        }
        
        // 如果采样率不匹配，进行重采样
        let dataToAppend = float32Array;
        if (this.pcmSampleRate && this.pcmSampleRate !== this.audioContext.sampleRate) {
          dataToAppend = this.resamplePCM(float32Array, this.pcmSampleRate, this.audioContext.sampleRate);
        }
        
        // 合并到 PCM 缓冲区
        if (!this.pcmBuffer || this.pcmBuffer.length === 0) {
          this.pcmBuffer = new Float32Array(dataToAppend);
        } else {
          const combined = new Float32Array(this.pcmBuffer.length + dataToAppend.length);
          combined.set(this.pcmBuffer);
          combined.set(dataToAppend, this.pcmBuffer.length);
          this.pcmBuffer = combined;
        }
      } else {
        // 其他格式（如 MP3），使用 decodeAudioData
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        
        // 获取 PCM 数据（Float32Array）
        const pcmData = audioBuffer.getChannelData(0);
        
        // 如果采样率不匹配，进行重采样
        let dataToAppend = pcmData;
        if (audioBuffer.sampleRate !== this.audioContext.sampleRate) {
          dataToAppend = this.resamplePCM(pcmData, audioBuffer.sampleRate, this.audioContext.sampleRate);
        }
        
        // 合并到 PCM 缓冲区
        if (!this.pcmBuffer || this.pcmBuffer.length === 0) {
          this.pcmBuffer = new Float32Array(dataToAppend);
        } else {
          const combined = new Float32Array(this.pcmBuffer.length + dataToAppend.length);
          combined.set(this.pcmBuffer);
          combined.set(dataToAppend, this.pcmBuffer.length);
          this.pcmBuffer = combined;
        }
      }
      
      // 从 audioBuffers 中移除已处理的块
      const index = this.audioBuffers.indexOf(blob);
      if (index > -1) {
        this.audioBuffers.splice(index, 1);
      }
    } catch (error) {
      console.error('解码音频失败:', error);
      // 从 audioBuffers 中移除失败的块
      const index = this.audioBuffers.indexOf(blob);
      if (index > -1) {
        this.audioBuffers.splice(index, 1);
      }
    }
  }

  // 线性插值重采样
  resamplePCM(input, inputSampleRate, outputSampleRate) {
    const ratio = outputSampleRate / inputSampleRate;
    const outputLength = Math.round(input.length * ratio);
    const output = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      // 线性插值
      const origin = i / ratio;
      const lower = Math.floor(origin);
      const upper = Math.min(Math.ceil(origin), input.length - 1);
      const weight = origin - lower;
      output[i] = input[lower] * (1 - weight) + input[upper] * weight;
    }
    
    return output;
  }

  // 开始流式播放
  async startStreamingPlayback() {
    if (!this.audioContext) {
      this.initAudioContext();
    }
    
    if (!this.audioContext) {
      console.error('无法初始化 AudioContext');
      return;
    }
    
    // 恢复 AudioContext（如果被暂停）
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    
    this.isStreamingActive = true;
    this.pcmBuffer = new Float32Array(0);
    console.log('开始流式播放');
  }

  // 结束流式播放
  async endStreamingPlayback() {
    // 等待所有缓冲区播放完成
    while (this.audioBuffers.length > 0 || (this.pcmBuffer && this.pcmBuffer.length > 0)) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.isStreamingActive = false;
    console.log('流式播放完成');
    
    // 通知播放完成（流式模式下传入 null，表示不使用 Audio 元素）
    if (this.onAudioReadyCallback) {
      try {
        this.onAudioReadyCallback(null);
      } catch (error) {
        console.error('流式播放完成回调错误:', error);
      }
    }
  }

  // 停止播放并清理资源
  stopStreamingPlayback() {
    this.isStreamingActive = false;
    this.pcmBuffer = new Float32Array(0);
    this.audioBuffers = [];
    
    if (this.scriptProcessorNode) {
      this.scriptProcessorNode.disconnect();
    }
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
  }

  // 合成语音
  async synthesize(text, voice = null) {
    if (!this.isConnected) {
      await this.connect();
    }
    
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('TTS 服务器未连接');
    }
    
    // 发送合成请求
    this.websocket.send(JSON.stringify({
      type: 'synthesize',
      text: text,
      voice: voice || this.currentVoice
    }));
  }

  // 获取可用音色列表
  async listVoices() {
    if (!this.isConnected) {
      await this.connect();
    }
    
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('TTS 服务器未连接');
    }
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('获取音色列表超时'));
      }, 5000);
      
      const originalCallback = this.onAudioReadyCallback;
      const messageHandler = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'voices_list') {
            clearTimeout(timeout);
            this.websocket.removeEventListener('message', messageHandler);
            resolve(data.voices);
          }
        } catch (e) {
          // 忽略非 JSON 消息
        }
      };
      
      this.websocket.addEventListener('message', messageHandler);
      this.websocket.send(JSON.stringify({ type: 'list_voices' }));
    });
  }

  // 设置音色
  async setVoice(voice) {
    if (!this.isConnected) {
      await this.connect();
    }
    
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      throw new Error('TTS 服务器未连接');
    }
    
    this.websocket.send(JSON.stringify({
      type: 'set_voice',
      voice: voice
    }));
    
    this.currentVoice = voice;
  }

  // 播放音频（使用 HTML5 Audio API）
  playAudio(audioUrl) {
    return new Promise((resolve, reject) => {
      // 检查 audioUrl 是否有效
      if (!audioUrl) {
        reject(new Error('无效的音频 URL'));
        return;
      }
      
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl); // 清理 URL
        resolve();
      };
      
      audio.onerror = (error) => {
        console.error('Audio 播放错误:', error);
        URL.revokeObjectURL(audioUrl);
        // 提供更详细的错误信息
        const errorMessage = audio.error ? 
          `音频播放失败: ${audio.error.code} - ${audio.error.message}` : 
          '音频播放失败';
        reject(new Error(errorMessage));
      };
      
      audio.play().catch((error) => {
        console.error('Audio play() 失败:', error);
        URL.revokeObjectURL(audioUrl);
        reject(error);
      });
    });
  }

  // 文本转语音并播放（便捷方法）
  async speak(text, voice = null) {
    // 绿色console输出，显示大模型返回的内容
    console.log('%c[TTS] 大模型返回内容转语音:', 'color: #00ff00; font-weight: bold;', text);
    
    return new Promise(async (resolve, reject) => {
      try {
        // 设置临时回调来接收音频
        const originalCallback = this.onAudioReadyCallback;
        this.onAudioReadyCallback = async (audioUrl) => {
          try {
            // 如果是流式模式，audioUrl 可能为 null（表示播放完成）
            if (audioUrl === null) {
              // 流式播放已完成，直接 resolve
              resolve();
            } else if (audioUrl) {
              // 非流式模式，使用 Audio 元素播放
              await this.playAudio(audioUrl);
              resolve();
            } else {
              // audioUrl 为空或无效，可能是错误
              reject(new Error('无效的音频 URL'));
            }
          } catch (error) {
            reject(error);
          } finally {
            this.onAudioReadyCallback = originalCallback;
          }
        };
        
        await this.synthesize(text, voice);
      } catch (error) {
        reject(error);
      }
    });
  }

  // 初始化（预先连接）
  async init() {
    console.log('TTS 管理器初始化中...');
    try {
      await this.connect();
      // 获取可用音色列表
      try {
        this.availableVoices = await this.listVoices();
        console.log('可用音色:', this.availableVoices.length, '个');
      } catch (error) {
        console.warn('获取音色列表失败:', error);
      }
    } catch (error) {
      console.warn('TTS 预连接失败（将在使用时重试）:', error);
    }
  }

  // 关闭连接
  close() {
    if (this.websocket) {
      this.websocket.close();
      this.websocket = null;
      this.isConnected = false;
    }
  }
}

// 导出单例
const ttsManager = new TTSManager();
export default ttsManager;

