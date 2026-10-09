<template>
  <div class="admin-page">
    <h2>Agent 审计日志 · 管理员后台</h2>
    <el-alert type="warning" :closable="false" class="role-hint">
      当前身份: <b>{{ currentRole }}</b> (仅 admin 可访问, 普通商户会被 430 拒绝)
    </el-alert>

    <!-- 汇总卡片 -->
    <el-row :gutter="12" class="summary-row">
      <el-col :span="6"><el-card class="card"><div class="label">总调用次数</div><div class="val">{{ summary.total_calls || 0 }}</div></el-card></el-col>
      <el-col :span="6"><el-card class="card"><div class="label">覆盖Agent</div><div class="val">{{ summary.agent_count || 0 }}</div></el-card></el-col>
      <el-col :span="6"><el-card class="card"><div class="label">输入Token</div><div class="val">{{ formatNum(summary.total_input_tokens) }}</div></el-card></el-col>
      <el-col :span="6"><el-card class="card"><div class="label">累计费用 (美元)</div><div class="val">${{ (summary.total_cost_usd || 0).toFixed(4) }}</div></el-card></el-col>
    </el-row>

    <!-- 筛选 -->
    <el-card shadow="never" class="filter-bar">
      <el-row :gutter="12" align="middle">
        <el-col :span="4">
          <el-select v-model="filters.tenant_id" placeholder="全部租户" clearable style="width:100%">
            <el-option v-for="t in tenantOptions" :key="t.value" :label="t.label" :value="t.value"/>
          </el-select>
        </el-col>
        <el-col :span="4">
          <el-select v-model="filters.agent_name" placeholder="Agent类型" clearable style="width:100%">
            <el-option v-for="a in ['mentor','inventory','product','sales','marketing','procurement','supervisor','test']" :key="a" :label="a" :value="a"/>
          </el-select>
        </el-col>
        <el-col :span="5"><el-date-picker v-model="filters.range" type="daterange" range-separator="-" start-placeholder="开始" end-placeholder="结束"/></el-col>
        <el-col :span="5"><el-input v-model="filters.keyword" placeholder="搜索提问/回复关键词" clearable/></el-col>
        <el-col :span="6">
          <el-button type="primary" @click="onSearch">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
          <el-button type="success" @click="exportCsv">导出 CSV</el-button>
        </el-col>
      </el-row>
    </el-card>

    <!-- 列表 -->
    <el-card shadow="never">
      <el-table :data="list" v-loading="loading" stripe height="500">
        <el-table-column label="ID" prop="id" width="60"/>
        <el-table-column label="租户ID" prop="tenant_id" width="80"/>
        <el-table-column label="Agent" prop="agent_name" width="120">
          <template #default="{row}"><el-tag size="small" :type="agentTag(row.agent_name)">{{ row.agent_name }}</el-tag></template>
        </el-table-column>
        <el-table-column label="用户提问预览" prop="input_preview" min-width="200" show-overflow-tooltip/>
        <el-table-column label="AI回复预览" prop="output_preview" min-width="200" show-overflow-tooltip/>
        <el-table-column label="输入tk" prop="input_tokens" width="80"/>
        <el-table-column label="输出tk" prop="output_tokens" width="80"/>
        <el-table-column label="费用($)" width="90">
          <template #default="{row}">{{ Number(row.total_cost || 0).toFixed(4) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{row}"><el-tag size="small" :type="row.status==='success'?'success':'danger'">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="时间" prop="create_time" width="170"/>
      </el-table>
      <div class="pager-wrap">
        <el-pagination background layout="total, sizes, prev, pager, next"
          v-model:current-page="filters.page" v-model:page-size="filters.pageSize"
          :total="total" :page-sizes="[20,50,100]"
          @current-change="(p)=>{ filters.page=p; loadList() }"
          @size-change="(s)=>{ filters.pageSize=s; filters.page=1; loadList() }"/>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { adminList, adminSummary, adminExport, adminTenants } from '@/api/agentLog'

const storeUser = JSON.parse(localStorage.getItem('userInfo') || '{}')
const currentRole = computed(() => storeUser.role || 'unknown')

const filters = reactive({ page: 1, pageSize: 20, tenant_id: '', agent_name: '', keyword: '', range: null })
const list = ref([])
const total = ref(0)
const loading = ref(false)
const summary = ref({})
const tenantOptions = ref([{label:'全部租户', value:''}])

// 请求序号锁 - 防止竞态覆盖
let _seq = 0

function buildParams() {
  const p = { page: filters.page, pageSize: filters.pageSize }
  if (filters.tenant_id) p.tenant_id = filters.tenant_id
  if (filters.agent_name) p.agent_name = filters.agent_name
  if (filters.keyword) p.keyword = filters.keyword
  if (filters.range?.length) { p.start_date = filters.range[0]; p.end_date = filters.range[1] }
  return p
}

async function loadTenants() {
  try {
    const data = await adminTenants()
    const opts = [{label:'全部租户', value:''}]
    ;(data.list || []).forEach(t => {
      opts.push({ label: t.merchant_name + '/' + t.store_name + ' (ID:' + t.id + ')', value: String(t.id) })
    })
    tenantOptions.value = opts
  } catch (e) { console.warn('tenants fail:', e.message) }
}

async function loadSummary() {
  try {
    const data = await adminSummary({})
    if (data.summary) summary.value = data.summary
  } catch (e) { console.warn('summary fail:', e.message) }
}

async function loadList() {
  const mySeq = ++_seq
  loading.value = true
  try {
    const data = await adminList(buildParams())
    if (mySeq !== _seq) return // 过期请求, 丢弃
    console.log('[admin] loadList OK:', {listLen: data.list?.length, total: data.total})
    list.value = data.list || []
    total.value = data.total || 0
  } catch (e) {
    if (mySeq === _seq) ElMessage.error('加载失败: ' + e.message)
  } finally {
    if (mySeq === _seq) loading.value = false
  }
}

function onSearch() { filters.page = 1; loadList() }
function resetFilters() {
  filters.tenant_id = ''; filters.agent_name = ''; filters.keyword = ''
  filters.range = null; filters.page = 1; filters.pageSize = 20
  loadSummary(); loadList()
}

async function exportCsv() {
  try {
    const blob = await adminExport(buildParams())
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'agent_log_' + Date.now() + '.csv'; a.click()
    URL.revokeObjectURL(url); ElMessage.success('导出成功')
  } catch (e) { ElMessage.error('导出失败') }
}

function formatNum(n) { if (!n) return '0'; return Number(n).toLocaleString() }
function agentTag(n) { const map={mentor:'warning',marketing:'primary',inventory:'success',sales:'danger',product:'',procurement:'info',test:''}; return map[n] || 'info' }

onMounted(async () => {
  await Promise.all([loadSummary(), loadList(), loadTenants()])
})
</script>

<style scoped>
.admin-page { padding: 0 0 20px; }
.role-hint { margin-bottom: 12px; }
.summary-row { margin-bottom: 12px; }
.summary-row .card .label { font-size: 12px; color: #999; }
.summary-row .card .val { font-size: 22px; font-weight: 600; color: #303133; }
.filter-bar { margin-bottom: 12px; }
.pager-wrap { margin-top: 16px; display: flex; justify-content: flex-end; }
</style>

