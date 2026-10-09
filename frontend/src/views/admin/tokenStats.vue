<template>
  <div class="token-stats-page">
    <el-card class="summary-card">
      <template #header>
        <div class="card-header">
          <span><el-icon><DataLine /></el-icon> Token 用量统计 ({{ stats.month }})</span>
          <el-button type="primary" size="small" @click="loadData">刷新</el-button>
        </div>
      </template>
      <el-row :gutter="20">
        <el-col :span="8">
          <div class="stat-item">
            <div class="stat-label">本月总已用 Token</div>
            <div class="stat-value">{{ formatNum(stats.summary.totalUsed) }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-item">
            <div class="stat-label">本月总额度</div>
            <div class="stat-value">{{ formatNum(stats.summary.totalLimit) }}</div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="stat-item">
            <div class="stat-label">租户数量</div>
            <div class="stat-value">{{ stats.summary.tenantCount }}</div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-card class="table-card" style="margin-top:16px">
      <template #header>
        <span>租户 Token 用量明细</span>
      </template>
      <el-table :data="stats.list" border stripe>
        <el-table-column prop="tenantId" label="租户ID" width="80" />
        <el-table-column prop="merchantName" label="商户名" />
        <el-table-column prop="storeName" label="店铺名" />
        <el-table-column prop="totalCalls" label="总调用次数" width="110" />
        <el-table-column label="Token 用量" width="200">
          <template #default="{ row }">
            <div>
              <el-progress
                :percentage="row.unlimited ? 0 : row.usageRate"
                :status="row.usageRate >= 90 ? 'exception' : 'success'"
                :stroke-width="14"
              />
              <div style="font-size:12px;color:#999;margin-top:2px">
                {{ formatNum(row.tokenUsed) }} / {{ row.unlimited ? '不限' : formatNum(row.tokenLimit) }}
                ({{ row.unlimited ? '-' : row.usageRate + '%' }})
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="剩余额度" width="120">
          <template #default="{ row }">
            <span :style="{ color: row.unlimited ? '#67c23a' : (row.tokenRemaining < 10000 ? '#f56c6c' : '#303133') }">
              {{ row.unlimited ? '不限量' : formatNum(row.tokenRemaining) }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="openQuotaDialog(row)">设置额度</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="quotaDialogVisible" title="设置月度 Token 额度" width="420px">
      <el-form :model="quotaForm" label-width="100px">
        <el-form-item label="租户">
          <span>{{ currentRow.merchantName }} / {{ currentRow.storeName }}</span>
        </el-form-item>
        <el-form-item label="月度额度">
          <el-input-number v-model="quotaForm.tokenLimit" :min="0" :step="10000" controls-position="right" style="width:200px" />
          <span style="margin-left:10px;color:#999;font-size:12px">0 = 不限量</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quotaDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveQuota">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { DataLine } from '@element-plus/icons-vue'
import { adminTokenStats, adminSetTokenQuota } from '@/api/tokenQuota'

const stats = ref({ list: [], summary: { totalUsed: 0, totalLimit: 0, tenantCount: 0 }, month: '' })
const quotaDialogVisible = ref(false)
const currentRow = ref({})
const quotaForm = reactive({ tokenLimit: 0 })

function formatNum(n) {
  if (n == null || n === Infinity) return '∞'
  return Number(n).toLocaleString()
}

async function loadData() {
  try {
    const res = await adminTokenStats({ pageSize: 100 })
    stats.value = res.data
  } catch (e) {
    ElMessage.error('加载失败: ' + e.message)
  }
}

function openQuotaDialog(row) {
  currentRow.value = row
  quotaForm.tokenLimit = row.tokenLimit
  quotaDialogVisible.value = true
}

async function saveQuota() {
  try {
    await adminSetTokenQuota(currentRow.value.tenantId, { tokenLimit: quotaForm.tokenLimit })
    ElMessage.success('额度设置成功')
    quotaDialogVisible.value = false
    loadData()
  } catch (e) {
    ElMessage.error('设置失败: ' + e.message)
  }
}

onMounted(loadData)
</script>

<style scoped>
.token-stats-page { padding: 16px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.stat-item { text-align: center; padding: 10px 0; }
.stat-label { font-size: 14px; color: #909399; margin-bottom: 8px; }
.stat-value { font-size: 28px; font-weight: bold; color: #409eff; }
</style>
