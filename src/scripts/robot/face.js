// 面部动作和表情控制模块
// 负责眼睛、嘴巴、情绪等面部动画

export class FaceController {
  constructor() {
    this.eyes = document.querySelectorAll('.eye');
    this.pupils = document.querySelectorAll('.pupil');
    this.mouth = document.querySelector('.mouth');
    this.isThinking = false;
    this.isSpeaking = false;
    this.thinkingTimeout = null;
    this.speakingInterval = null;
    this.currentEmotion = null;
    this.emotionInterval = null;
    this.randomActionInterval = null;
    
    // 可用的动作
    this.pupilActions = ['left', 'right', 'up', 'down', 'up-left', 'up-right', 'down-left', 'down-right', 'center'];
    this.eyeActions = ['up', 'down', 'left', 'right', 'up-left', 'up-right', 'down-left', 'down-right', 'center'];
    this.eye3DActions = ['up', 'down', 'left', 'right', 'normal'];
    
    // 启动持续眨眼
    this.startBlinking();
  }

  // 随机选择数组中的元素
  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  // 眨眼动画
  triggerBlink() {
    this.pupils.forEach(pupil => {
      pupil.classList.remove('blinking');
      void pupil.offsetWidth; // 强制重排
      pupil.classList.add('blinking');
      setTimeout(() => {
        pupil.classList.remove('blinking');
      }, 400);
    });
  }

  // 启动持续眨眼
  startBlinking() {
    setInterval(() => {
      this.triggerBlink();
    }, 3000 + Math.random() * 2000); // 3-5秒随机眨眼
  }

  // 眼睛看向不同方向
  lookDirection(direction) {
    if (this.isThinking) {
      this.stopThinking();
    }

    this.pupils.forEach(pupil => {
      pupil.classList.remove('look-left', 'look-right', 'look-up', 'look-down', 
        'look-up-left', 'look-up-right', 'look-down-left', 'look-down-right',
        'look-center', 'thinking', 'blinking');
    });

    if (direction !== 'center') {
      this.pupils.forEach(pupil => {
        pupil.classList.add(`look-${direction}`);
      });
    } else {
      this.pupils.forEach(pupil => {
        pupil.classList.add('look-center');
      });
    }
  }

  // 思考转圈动画
  triggerThinking() {
    if (this.isThinking) {
      this.stopThinking();
      return;
    }

    this.isThinking = true;
    
    this.pupils.forEach(pupil => {
      pupil.classList.remove('look-left', 'look-right', 'look-up', 'look-down', 'look-center');
      pupil.classList.add('look-center');
    });

    setTimeout(() => {
      this.pupils.forEach(pupil => {
        pupil.classList.remove('look-center');
        pupil.classList.add('thinking');
      });
    }, 300);

    this.thinkingTimeout = setTimeout(() => {
      this.stopThinking();
    }, 10000);
  }

  // 停止思考动画
  stopThinking() {
    this.isThinking = false;
    if (this.thinkingTimeout) {
      clearTimeout(this.thinkingTimeout);
      this.thinkingTimeout = null;
    }
    
    this.pupils.forEach(pupil => {
      pupil.classList.remove('thinking');
      pupil.classList.add('look-center');
    });
  }

  // 移动眼睛位置
  moveEyes(position) {
    this.eyes.forEach(eye => {
      eye.classList.remove('position-up', 'position-down', 'position-left', 'position-right', 'position-center',
        'position-up-left', 'position-up-right', 'position-down-left', 'position-down-right',
        'face-normal', 'face-up', 'face-down', 'face-left', 'face-right');
      if (position !== 'center') {
        eye.classList.add(`position-${position}`);
      } else {
        eye.classList.add('position-center');
      }
    });
  }

  // 设置眼睛3D朝向
  setFaceOrientation(orientation) {
    this.eyes.forEach(eye => {
      eye.classList.remove('position-up', 'position-down', 'position-center',
        'position-up-left', 'position-up-right', 'position-down-left', 'position-down-right',
        'face-normal', 'face-up', 'face-down', 'face-left', 'face-right');
      if (orientation && orientation !== 'normal') {
        eye.classList.add(`face-${orientation}`);
      } else {
        eye.classList.add('face-normal');
      }
    });
  }

  // 设置嘴巴样式
  setMouthStyle(style) {
    if (!this.mouth) return;
    
    this.mouth.classList.remove('line', 'circle', 'arc-up', 'arc-down', 'rectangle', 'speaking');
    if (style) {
      this.mouth.classList.add(style);
    } else {
      this.mouth.classList.add('line');
    }
  }

  // 控制说话状态
  toggleSpeaking() {
    if (!this.mouth) return;

    if (this.isSpeaking) {
      this.isSpeaking = false;
      if (this.speakingInterval) {
        clearInterval(this.speakingInterval);
        this.speakingInterval = null;
      }
      this.mouth.classList.remove('speaking');
      this.mouth.classList.add('line');
    } else {
      this.isSpeaking = true;
      this.mouth.classList.remove('line', 'circle', 'arc-up', 'arc-down', 'rectangle');
      this.mouth.classList.add('speaking');
    }
  }

  // 随机选择瞳孔动作
  randomPupilAction(exclude = []) {
    const available = this.pupilActions.filter(action => !exclude.includes(action));
    return available.length > 0 ? this.randomChoice(available) : 'center';
  }

  // 随机选择眼睛动作
  randomEyeAction(exclude = [], use3D = false) {
    if (use3D) {
      const available = this.eye3DActions.filter(action => !exclude.includes(action));
      return available.length > 0 ? this.randomChoice(available) : 'normal';
    } else {
      const available = this.eyeActions.filter(action => !exclude.includes(action));
      return available.length > 0 ? this.randomChoice(available) : 'center';
    }
  }

  // 随机调整眼睛和瞳孔位置
  randomAdjustEyesAndPupils(emotion) {
    if (!emotion) return;

    switch(emotion) {
      case 'normal':
        this.lookDirection(this.randomPupilAction(['thinking']));
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction());
        } else {
          this.setFaceOrientation(this.randomEyeAction([], true));
        }
        break;
      
      case 'happy':
        this.lookDirection(this.randomPupilAction(['thinking']));
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction(['down']));
        } else {
          this.setFaceOrientation(this.randomEyeAction(['down'], true));
        }
        break;
      
      case 'sad':
        this.lookDirection(this.randomPupilAction(['thinking', 'up']));
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction(['up']));
        } else {
          this.setFaceOrientation(this.randomEyeAction(['up'], true));
        }
        break;
      
      case 'thinking':
        this.triggerThinking();
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction());
        } else {
          this.setFaceOrientation(this.randomEyeAction([], true));
        }
        break;
      
      case 'cunning':
        this.triggerThinking();
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction());
        } else {
          this.setFaceOrientation(this.randomEyeAction([], true));
        }
        break;
      
      case 'speaking':
        if (!this.isSpeaking) {
          this.toggleSpeaking();
        }
        if (Math.random() > 0.5) {
          this.lookDirection(this.randomPupilAction());
        }
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction());
        } else {
          this.setFaceOrientation(this.randomEyeAction([], true));
        }
        break;
    }
  }

  // 设置情绪
  setEmotion(emotion) {
    // 清除之前的情绪
    if (this.emotionInterval) {
      clearInterval(this.emotionInterval);
      this.emotionInterval = null;
    }
    if (this.randomActionInterval) {
      clearInterval(this.randomActionInterval);
      this.randomActionInterval = null;
    }
    if (this.isThinking) {
      this.stopThinking();
    }
    if (this.isSpeaking) {
      this.toggleSpeaking();
    }

    this.currentEmotion = emotion;

    // 清除所有状态
    this.eyes.forEach(eye => {
      eye.classList.remove('position-up', 'position-down', 'position-left', 'position-right', 'position-center',
        'position-up-left', 'position-up-right', 'position-down-left', 'position-down-right',
        'face-normal', 'face-up', 'face-down', 'face-left', 'face-right');
    });
    this.pupils.forEach(pupil => {
      pupil.classList.remove('look-left', 'look-right', 'look-up', 'look-down', 
        'look-up-left', 'look-up-right', 'look-down-left', 'look-down-right',
        'look-center', 'thinking', 'blinking');
    });

    if (this.mouth) {
      this.mouth.classList.remove('line', 'circle', 'arc-up', 'arc-down', 'speaking');
    }

    switch(emotion) {
      case 'normal':
        this.setMouthStyle('line');
        this.lookDirection(this.randomPupilAction(['thinking']));
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction());
        } else {
          this.setFaceOrientation(this.randomEyeAction([], true));
        }
        break;
      
      case 'happy':
        this.setMouthStyle('arc-up');
        this.lookDirection(this.randomPupilAction(['thinking']));
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction(['down']));
        } else {
          this.setFaceOrientation(this.randomEyeAction(['down'], true));
        }
        break;
      
      case 'sad':
        this.setMouthStyle('arc-down');
        this.lookDirection(this.randomPupilAction(['thinking', 'up']));
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction(['up']));
        } else {
          this.setFaceOrientation(this.randomEyeAction(['up'], true));
        }
        break;
      
      case 'thinking':
        this.setMouthStyle('circle');
        this.triggerThinking();
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction());
        } else {
          this.setFaceOrientation(this.randomEyeAction([], true));
        }
        break;
      
      case 'cunning':
        this.setMouthStyle(Math.random() > 0.5 ? 'circle' : 'arc-up');
        this.triggerThinking();
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction());
        } else {
          this.setFaceOrientation(this.randomEyeAction([], true));
        }
        break;
      
      case 'speaking':
        if (!this.isSpeaking) {
          this.toggleSpeaking();
        }
        this.lookDirection(this.randomPupilAction());
        if (Math.random() > 0.5) {
          this.moveEyes(this.randomEyeAction());
        } else {
          this.setFaceOrientation(this.randomEyeAction([], true));
        }
        break;
    }

    // 设置随机动作调整
    this.randomActionInterval = setInterval(() => {
      this.randomAdjustEyesAndPupils(emotion);
    }, 3000 + Math.random() * 7000);
  }
}

