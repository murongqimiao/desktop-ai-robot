import { ref, onMounted } from 'vue'
import { FaceController } from '../scripts/robot/face.js'

export function useFace(faceRef) {
  const faceController = ref(null)

  onMounted(() => {
    // 等待 DOM 渲染完成
    setTimeout(() => {
      // FaceController 使用全局 querySelector，所以不需要传递 ref
      // 只要确保 DOM 已经渲染即可
      faceController.value = new FaceController()
      
      // 初始化随机情绪
      const emotions = ['normal', 'happy', 'sad', 'thinking', 'cunning']
      const randomChoice = (array) => array[Math.floor(Math.random() * array.length)]
      faceController.value.setEmotion(randomChoice(emotions))
    }, 200)
  })

  return {
    faceController
  }
}
