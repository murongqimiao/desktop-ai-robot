<template>
  <div class="window-container" :class="{ expanded: isExpanded }" @dblclick="toggleExpand">
    <RobotFace ref="faceRef" />
    <ChatHistory 
      v-show="isExpanded"
      :messages="conversationHistory"
      :current-ai-response="currentAIResponse"
    />
    <ChatInput 
      v-show="isExpanded"
      @submit="handleTextSubmit"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import RobotFace from './components/RobotFace.vue'
import ChatHistory from './components/ChatHistory.vue'
import ChatInput from './components/ChatInput.vue'
import { useHear } from './composables/useHear'
import { useSpeak } from './composables/useSpeak'
import { useFace } from './composables/useFace'

const isExpanded = ref(false)
const faceRef = ref(null)
const conversationHistory = ref([])
const currentAIResponse = ref('')

const { faceController } = useFace(faceRef)
// 使用 computed 来确保响应式
const faceControllerValue = computed(() => {
  return faceController.value
})
const { hearController } = useHear(() => faceControllerValue.value)
const { speakController } = useSpeak(() => faceControllerValue.value)

// 切换展开/折叠
const toggleExpand = () => {
  isExpanded.value = !isExpanded.value
}

// 处理文本提交
const handleTextSubmit = async (text) => {
  if (!text || !text.trim()) return
  
  const userInput = text.trim()
  
  // 添加用户消息
  conversationHistory.value.push({
    type: 'user',
    text: userInput,
    timestamp: Date.now()
  })
  
  // 通过 WebSocket 发送文本消息
  const asrManager = hearController.getASRManager()
  
  if (!asrManager) {
    console.error('ASR 管理器未初始化')
    alert('ASR 服务未就绪，请确保已运行 npm run dev 启动所有服务')
    return
  }
  
  // 如果 WebSocket 未连接，尝试连接
  if (!asrManager.websocket || asrManager.websocket.readyState !== WebSocket.OPEN) {
    console.log('WebSocket 未连接，尝试连接...')
    try {
      await asrManager.connectWebSocket()
    } catch (error) {
      console.error('连接 ASR 服务器失败:', error)
      alert('无法连接到 ASR 服务器，请确保已运行: npm run dev 或 npm run asr:start')
      return
    }
  }
  
  // 发送消息
  if (asrManager.websocket && asrManager.websocket.readyState === WebSocket.OPEN) {
    asrManager.websocket.send(JSON.stringify({
      type: 'text_input',
      text: userInput
    }))
    console.log('已发送文本消息:', userInput)
  } else {
    console.error('WebSocket 连接状态异常:', asrManager.websocket?.readyState)
    alert('WebSocket 连接异常，请检查 ASR 服务器是否正常运行')
  }
}

// AI 响应回调函数
const aiResponseStreamCallback = (event, data) => {
  console.log('[App.vue] AI 响应回调被调用:', event, data)
  
  if (event === 'start') {
    console.log('AI 流式响应开始 - 用户输入:', data.user_input)
    currentAIResponse.value = ''
    speakController.clear()
    
    // 添加用户消息到对话历史（如果还没有）
    if (data.user_input) {
      const lastMessage = conversationHistory.value[conversationHistory.value.length - 1]
      if (!lastMessage || lastMessage.type !== 'user' || lastMessage.text !== data.user_input) {
        conversationHistory.value.push({
          type: 'user',
          text: data.user_input,
          timestamp: Date.now()
        })
      }
    }
  } else if (event === 'chunk') {
    if (data.chunk && data.chunk.trim()) {
      speakController.addText(data.chunk)
      currentAIResponse.value += data.chunk
      
      // 更新或创建 AI 消息
      const lastMessage = conversationHistory.value[conversationHistory.value.length - 1]
      if (lastMessage && lastMessage.type === 'ai') {
        lastMessage.text = currentAIResponse.value
      } else if (currentAIResponse.value.trim()) {
        conversationHistory.value.push({
          type: 'ai',
          text: currentAIResponse.value,
          timestamp: Date.now()
        })
      }
    }
  } else if (event === 'end') {
    console.log('AI 流式响应结束', data)
    
    if (data.error) {
      console.error('AI 响应错误:', data.error)
      // 显示错误消息
      const errorMessage = data.error || 'AI 响应失败'
      const lastMessage = conversationHistory.value[conversationHistory.value.length - 1]
      if (lastMessage && lastMessage.type === 'ai') {
        lastMessage.text = `错误: ${errorMessage}`
      } else {
        conversationHistory.value.push({
          type: 'ai',
          text: `错误: ${errorMessage}`,
          timestamp: Date.now()
        })
      }
    } else if (data.full_text) {
      const lastMessage = conversationHistory.value[conversationHistory.value.length - 1]
      if (lastMessage && lastMessage.type === 'ai') {
        lastMessage.text = data.full_text
      } else {
        conversationHistory.value.push({
          type: 'ai',
          text: data.full_text,
          timestamp: Date.now()
        })
      }
    }
    currentAIResponse.value = ''
    speakController.markEnd()
  }
}

onMounted(async () => {
  // 延迟初始化，确保 DOM 已加载
  setTimeout(async () => {
    try {
      await hearController.init()
      await speakController.init()
      
      // 在初始化完成后设置 AI 响应回调
      console.log('[App.vue] 设置 AI 响应回调...')
      hearController.setAIResponseStreamCallback(aiResponseStreamCallback)
      console.log('[App.vue] AI 响应回调已设置')
      
      // 设置触摸检测
      hearController.setupTouchDetection()
    } catch (error) {
      console.error('初始化失败:', error)
      console.warn('提示：如果 ASR/TTS 服务器未启动，请运行: npm run dev')
    }
  }, 2000)
})
</script>

<style scoped>
.window-container {
  width: 200px;
  height: 550px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  -webkit-app-region: drag;
  app-region: drag;
  clip-path: inset(0 0 calc(100% - 133px) 0);
  transition: clip-path 0.3s ease-out;
}

.window-container.expanded {
  clip-path: inset(0 0 0 0);
}

.window-container::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 200px;
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) no-repeat left top;
  border-radius: 10px;
  -webkit-app-region: drag;
  z-index: 0;
}

.window-container > * {
  position: relative;
  z-index: 1;
}
</style>
