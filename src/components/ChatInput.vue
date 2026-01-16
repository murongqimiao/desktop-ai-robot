<template>
  <div class="chat-input-container">
    <input
      v-model="inputText"
      type="text"
      class="chat-input"
      placeholder="输入消息..."
      @keydown.enter="handleSubmit"
      :disabled="isSubmitting"
    />
    <button
      class="chat-submit-btn"
      @click="handleSubmit"
      :disabled="isSubmitting || !inputText.trim()"
    >
      发送
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['submit'])

const inputText = ref('')
const isSubmitting = ref(false)

const handleSubmit = async () => {
  if (!inputText.value.trim() || isSubmitting.value) {
    return
  }

  const text = inputText.value.trim()
  isSubmitting.value = true

  try {
    emit('submit', text)
    inputText.value = ''
  } catch (error) {
    console.error('发送消息失败:', error)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
@import '../styles/chat-input.css';
</style>
