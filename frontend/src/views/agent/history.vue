<template>
  <div class="history-page">
    <h2>我的对话记录</h2>
    <el-alert type="info" :closable="false" class="role-hint">
      以下是您的账号在当前门店与 AI Agent 的全部对话历史 (仅您自己租户的数据, 不含计费信息)
    </el-alert>

    <el-card shadow="never" class="filter-bar">
      <el-row :gutter="12" align="middle">
        <el-col :span="5"><el-select v-model="filters.agent_name" placeholder="全部Agent" clearable style="width:100%">
          <el-option v-for="a in ['mentor','inventory','product','sales','marketing','procurement','supervisor']" :key="a" :label="a" :value="a"/>
        </el-select></el-col>
        <el-col :span="6"><el-date-picker v-model="filters.range" type="daterange" range-separator="-" start-placeholder="开始" end-placeholder="结束"/></el-col>
        <el-col :span="8"><el-input v-model="filters.keyword" placeholder="搜索提问/回复关键词" clearable/></el-col>
        <el-col :span="5"><el-button type="primary" @click="load">查询</el-button>
          <el-button @click="resetFilters">重置</el-button></el-col>
      </el-row>
    </el-card>

    <el-card shadow="never">
      <el-table :data="list" v-loading="loading" stripe>
        <el-table-column label="时间" prop="create_time" width="170"/>
        <el-table-column label="Agent" prop="agent_name" width="110">
          <template #default="{row}"><el-tag size="small">{{ row.agent_name }}</el-tag></template>
        </el-table-column>
        <el-table-column label="您的提问" prop="input_preview" min-width="200" show-overflow-tooltip/>
        <el-table-column label="AI 回答" prop="output_preview" min-width="300" show-overflow-tooltip/>
        <el-table-column label="状态" width="80">
          <template #default="{row}"><el-tag size="small" :type="row.status==='success'?'success':'danger'">{{ row.status }}</el-tag></template>
        </el-table-column>
        <el-table-column label="详情" width="70">
          <template #default="{row}"><el-button type="primary" link size="small" @click="openDetail(row)">查看</el-button></template>
        </el-table-column>
      </el-table>
      <el-pagination class="pager" background layout="total, sizes, prev, pager, next"
        v-model:current-page="filters.page" v-model:page-size="filters.pageSize"
        :total="total" :page-sizes="[20,50]" @current-change="load" @size-change="load"/>
    </el-card>

    <el-dialog v-model="detailVisible" title="完整对话详情" width="600px">
      <div v-if="current">
        <h4 style="margin:0 0 6px;color:#409eff">您的提问</h4>
        <div class="detail-block">{{ current.input_preview }}</div>
        <h4 style="margin:12px 0 6px;color:#67c23a">AI 回答</h4>
        <div class="detail-block">{{ current.output_preview }}</div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { userHistory } from '@/api/agentLog'

const filters = reactive({ page: 1, pageSize: 20, agent_name: '', keyword: '', range: null })
const list = ref([]); const total = ref(0); const loading = ref(false)
const detailVisible = ref(false); const current = ref(null)

function buildParams() {
  const p = { page: filters.page, pageSize: filters.pageSize }
  if (filters.agent_name) p.agent_name = filters.agent_name
  if (filters.keyword) p.keyword = filters.keyword
  if (filters.range?.length) { p.start_date = filters.range[0]; p.end_date = filters.range[1] }
  return p
}

async function load() {
  loading.value = true
  try {
    const data = await userHistory(buildParams())
    list.value = data.list || []; total.value = data.total || 0
  } finally { loading.value = false }
}

function resetFilters() { filters.agent_name=''; filters.keyword=''; filters.range=null; filters.page=1; load() }
function openDetail(row) { current.value = row; detailVisible.value = true }

onMounted(load)
</script>

<style scoped>
.history-page { padding: 0 0 20px; }
.role-hint { margin-bottom: 12px; }
.filter-bar { margin-bottom: 12px; }
.pager { margin-top: 16px; justify-content: flex-end; display: flex; }
.detail-block { background:#f5f7fa; padding:12px; border-radius:6px; white-space:pre-wrap; line-height:1.6; max-height:400px; overflow-y:auto; }
</style>
