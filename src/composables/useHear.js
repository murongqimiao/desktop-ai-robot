import { ref } from 'vue'
import { HearController } from '../scripts/robot/hear.js'

export function useHear(getFaceController) {
  const hearController = ref(null)

  const init = async () => {
    if (!hearController.value) {
      const faceController = typeof getFaceController === 'function' ? getFaceController() : getFaceController
      if (faceController) {
        hearController.value = new HearController(faceController)
        await hearController.value.init()
      }
    }
    return hearController.value
  }

  return {
    hearController: {
      get value() {
        return hearController.value
      },
      init,
      getASRManager: () => hearController.value?.getASRManager(),
      setAIResponseStreamCallback: (callback) => {
        if (hearController.value) {
          hearController.value.setAIResponseStreamCallback(callback)
        }
      },
      setupTouchDetection: () => {
        if (hearController.value) {
          hearController.value.setupTouchDetection()
        }
      }
    }
  }
}
