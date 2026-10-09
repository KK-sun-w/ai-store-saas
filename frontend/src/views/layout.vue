<template>
  <el-container class="layout-container" v-loading="appStore.loading" element-loading-text="加载中..." element-loading-background="rgba(255,255,255,0.7)">
    <el-aside :width="isMobile ? (mobileMenuOpen ? '220px' : '0px') : '220px'" class="aside" :class="{ 'aside-mobile': isMobile, 'aside-open': mobileMenuOpen }">
      <div class="logo">
        <el-icon size="24"><Cpu /></el-icon>
        <span>AI门店智能体</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#001529"
        text-color="#ffffffa6"
        active-text-color="#ffffff"
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <span>工作台</span>
        </el-menu-item>
        <el-menu-item index="/products">
          <el-icon><Goods /></el-icon>
          <span>商品管理</span>
        </el-menu-item>
        <el-menu-item index="/purchases">
          <el-icon><ShoppingCart /></el-icon>
          <span>进货管理</span>
        </el-menu-item>
        <el-menu-item index="/sales">
          <el-icon><Money /></el-icon>
          <span>销售管理</span>
        </el-menu-item>
        <el-menu-item index="/inventory">
          <el-icon><Box /></el-icon>
          <span>库存盘点</span>
        </el-menu-item>
        <el-menu-item index="/expenses">
          <el-icon><Wallet /></el-icon>
          <span>开销记录</span>
        </el-menu-item>
        <el-menu-item index="/quota">
          <el-icon><Histogram /></el-icon>
          <span>AI配额</span>
        </el-menu-item>
        <el-sub-menu index="agent-group">
          <template #title>
            <el-icon><Cpu /></el-icon>
            <span>🤖 AI智能Agent</span>
          </template>
          <el-menu-item index="/agent/store-business"><el-icon><Cpu /></el-icon><span>门店综合业务Agent</span></el-menu-item>
          <el-menu-item v-if="userStore.role === 'owner'" index="/agent/video-marketing"><el-icon><VideoCamera /></el-icon><span>🎬 短视频营销Agent</span></el-menu-item>
          <el-menu-item index="/agent/memory"><el-icon><Collection /></el-icon><span>店铺记忆</span></el-menu-item>
          <el-menu-item index="/agent/history"><el-icon><ChatLineSquare /></el-icon><span>我的对话记录</span></el-menu-item>
          <el-menu-item v-if="userStore.role === 'admin'" index="/agent/admin"><el-icon><DataAnalysis /></el-icon><span>Agent审计日志</span></el-menu-item>
          <el-menu-item v-if="userStore.role === 'admin'" index="/admin/token-stats"><el-icon><DataLine /></el-icon><span>Token 统计</span></el-menu-item>
        </el-sub-menu>
      </el-menu>
    </el-aside>

    <div v-if="isMobile && mobileMenuOpen" class="mobile-overlay" @click="mobileMenuOpen = false"></div>
    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-button v-if="isMobile" class="hamburger-btn" text @click="toggleMobileMenu">
            <el-icon :size="20"><Menu /></el-icon>
          </el-button>
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ $route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown @command="handleCommand">
            <span class="user-info">
              <el-avatar :size="32" icon="UserFilled" />
              <span class="username">{{ userStore.username }}</span>
              <el-tag size="small" :type="roleTagType">{{ roleLabel }}</el-tag>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { useAppStore } from '@/stores/app'
import { Menu } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const appStore = useAppStore()

const activeMenu = computed(() => route.path)
const mobileMenuOpen = ref(false)
const isMobile = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < 768
  if (!isMobile.value) mobileMenuOpen.value = false
}
onMounted(() => { checkMobile(); window.addEventListener('resize', checkMobile) })
onUnmounted(() => window.removeEventListener('resize', checkMobile))

function toggleMobileMenu() { mobileMenuOpen.value = !mobileMenuOpen.value }

const roleLabel = computed(() => {
  if (userStore.role === 'admin') return '超级管理员'
  if (userStore.role === 'owner') return '店主'
  return '店员'
})

const roleTagType = computed(() => {
  if (userStore.role === 'admin') return 'danger'
  if (userStore.role === 'owner') return 'success'
  return 'info'
})

function handleCommand(command) {
  if (command === 'logout') {
    userStore.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
.layout-container {
  height: 100vh;
}
.aside {
  background-color: #001529;
  overflow-y: auto;
}
.logo {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  border-bottom: 1px solid #ffffff1a;
}
.aside .el-menu {
  border-right: none;
}
.header {
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  padding: 0 20px;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.username {
  font-size: 14px;
  color: #303133;
}
.main {
  background: #f0f2f5;
  padding: 20px;
}

/* 移动端适配 */
.hamburger-btn { padding: 0 8px; }
.mobile-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.5); z-index: 999;
}
.aside-mobile {
  position: fixed; top: 0; left: 0; height: 100vh; z-index: 1000;
  transform: translateX(-100%); transition: transform 0.3s;
}
.aside-mobile.aside-open { transform: translateX(0); }
@media (max-width: 768px) {
  .main { padding: 12px; }
  .header { padding: 0 12px; }
  .header-left .el-breadcrumb { display: none; }
}
</style>







