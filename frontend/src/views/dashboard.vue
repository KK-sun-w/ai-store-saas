<template>
  <div class="dashboard">
    <!-- 第一行: 5 张统计卡片 -->
    <el-row :gutter="16">
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <el-icon class="stat-icon" color="#909399"><Box /></el-icon>
            <div>
              <div class="stat-value">{{ overview.total_stock }}</div>
              <div class="stat-label">库存总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <el-icon class="stat-icon" color="#67c23a"><ShoppingCart /></el-icon>
            <div>
              <div class="stat-value">¥{{ overview.today_sales }}</div>
              <div class="stat-label">今日销售额</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <el-icon class="stat-icon" color="#f56c6c"><TrendCharts /></el-icon>
            <div>
              <div class="stat-value">¥{{ overview.month_sales }}</div>
              <div class="stat-label">本月销售额</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <el-icon class="stat-icon" color="#409eff"><Coin /></el-icon>
            <div>
              <div class="stat-value">¥{{ overview.month_profit }}</div>
              <div class="stat-label">本月利润</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <el-icon class="stat-icon" color="#e6a23c"><Goods /></el-icon>
            <div>
              <div class="stat-value">{{ overview.product_count }}</div>
              <div class="stat-label">商品总数</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="8" :md="4">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-item">
            <el-icon class="stat-icon" color="#9c27b0"><Wallet /></el-icon>
            <div>
              <div class="stat-value">¥{{ overview.today_profit }}</div>
              <div class="stat-label">今日利润</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 第二行: 月度销售对比 + 库存预警 -->
    <el-row :gutter="16" style="margin-top: 16px">
      <el-col :xs="24" :md="16">
        <el-card>
          <template #header>
            <div class="chart-header">
              <span>近 12 月销售额对比</span>
              <el-select v-model="chartMonths" size="small" style="width: 90px" @change="loadMonthly">
                <el-option :value="6" label="近6月" />
                <el-option :value="12" label="近12月" />
                <el-option :value="24" label="近24月" />
              </el-select>
            </div>
          </template>
          <div ref="chartRef" style="width: 100%; height: 280px"></div>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8">
        <el-card>
          <template #header>
            <span>库存预警商品</span>
          </template>
          <el-table :data="warningProducts" stripe size="small" :max-height="340">
            <el-table-column prop="name" label="商品" show-overflow-tooltip />
            <el-table-column prop="current_stock" label="库存" align="center" width="70" />
            <el-table-column prop="stock_warning_threshold" label="阈值" align="center" width="70" />
          </el-table>
          <el-empty v-if="!warningProducts.length" description="暂无预警" :image-size="60" />
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import * as echarts from 'echarts'
import {
  Box, ShoppingCart, TrendCharts, Coin, Goods, Wallet
} from '@element-plus/icons-vue'
import { getOverview, getMonthlySales } from '@/api/dashboard'
import { getProductList } from '@/api/product'

const overview = reactive({
  total_stock: 0,
  today_sales: '0.00',
  today_profit: '0.00',
  month_sales: '0.00',
  month_profit: '0.00',
  product_count: 0,
})

const warningProducts = ref([])
const chartMonths = ref(12)
const chartRef = ref(null)
let chartInstance = null

async function loadOverview() {
  try {
    const res = await getOverview()
    Object.assign(overview, res)
  } catch (e) {
    console.error('overview error', e)
  }
}

async function loadWarning() {
  try {
    const res = await getProductList({ page: 1, pageSize: 200 })
    warningProducts.value = (res.list || []).filter(
      (p) => Number(p.current_stock) <= Number(p.stock_warning_threshold)
    )
  } catch (e) { /* ignore */ }
}

async function loadMonthly() {
  try {
    const res = await getMonthlySales(chartMonths.value)
    renderChart(res || [])
  } catch (e) {
    console.error('monthly sales error', e)
  }
}

function renderChart(data) {
  if (!chartInstance) return
  const months = data.map((d) => d.month)
  const sales = data.map((d) => Number(d.sales || 0))
  const orders = data.map((d) => Number(d.order_count || 0))

  chartInstance.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['销售额 (元)', '订单数'], top: 0 },
    grid: { left: 50, right: 50, bottom: 30, top: 40 },
    xAxis: { type: 'category', data: months, axisLabel: { rotate: 30 } },
    yAxis: [
      { type: 'value', name: '销售额', position: 'left', axisLabel: { formatter: (v) => '¥' + v } },
      { type: 'value', name: '订单数', position: 'right', axisLabel: { formatter: (v) => v } },
    ],
    series: [
      {
        name: '销售额 (元)',
        type: 'bar',
        data: sales,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#409eff' },
            { offset: 1, color: '#79bbff' },
          ]),
          borderRadius: [4, 4, 0, 0],
        },
        barMaxWidth: 36,
      },
      {
        name: '订单数',
        type: 'line',
        yAxisIndex: 1,
        data: orders,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { width: 2, color: '#f56c6c' },
        itemStyle: { color: '#f56c6c' },
      },
    ],
  }, true)
}

function handleResize() {
  chartInstance && chartInstance.resize()
}

onMounted(async () => {
  await nextTick()
  chartInstance = echarts.init(chartRef.value)
  window.addEventListener('resize', handleResize)

  await Promise.all([loadOverview(), loadMonthly(), loadWarning()])
})

watch(chartMonths, () => {
  loadMonthly()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance && chartInstance.dispose()
})
</script>

<style scoped>
.stat-card {
  margin-bottom: 0;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stat-icon {
  font-size: 32px;
  flex-shrink: 0;
}
.stat-value {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
}
.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}
.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

@media (max-width: 768px) {
  .stat-item { gap: 8px; }
  .stat-icon { font-size: 24px; }
  .stat-value { font-size: 18px; }
  .stat-label { font-size: 11px; }
}
</style>

