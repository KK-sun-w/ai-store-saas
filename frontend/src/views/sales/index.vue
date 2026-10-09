<template>
  <div>
    <div class="table-toolbar">
      <div class="search-bar">
        <el-input v-model="search.order_no" placeholder="单号" clearable style="width: 200px" @keyup.enter="loadData" />
        <el-select v-model="search.status" placeholder="状态" clearable style="width: 120px">
          <el-option label="正常" :value="1" />
          <el-option label="已退款" :value="2" />
          <el-option label="已作废" :value="3" />
        </el-select>
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>
      <el-button type="primary" :icon="Plus" @click="openDialog()">新建销售单</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" align="center" />
      <el-table-column prop="order_no" label="单号" width="180" />
      <el-table-column prop="customer_name" label="客户" width="120" />
      <el-table-column prop="total_amount" label="销售额" width="110" align="right">
        <template #default="{ row }">¥{{ Number(row.total_amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="total_cost" label="成本" width="110" align="right">
        <template #default="{ row }">¥{{ Number(row.total_cost).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="gross_profit" label="毛利" width="110" align="right">
        <template #default="{ row }">
          <span :style="{ color: Number(row.gross_profit) >= 0 ? '#67c23a' : '#f56c6c' }">
            ¥{{ Number(row.gross_profit).toFixed(2) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="90" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ { 1: '正常', 2: '已退款', 3: '已作废' }[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="sales_time" label="销售时间" width="170" />
      <el-table-column label="操作" width="100" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="showDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="search.page"
        v-model:page-size="search.pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="loadData"
        @current-change="loadData"
      />
    </div>

    <el-dialog v-model="dialog.visible" title="新建销售单" width="700px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="客户名称">
          <el-input v-model="form.customer_name" placeholder="散客可留空" />
        </el-form-item>
        <el-form-item label="销售时间" prop="sales_time">
          <el-date-picker v-model="form.sales_time" type="datetime" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <el-divider>明细</el-divider>
      <el-table :data="form.items" border>
        <el-table-column label="商品" min-width="220">
          <template #default="{ row }">
            <el-select v-model="row.product_id" filterable placeholder="选择商品" style="width: 100%" @change="onProductChange(row)">
              <el-option
                v-for="p in productOptions"
                :key="p.id"
                :label="`${p.sku_code} - ${p.name} (库存:${p.current_stock})`"
                :value="p.id"
              />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="数量" width="120">
          <template #default="{ row }">
            <el-input-number v-model="row.quantity" :min="1" :precision="2" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="销售单价" width="140">
          <template #default="{ row }">
            <el-input-number v-model="row.unit_price" :min="0" :precision="2" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="小计" width="120" align="right">
          <template #default="{ row }">¥{{ (row.quantity * row.unit_price).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ $index }">
            <el-button type="danger" link @click="form.items.splice($index, 1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button type="primary" plain style="margin-top: 12px" :icon="Plus" @click="addItem">添加明细</el-button>
      <div style="text-align: right; margin-top: 12px; font-size: 16px">
        合计: <b style="color: #67c23a">¥{{ totalAmount.toFixed(2) }}</b>
      </div>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detail.visible" title="销售单详情" width="720px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="单号">{{ detail.data.order_no }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag size="small">{{ { 1: '正常', 2: '已退款', 3: '已作废' }[detail.data.status] }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="客户">{{ detail.data.customer_name }}</el-descriptions-item>
        <el-descriptions-item label="销售额">¥{{ Number(detail.data.total_amount || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="成本">¥{{ Number(detail.data.total_cost || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="毛利">
          <span :style="{ color: Number(detail.data.gross_profit) >= 0 ? '#67c23a' : '#f56c6c' }">
            ¥{{ Number(detail.data.gross_profit || 0).toFixed(2) }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="销售时间">{{ detail.data.sales_time }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detail.data.remark }}</el-descriptions-item>
      </el-descriptions>
      <el-table :data="detail.items" border style="margin-top: 16px">
        <el-table-column prop="product_id" label="商品ID" width="100" />
        <el-table-column prop="quantity" label="数量" width="100" align="right" />
        <el-table-column prop="unit_price" label="单价" width="100" align="right" />
        <el-table-column prop="unit_cost" label="成本" width="100" align="right" />
        <el-table-column prop="amount" label="金额" width="100" align="right" />
        <el-table-column prop="profit" label="毛利" width="100" align="right" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getSalesList, getSalesDetail, createSales } from '@/api/sales'
import { getProductList } from '@/api/product'

const loading = ref(false)
const submitting = ref(false)
const list = ref([])
const total = ref(0)
const productOptions = ref([])

const search = reactive({ page: 1, pageSize: 10, order_no: '', status: '' })

const dialog = reactive({ visible: false })
const formRef = ref()
const rules = {
  sales_time: [{ required: true, message: '请选择销售时间', trigger: 'change' }]
}
const form = reactive({ customer_name: '', sales_time: '', remark: '', items: [] })
const detail = reactive({ visible: false, data: {}, items: [] })

const totalAmount = computed(() =>
  form.items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_price || 0), 0)
)

async function loadData() {
  loading.value = true
  try {
    const data = await getSalesList(search)
    list.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

async function loadProducts() {
  const data = await getProductList({ page: 1, pageSize: 100 })
  productOptions.value = data.list
}

function addItem() {
  form.items.push({ product_id: null, quantity: 1, unit_price: 0 })
}

function onProductChange(row) {
  const p = productOptions.value.find((x) => x.id === row.product_id)
  if (p) row.unit_price = Number(p.sale_price)
}

function openDialog() {
  Object.assign(form, { customer_name: '', sales_time: '', remark: '', items: [{ product_id: null, quantity: 1, unit_price: 0 }] })
  dialog.visible = true
  loadProducts()
}

async function handleSubmit() {
  await formRef.value.validate()
  if (!form.items.length) return ElMessage.warning('请添加明细')
  const invalid = form.items.find((i) => !i.product_id || !i.quantity)
  if (invalid) return ElMessage.warning('请完整填写明细')
  submitting.value = true
  try {
    await createSales({
      customer_name: form.customer_name,
      sales_time: form.sales_time,
      remark: form.remark,
      items: form.items
    })
    ElMessage.success('开单成功')
    dialog.visible = false
    loadData()
  } finally {
    submitting.value = false
  }
}

async function showDetail(row) {
  const data = await getSalesDetail(row.id)
  detail.data = data
  detail.items = data.items || []
  detail.visible = true
}

onMounted(loadData)
</script>
