<template>
  <div class="register-container">
    <el-card class="register-card">
      <div class="register-header">
        <h2>商户注册</h2>
        <p>创建你的 AI 门店智能体账号</p>
      </div>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="登录账号" prop="username">
          <el-input v-model="form.username" placeholder="5-64位字符" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="至少6位" show-password />
        </el-form-item>
        <el-form-item label="商户名称" prop="merchantName">
          <el-input v-model="form.merchantName" placeholder="请输入商户名称" />
        </el-form-item>
        <el-form-item label="门店名称" prop="storeName">
          <el-input v-model="form.storeName" placeholder="选填" />
        </el-form-item>
        <el-form-item label="经营行业" prop="industry">
          <el-input v-model="form.industry" placeholder="选填，如：餐饮/零售/服装" />
        </el-form-item>
        <el-form-item label="联系电话" prop="contactPhone">
          <el-input v-model="form.contactPhone" placeholder="选填" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" class="register-btn" @click="handleRegister">注 册</el-button>
        </el-form-item>
        <div class="register-footer">
          <span>已有账号？</span>
          <el-link type="primary" @click="$router.push('/login')">返回登录</el-link>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { register } from '@/api/auth'

const router = useRouter()
const formRef = ref()
const loading = ref(false)

const form = reactive({
  username: '',
  password: '',
  merchantName: '',
  storeName: '',
  industry: '',
  contactPhone: ''
})

const rules = {
  username: [
    { required: true, message: '请输入登录账号', trigger: 'blur' },
    { min: 5, max: 64, message: '账号长度5-64位', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6位', trigger: 'blur' }
  ],
  merchantName: [{ required: true, message: '请输入商户名称', trigger: 'blur' }]
}

async function handleRegister() {
  await formRef.value.validate()
  loading.value = true
  try {
    await register(form)
    ElMessage.success('注册成功，请登录')
    router.push('/login')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-container {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
.register-card {
  width: 460px;
  padding: 20px;
}
.register-header {
  text-align: center;
  margin-bottom: 24px;
}
.register-header h2 {
  margin: 0 0 8px;
  color: #303133;
}
.register-header p {
  margin: 0;
  color: #909399;
  font-size: 14px;
}
.register-btn {
  width: 100%;
}
.register-footer {
  text-align: center;
  font-size: 14px;
}
</style>