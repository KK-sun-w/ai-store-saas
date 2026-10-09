<template>
  <div>
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span>今日 AI 调用配额</span>
          <el-button :icon="Refresh" @click="loadData">刷新</el-button>
        </div>
      </template>

      <div class="quota-overview">
        <div class="quota-circle">
          <el-progress
            type="circle"
            :percentage="percent"
            :status="percent >= 100 ? 'exception' : 'success'"
            :width="180"
            :stroke-width="12"
          />
        </div>
        <div class="quota-details">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="配额日期">{{ quota.quotaDate || '-' }}</el-descriptions-item>
            <el-descriptions-item label="每日上限">
              <b>{{ quota.dailyLimit || 0 }}</b> 次
            </el-descriptions-item>
            <el-descriptions-item label="已使用">
              <b style="color: #e6a23c">{{ quota.usedCount || 0 }}</b> 次
            </el-descriptions-item>
            <el-descriptions-item label="剩余额度">
              <b style="color: #67c23a">{{ quota.remaining || 0 }}</b> 次
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </el-card>

    <!-- Agent Token 配额 -->
    <el-card style="margin-top:16px">
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>Agent Token 额度</span>
          <el-button type="warning" :icon="ShoppingCart" @click="purchaseDialogVisible = true">
            购买 Agent Token 套餐
          </el-button>
        </div>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="总Token">
          <b>{{ agentQuota.unlimited ? '不限量' : formatNum(agentQuota.total) }}</b>
        </el-descriptions-item>
        <el-descriptions-item label="已使用">
          <b style="color:#e6a23c">{{ formatNum(agentQuota.used) }}</b>
        </el-descriptions-item>
        <el-descriptions-item label="剩余">
          <b style="color:#67c23a">{{ agentQuota.unlimited ? '不限量' : formatNum(agentQuota.remaining) }}</b>
        </el-descriptions-item>
      </el-descriptions>
      <el-progress
        v-if="!agentQuota.unlimited"
        :percentage="agentPercent"
        :status="agentPercent >= 90 ? 'exception' : 'success'"
        style="margin-top:16px"
      />
    </el-card>

    <!-- 本月Token额度(保留原有) -->
    <el-card style="margin-top:16px">
      <template #header>
        <span>本月 Token 额度</span>
      </template>
      <el-descriptions :column="3" border>
        <el-descriptions-item label="月度上限">
          <b>{{ tokenQuota.tokenLimit === 0 ? '不限量' : formatNum(tokenQuota.tokenLimit) }}</b> token
        </el-descriptions-item>
        <el-descriptions-item label="已使用">
          <b style="color:#e6a23c">{{ formatNum(tokenQuota.tokenUsed) }}</b> token
        </el-descriptions-item>
        <el-descriptions-item label="剩余">
          <b style="color:#67c23a">{{ tokenQuota.unlimited ? '不限量' : formatNum(tokenQuota.remaining) }}</b> token
        </el-descriptions-item>
      </el-descriptions>
      <el-progress
        v-if="!tokenQuota.unlimited"
        :percentage="tokenPercent"
        :status="tokenPercent >= 90 ? 'exception' : 'success'"
        style="margin-top:16px"
      />
    </el-card>

    <!-- 购买套餐弹窗(Mock,暂不接入真实支付) -->
    <el-dialog v-model="purchaseDialogVisible" title="购买 Agent Token 套餐" width="520px">
      <el-alert type="info" :closable="false" style="margin-bottom:16px">
        演示阶段,暂未接入真实支付。选择套餐后可在【管理员后台】手动为租户充值。
      </el-alert>
      <div class="package-list">
        <div
          v-for="pkg in packages"
          :key="pkg.id"
          class="package-item"
          :class="{ active: selectedPackage === pkg.id }"
          @click="selectedPackage = pkg.id"
        >
          <div class="pkg-name">{{ pkg.name }}</div>
          <div class="pkg-token">{{ formatNum(pkg.tokens) }} token</div>
          <div class="pkg-price">¥{{ pkg.price }}</div>
          <div class="pkg-desc">{{ pkg.desc }}</div>
        </div>
      </div>
      <template #footer>
        <el-button @click="purchaseDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!selectedPackage" @click="handlePurchase">
          确认购买
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh, ShoppingCart } from '@element-plus/icons-vue'
import { getTodayQuota, consumeQuota, getAgentTokenQuota } from '@/api/quota'
import { myTokenQuota } from '@/api/tokenQuota'

const quota = reactive({ quotaDate: '', dailyLimit: 0, usedCount: 0, remaining: 0 })
const consuming = ref(false)

const tokenQuota = reactive({ tokenLimit: 0, tokenUsed: 0, remaining: 0, unlimited: true })

// Agent Token 配额
const agentQuota = reactive({ total: 0, used: 0, remaining: 0, unlimited: false })

// 购买套餐弹窗
const purchaseDialogVisible = ref(false)
const selectedPackage = ref('')
const packages = [
  { id: 'A', name: '套餐A', tokens: 1000000, price: '99', desc: '适合小规模日常使用' },
  { id: 'B', name: '套餐B', tokens: 3000000, price: '269', desc: '推荐,性价比之选' },
  { id: 'C', name: '套餐C', tokens: 10000000, price: '799', desc: '适合高频使用商户' },
]

const tokenPercent = computed(() => {
  if (!tokenQuota.tokenLimit) return 0
  return Math.min(Math.round((tokenQuota.tokenUsed / tokenQuota.tokenLimit) * 100), 100)
})

const agentPercent = computed(() => {
  if (!agentQuota.total || agentQuota.unlimited) return 0
  return Math.min(Math.round((agentQuota.used / agentQuota.total) * 100), 100)
})

function formatNum(n) { return Number(n || 0).toLocaleString() }

const percent = computed(() => {
  if (!quota.dailyLimit) return 0
  return Math.min(Math.round((quota.usedCount / quota.dailyLimit) * 100), 100)
})

async function loadData() {
  const data = await getTodayQuota()
  Object.assign(quota, data)
  try {
    const tq = await myTokenQuota()
    Object.assign(tokenQuota, tq)
  } catch (e) {}
  // 加载 Agent Token 配额
  try {
    const aq = await getAgentTokenQuota()
    Object.assign(agentQuota, aq)
  } catch (e) {}
}

async function handlePurchase() {
  const pkg = packages.find(p => p.id === selectedPackage.value)
  if (!pkg) return
  ElMessage.success(`已选择${pkg.name}(${formatNum(pkg.tokens)} token,¥${pkg.price}),请联系管理员充值`)
  purchaseDialogVisible.value = false
}

loadData()
</script>

<style scoped>
.quota-overview {
  display: flex;
  align-items: center;
  gap: 40px;
  padding: 20px;
}
.quota-circle { flex-shrink: 0; }
.quota-details { flex: 1; }

.package-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.package-item {
  border: 2px solid #e4e7ed;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.package-item:hover { border-color: #409eff; }
.package-item.active { border-color: #409eff; background: #ecf5ff; }
.pkg-name { font-weight: bold; font-size: 16px; }
.pkg-token { color: #409eff; font-size: 14px; margin: 8px 0; }
.pkg-price { color: #f56c6c; font-size: 20px; font-weight: bold; }
.pkg-desc { color: #909399; font-size: 12px; margin-top: 4px; }
</style>