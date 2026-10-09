<template>
  <div class="error-page">
    <el-result icon="warning" title="403" sub-title="抱歉,您没有权限访问该页面">
      <template #extra>
        <el-button type="primary" @click="goHome">返回首页</el-button>
      </template>
    </el-result>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
const router = useRouter()
function goHome() {
  router.push('/dashboard')
}
</script>

<style scoped>
.error-page {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60vh;
}
</style>
