<template>
  <div class="face" ref="faceElement">
    <!-- 左眼 -->
    <div class="eye left" :class="leftEyeClasses">
      <div class="pupil" :class="leftPupilClasses"></div>
    </div>
    <!-- 右眼 -->
    <div class="eye right" :class="rightEyeClasses">
      <div class="pupil" :class="rightPupilClasses"></div>
    </div>
    <!-- 嘴巴 -->
    <div class="mouth" :class="mouthClass"></div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const faceElement = ref(null)

// 这些类将由 FaceController 通过 DOM 操作来设置
// 为了 Vue 的响应式，我们可以使用 ref 来访问 DOM
const leftEyeClasses = ref('')
const rightEyeClasses = ref('')
const leftPupilClasses = ref('')
const rightPupilClasses = ref('')
const mouthClass = ref('line')

defineExpose({
  faceElement
})
</script>

<style>
/* 使用全局样式，因为 FaceController 需要通过 DOM 操作来添加类 */
@import '../styles/robot-face.css';
</style>
