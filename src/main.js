import { createApp } from 'vue'
import App from './App.vue'
import './styles/main.css'

// 错误处理
window.addEventListener('error', (event) => {
  console.error('全局错误捕获:', event.error)
  const errorInfo = {
    message: event.error?.message || event.message,
    stack: event.error?.stack || 'No stack trace',
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno
  }
  console.error('错误详情:', errorInfo)
  
  if (window.electronAPI && window.electronAPI.reportError) {
    window.electronAPI.reportError('renderer-error', errorInfo)
  }
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('未处理的 Promise 拒绝:', event.reason)
  const errorInfo = {
    reason: event.reason instanceof Error ? {
      message: event.reason.message,
      stack: event.reason.stack,
      name: event.reason.name
    } : event.reason
  }
  
  if (window.electronAPI && window.electronAPI.reportError) {
    window.electronAPI.reportError('unhandledrejection', errorInfo)
  }
})

createApp(App).mount('#app')
