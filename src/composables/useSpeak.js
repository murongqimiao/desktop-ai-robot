import { ref } from 'vue'
import { SpeakController } from '../scripts/robot/speak.js'

export function useSpeak(getFaceController) {
  const speakController = ref(null)

  const init = async () => {
    if (!speakController.value) {
      const faceController = typeof getFaceController === 'function' ? getFaceController() : getFaceController
      if (faceController) {
        speakController.value = new SpeakController(faceController)
        await speakController.value.init()
      }
    }
    return speakController.value
  }

  return {
    speakController: {
      get value() {
        return speakController.value
      },
      init,
      clear: () => speakController.value?.clear(),
      addText: (text) => speakController.value?.addText(text),
      markEnd: () => speakController.value?.markEnd()
    }
  }
}
