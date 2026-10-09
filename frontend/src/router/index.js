import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/login', name: 'Login', component: () => import('@/views/login.vue'), meta: { public: true } },
  { path: '/register', name: 'Register', component: () => import('@/views/register.vue'), meta: { public: true } },
  {
    path: '/', component: () => import('@/views/layout.vue'), redirect: '/dashboard', children: [
      { path: 'dashboard', name: 'Dashboard', component: () => import('@/views/dashboard.vue'), meta: { title: '工作台' } },
      { path: 'products', name: 'Products', component: () => import('@/views/product/index.vue'), meta: { title: '商品管理' } },
      { path: 'products/new', name: 'ProductNew', component: () => import('@/views/product/detail.vue'), meta: { title: '新增商品' } },
      { path: 'products/:id/edit', name: 'ProductEdit', component: () => import('@/views/product/detail.vue'), meta: { title: '编辑商品' } },
      { path: 'purchases', name: 'Purchases', component: () => import('@/views/purchase/index.vue'), meta: { title: '进货管理' } },
      { path: 'sales', name: 'Sales', component: () => import('@/views/sales/index.vue'), meta: { title: '销售管理' } },
      { path: 'inventory', name: 'Inventory', component: () => import('@/views/inventory/index.vue'), meta: { title: '库存盘点' } },
      { path: 'expenses', name: 'Expenses', component: () => import('@/views/expense/index.vue'), meta: { title: '开销记录' } },
      { path: 'quota', name: 'Quota', component: () => import('@/views/quota/index.vue'), meta: { title: 'AI配额' } },
      { path: 'agent/store-business', name: 'StoreBusiness', component: () => import('@/views/agent/storeBusiness.vue'), meta: { title: '门店综合业务Agent' } },
      { path: 'agent/video-marketing', name: 'VideoMarketing', component: () => import('@/views/agent/videoMarketing.vue'), meta: { title: '短视频营销Agent' } },
      { path: 'agent/memory', name: 'AgentMemory', component: () => import('@/views/agent/memory.vue'), meta: { title: '店铺记忆' } },
      { path: 'agent/history', name: 'AgentHistory', component: () => import('@/views/agent/history.vue'), meta: { title: '我的对话记录' } },
      { path: 'agent/mentor', name: 'AgentMentor', component: () => import('@/views/agent/mentor.vue'), meta: { title: '门店商业导师' } },
      { path: 'agent/admin', name: 'AgentAdmin', component: () => import('@/views/agent/admin.vue'), meta: { title: 'Agent审计日志', requiresRole: 'admin' } },
      { path: 'admin/token-stats', name: 'TokenStats', component: () => import('@/views/admin/tokenStats.vue'), meta: { title: 'Token 统计', requiresRole: 'admin' } },
    ]
  },
  { path: '/403', name: 'Forbidden', component: () => import('@/views/error/403.vue'), meta: { public: true } },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({ history: createWebHistory(), routes })

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  if (to.meta.public) { next() }
  else if (!token) { next('/login') }
  else if (to.meta.requiresRole) {
    const user = JSON.parse(localStorage.getItem('userInfo') || '{}')
    const required = Array.isArray(to.meta.requiresRole) ? to.meta.requiresRole : [to.meta.requiresRole]
    if (required.includes(user.role)) { next() } else { next('/403') }
  } else { next() }
})

export default router
