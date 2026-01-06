// ASR 语音识别管理器
// 使用 Python asr_server.py 提供的 WebSocket 接口
// 实现触摸激活、自动休眠等功能

class ASRManager {
  constructor() {
    this.isActive = false;
    this.isSleeping = true;
    this.activationTimeout = null;
    this.sleepTimeout = null;
    this.websocket = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.audioProcessor = null; // 音频处理器引用
    this.ACTIVATION_DELAY = 1000; // 1秒激活窗口（优化：从10秒减少到1秒）
    this.SLEEP_DELAY = 10000; // 10秒无操作后休眠
    this.WS_URL = 'ws://localhost:8765'; // ASR 服务器地址
    
    this.onResultCallback = null;
    this.onErrorCallback = null;
    this.onSentenceCompleteCallback = null; // 句子完成回调
    this.onAIResponseCallback = null; // AI 响应回调（完整响应，兼容旧版本）
    this.onAIResponseStreamCallback = null; // AI 流式响应回调
    this.isWebSocketReady = false; // WebSocket 是否已准备好
    this.isMicrophoneReady = false; // 麦克风是否已准备好
    this.connectionPromise = null; // WebSocket 连接 Promise（避免重复连接）
  }

  // 设置识别结果回调
  onResult(callback) {
    this.onResultCallback = callback;
  }

  // 设置错误回调
  onError(callback) {
    this.onErrorCallback = callback;
  }

  // 设置句子完成回调
  onSentenceComplete(callback) {
    this.onSentenceCompleteCallback = callback;
  }

  // 设置 AI 响应回调（完整响应，兼容旧版本）
  onAIResponse(callback) {
    this.onAIResponseCallback = callback;
  }

  // 设置 AI 流式响应回调
  onAIResponseStream(callback) {
    this.onAIResponseStreamCallback = callback;
  }

  // 连接 WebSocket 服务器（优化：避免重复连接）
  async connectWebSocket() {
    // 如果已经连接或正在连接，返回现有连接
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.isWebSocketReady = true;
      return true;
    }
    
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.log('正在连接 ASR 服务器:', this.WS_URL);
        this.websocket = new WebSocket(this.WS_URL);
        
        this.websocket.onopen = () => {
          console.log('ASR 服务器连接成功');
          // 发送 start 消息初始化识别器
          this.websocket.send(JSON.stringify({ type: 'start' }));
        };
        
        this.websocket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ready') {
              console.log('ASR 识别器已就绪');
              this.isWebSocketReady = true;
              this.connectionPromise = null;
              resolve(true);
            } else if (data.type === 'result' || data.type === 'final') {
              // 最终识别结果
              if (data.text) {
                console.log('识别结果:', data.text);
                if (this.onResultCallback) {
                  this.onResultCallback(data.text);
                }
              }
            } else if (data.type === 'partial') {
              // 部分识别结果
              if (data.text) {
                console.log('部分识别:', data.text);
              }
            } else if (data.type === 'sentence_complete') {
              // 句子完成（但未调用 AI）
              console.log('句子完成:', data.text);
              if (this.onSentenceCompleteCallback) {
                this.onSentenceCompleteCallback(data.text);
              }
            } else if (data.type === 'ai_response') {
              // AI 响应（完整响应，兼容旧版本）
              console.log('AI 响应 - 用户输入:', data.user_input);
              console.log('AI 响应 - 回复:', data.response);
              if (this.onAIResponseCallback) {
                this.onAIResponseCallback(data.user_input, data.response);
              }
            } else if (data.type === 'ai_response_stream_start') {
              // 流式响应开始
              console.log('AI 流式响应开始 - 用户输入:', data.user_input);
              if (this.onAIResponseStreamCallback) {
                this.onAIResponseStreamCallback('start', { user_input: data.user_input });
              }
            } else if (data.type === 'ai_response_stream') {
              // 流式响应片段
              if (this.onAIResponseStreamCallback) {
                this.onAIResponseStreamCallback('chunk', {
                  chunk: data.chunk,
                  accumulated: data.accumulated
                });
              }
            } else if (data.type === 'ai_response_stream_end') {
              // 流式响应结束
              console.log('AI 流式响应结束');
              if (this.onAIResponseStreamCallback) {
                this.onAIResponseStreamCallback('end', {
                  full_text: data.full_text,
                  error: data.error
                });
              }
            }
          } catch (error) {
            console.error('解析 WebSocket 消息失败:', error);
          }
        };
        
        this.websocket.onerror = (error) => {
          console.error('WebSocket 连接错误:', error);
          this.connectionPromise = null;
          this.isWebSocketReady = false;
          reject(new Error('无法连接到 ASR 服务器，请确保 asr_server.py 正在运行'));
        };
        
        this.websocket.onclose = () => {
          console.log('WebSocket 连接已关闭');
          this.websocket = null;
          this.isWebSocketReady = false;
          this.connectionPromise = null;
          if (this.isActive) {
            // 如果还在激活状态，尝试重连
            console.log('尝试重新连接...');
            setTimeout(() => {
              if (this.isActive) {
                this.connectWebSocket().catch(err => {
                  console.error('重连失败:', err);
                  if (this.onErrorCallback) {
                    this.onErrorCallback(err);
                  }
                });
              }
            }, 2000);
          }
        };
      } catch (error) {
        this.connectionPromise = null;
        reject(error);
      }
    });
    
    return this.connectionPromise;
  }

  // 预先请求麦克风权限（优化：提前准备）
  async prepareMicrophone() {
    if (this.isMicrophoneReady) {
      return true;
    }
    
    try {
      // 先请求权限，但不立即开始录音
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      // 获取权限后立即停止，等真正激活时再开始
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
      
      this.isMicrophoneReady = true;
      console.log('麦克风权限已准备就绪');
      return true;
    } catch (error) {
      console.warn('麦克风权限请求失败（将在激活时重试）:', error);
      this.isMicrophoneReady = false;
      return false;
    }
  }

  // 将 Float32Array 转换为 16-bit PCM 格式
  floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  }

  // 用户触摸窗口 - 准备激活
  touchDetected() {
    console.log('检测到用户触摸，准备激活 ASR...');
    
    // 清除之前的休眠定时器
    if (this.sleepTimeout) {
      clearTimeout(this.sleepTimeout);
      this.sleepTimeout = null;
    }

    // 如果正在休眠，准备激活
    if (this.isSleeping && !this.isActive) {
      // 清除之前的激活定时器
      if (this.activationTimeout) {
        clearTimeout(this.activationTimeout);
      }

      // 设置激活定时器（10秒内激活）
      this.activationTimeout = setTimeout(() => {
        this.activate();
      }, this.ACTIVATION_DELAY);
    } else if (this.isActive) {
      // 如果已经激活，重置休眠定时器
      this.resetSleepTimer();
    }
  }

  // 激活 ASR（优化：并行执行连接和麦克风准备）
  async activate() {
    if (this.isActive) {
      return; // 已经激活
    }

    console.log('激活 ASR 服务...');
    this.isActive = true;
    this.isSleeping = false;

    // 清除激活定时器
    if (this.activationTimeout) {
      clearTimeout(this.activationTimeout);
      this.activationTimeout = null;
    }

    try {
      // 优化：并行执行 WebSocket 连接和麦克风准备
      const [wsReady, micReady] = await Promise.allSettled([
        this.connectWebSocket().catch(err => {
          console.warn('WebSocket 连接失败，将重试:', err);
          return false;
        }),
        this.startRecording().catch(err => {
          console.warn('麦克风启动失败，将重试:', err);
          return false;
        })
      ]);

      // 检查是否都成功
      if (wsReady.status === 'rejected' || (wsReady.status === 'fulfilled' && !wsReady.value)) {
        throw new Error('WebSocket 连接失败');
      }
      
      if (micReady.status === 'rejected' || (micReady.status === 'fulfilled' && !micReady.value)) {
        throw new Error('麦克风启动失败');
      }

      // 重置休眠定时器
      this.resetSleepTimer();

      console.log('ASR 服务已激活');
    } catch (error) {
      console.error('激活 ASR 失败:', error);
      this.isActive = false;
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    }
  }

  // 开始录音（优化：如果已经准备好权限，直接使用）
  async startRecording() {
    try {
      // 每次激活时都需要重新获取 mediaStream（因为之前可能被停止了）
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      // 清理旧的 processor（如果存在）
      if (this.audioProcessor) {
        try {
          this.audioProcessor.disconnect();
        } catch (e) {
          // 忽略错误
        }
        this.audioProcessor = null;
      }

      // 创建音频上下文（如果还没有或已关闭）
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000
        });
      }

      // 如果音频上下文被暂停，恢复它
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.audioProcessor.onaudioprocess = (e) => {
        if (!this.isActive || !this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
          return;
        }

        // 获取音频数据（Float32Array，范围 -1.0 到 1.0）
        const inputData = e.inputBuffer.getChannelData(0);
        
        // 转换为 16-bit PCM 格式
        const pcmData = this.floatTo16BitPCM(inputData);
        
        // 通过 WebSocket 发送音频数据
        this.websocket.send(pcmData);
      };

      source.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);
      
      this.isMicrophoneReady = true;
      return true;

    } catch (error) {
      console.error('启动录音失败:', error);
      this.isMicrophoneReady = false;
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
      throw error;
    }
  }

  // 重置休眠定时器
  resetSleepTimer() {
    if (this.sleepTimeout) {
      clearTimeout(this.sleepTimeout);
    }

    // 如果已激活，设置休眠定时器
    if (this.isActive) {
      this.sleepTimeout = setTimeout(() => {
        this.sleep();
      }, this.SLEEP_DELAY);
    }
  }

  // 休眠 ASR
  sleep() {
    if (!this.isActive) {
      return;
    }

    console.log('ASR 服务进入休眠状态...');
    this.isActive = false;
    this.isSleeping = true;

    // 停止录音
    this.stopRecording();

    // 关闭 WebSocket 连接
    if (this.websocket) {
      // 发送 stop 消息获取最终结果
      if (this.websocket.readyState === WebSocket.OPEN) {
        this.websocket.send(JSON.stringify({ type: 'stop' }));
        // 等待一下再关闭，确保服务器处理完最终结果
        setTimeout(() => {
          if (this.websocket) {
            this.websocket.close();
            this.websocket = null;
          }
        }, 500);
      } else {
        this.websocket.close();
        this.websocket = null;
      }
    }

    // 清除所有定时器
    if (this.activationTimeout) {
      clearTimeout(this.activationTimeout);
      this.activationTimeout = null;
    }
    if (this.sleepTimeout) {
      clearTimeout(this.sleepTimeout);
      this.sleepTimeout = null;
    }

    console.log('ASR 服务已休眠');
  }

  // 停止录音
  stopRecording() {
    // 断开音频处理器
    if (this.audioProcessor) {
      try {
        this.audioProcessor.disconnect();
      } catch (e) {
        // 忽略断开连接时的错误
      }
      this.audioProcessor = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // 注意：不关闭 audioContext，以便下次快速恢复
    // 只暂停它，而不是关闭
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.suspend();
    }
    
    this.isMicrophoneReady = false;
  }

  // 初始化（优化：预先准备连接和权限）
  async init() {
    console.log('ASR 管理器初始化中...');
    // 预先连接 WebSocket（不阻塞）
    this.connectWebSocket().catch(err => {
      console.warn('预连接 WebSocket 失败（将在激活时重试）:', err);
    });
    
    // 预先请求麦克风权限（不阻塞）
    this.prepareMicrophone().catch(err => {
      console.warn('预准备麦克风失败（将在激活时重试）:', err);
    });
  }

  // 销毁资源
  destroy() {
    this.sleep();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// 导出单例
const asrManager = new ASRManager();
export default asrManager;
