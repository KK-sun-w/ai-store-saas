import axios from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import { useAppStore } from '@/stores/app'

const request = axios.create({
  baseURL: '/api',
  timeout: 15000
})

// 请求拦截器: 自动携带 token + 全局 loading
request.interceptors.request.use(
  (config) => {
    const appStore = useAppStore()
    appStore.startLoading()
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    const appStore = useAppStore()
    appStore.resetLoading()
    return Promise.reject(error)
  }
)

// 响应拦截器: 统一处理业务码 + 关闭 loading
request.interceptors.response.use(
  (response) => {
    const appStore = useAppStore()
    appStore.stopLoading()
    const res = response.data
    if (res.code === 0) {
      return res.data
    }
    if (res.code === 401) {
      ElMessage.error(res.message || '登录已过期,请重新登录')
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
      router.push('/login')
      return Promise.reject(new Error(res.message))
    }
    if (res.code === 403 || res.code === 430) {
      ElMessage.error(res.message || '没有操作权限')
      return Promise.reject(new Error(res.message))
    }
    ElMessage.error(res.message || '请求失败')
    return Promise.reject(new Error(res.message))
  },
  (error) => {
    const appStore = useAppStore()
    appStore.resetLoading()
    const status = error.response?.status
    const msg = error.response?.data?.message || error.message
    if (status === 401) {
      ElMessage.error('登录已过期,请重新登录')
      localStorage.removeItem('token')
      localStorage.removeItem('userInfo')
      router.push('/login')
    } else if (status === 403 || status === 430) {
      ElMessage.error(msg || '没有操作权限')
    } else if (status === 429) {
      ElMessage.error(msg || '请求过于频繁')
    } else {
      ElMessage.error(msg || '网络错误')
    }
    return Promise.reject(error)
  }
)

export default request
