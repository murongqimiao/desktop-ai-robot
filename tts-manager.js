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
              if (this.audioChunks) {
                // 正在接收音频流
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
                console.log('开始接收音频数据，总大小:', data.total_size);
                this.audioChunks = [];
                this.audioFormat = data.format || 'mp3';
              } else if (data.type === 'audio_end') {
                console.log('音频数据接收完成');
                // 合并所有音频块
                if (this.audioChunks && this.audioChunks.length > 0) {
                  const combinedAudio = new Blob(this.audioChunks, { type: `audio/${this.audioFormat || 'mpeg'}` });
                  const audioUrl = URL.createObjectURL(combinedAudio);
                  if (this.onAudioReadyCallback) {
                    this.onAudioReadyCallback(audioUrl);
                  }
                  this.audioChunks = [];
                  this.audioFormat = null;
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
            if (this.audioChunks) {
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

  // 处理音频数据块
  handleAudioChunk(chunk) {
    if (!this.audioChunks) {
      this.audioChunks = [];
    }
    this.audioChunks.push(chunk);
    this.receivedChunks++;
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
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl); // 清理 URL
        resolve();
      };
      
      audio.onerror = (error) => {
        URL.revokeObjectURL(audioUrl);
        reject(error);
      };
      
      audio.play().catch(reject);
    });
  }

  // 文本转语音并播放（便捷方法）
  async speak(text, voice = null) {
    return new Promise(async (resolve, reject) => {
      try {
        // 设置临时回调来接收音频
        const originalCallback = this.onAudioReadyCallback;
        this.onAudioReadyCallback = async (audioUrl) => {
          try {
            await this.playAudio(audioUrl);
            resolve();
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

