<template>
  <div class="chat-history" ref="chatHistoryRef">
    <div v-if="displayMessages.length === 0" class="chat-history-empty">
      暂无对话记录
    </div>
    <div
      v-for="(msg, index) in displayMessages"
      :key="index"
      class="chat-message"
      :class="msg.type"
    >
      <div class="message-bubble">{{ msg.text }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  },
  currentAiResponse: {
    type: String,
    default: ''
  }
})

const chatHistoryRef = ref(null)

const displayMessages = computed(() => {
  const msgs = [...props.messages]
  // 如果有正在接收的 AI 响应，更新最后一条 AI 消息
  if (props.currentAiResponse && msgs.length > 0) {
    const lastMsg = msgs[msgs.length - 1]
    if (lastMsg.type === 'ai') {
      return [...msgs.slice(0, -1), { ...lastMsg, text: props.currentAiResponse }]
    }
  }
  return msgs
})

// 自动滚动到底部
watch(displayMessages, () => {
  nextTick(() => {
    if (chatHistoryRef.value) {
      chatHistoryRef.value.scrollTop = chatHistoryRef.value.scrollHeight
    }
  })
}, { deep: true })
</script>

<style scoped>
@import '../styles/chat-history.css';
</style>
