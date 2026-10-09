<template>
  <div>
    <div class="table-toolbar">
      <div class="search-bar">
        <el-input v-model="search.order_no" placeholder="单号" clearable style="width: 200px" @keyup.enter="loadData" />
        <el-select v-model="search.status" placeholder="状态" clearable style="width: 120px">
          <el-option label="草稿" :value="1" />
          <el-option label="已入库" :value="2" />
          <el-option label="已作废" :value="3" />
        </el-select>
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>
      <el-button type="primary" :icon="Plus" @click="openDialog()">新建进货单</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" align="center" />
      <el-table-column prop="order_no" label="单号" width="180" />
      <el-table-column prop="supplier_name" label="供应商" width="140" />
      <el-table-column prop="total_amount" label="总额" width="110" align="right">
        <template #default="{ row }">¥{{ Number(row.total_amount).toFixed(2) }}</template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="row.status === 2 ? 'success' : row.status === 1 ? 'warning' : 'info'" size="small">
            {{ { 1: '草稿', 2: '已入库', 3: '已作废' }[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="purchase_time" label="进货时间" width="170" />
      <el-table-column label="操作" width="200" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="showDetail(row)">详情</el-button>
          <el-button v-if="row.status === 1" size="small" type="success" link @click="handleConfirm(row)">确认入库</el-button>
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

    <el-dialog v-model="dialog.visible" title="新建进货单" width="700px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="供应商" prop="supplier_name">
          <el-input v-model="form.supplier_name" />
        </el-form-item>
        <el-form-item label="进货时间" prop="purchase_time">
          <el-date-picker v-model="form.purchase_time" type="datetime" style="width: 100%" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>

      <el-divider>明细</el-divider>
      <el-table :data="form.items" border>
        <el-table-column label="商品" min-width="200">
          <template #default="{ row }">
            <el-select v-model="row.product_id" filterable placeholder="选择商品" style="width: 100%">
              <el-option v-for="p in productOptions" :key="p.id" :label="`${p.sku_code} - ${p.name}`" :value="p.id" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="数量" width="130">
          <template #default="{ row }">
            <el-input-number v-model="row.quantity" :min="0.01" :precision="2" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="进货单价" width="150">
          <template #default="{ row }">
            <el-input-number v-model="row.unit_cost" :min="0" :precision="2" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="小计" width="120" align="right">
          <template #default="{ row }">¥{{ (row.quantity * row.unit_cost).toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center">
          <template #default="{ $index }">
            <el-button type="danger" link @click="form.items.splice($index, 1)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-button type="primary" plain style="margin-top: 12px" :icon="Plus" @click="addItem">添加明细</el-button>
      <div style="text-align: right; margin-top: 12px; font-size: 16px">
        合计: <b style="color: #f56c6c">¥{{ totalAmount.toFixed(2) }}</b>
      </div>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">提交</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detail.visible" title="进货单详情" width="700px">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="单号">{{ detail.data.order_no }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="detail.data.status === 2 ? 'success' : 'warning'" size="small">
            {{ { 1: '草稿', 2: '已入库', 3: '已作废' }[detail.data.status] }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="供应商">{{ detail.data.supplier_name }}</el-descriptions-item>
        <el-descriptions-item label="总额">¥{{ Number(detail.data.total_amount || 0).toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="进货时间">{{ detail.data.purchase_time }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ detail.data.remark }}</el-descriptions-item>
      </el-descriptions>
      <el-table :data="detail.items" border style="margin-top: 16px">
        <el-table-column prop="product_id" label="商品ID" width="100" />
        <el-table-column prop="quantity" label="数量" width="120" align="right" />
        <el-table-column prop="unit_cost" label="单价" width="120" align="right" />
        <el-table-column prop="amount" label="小计" width="120" align="right" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getPurchaseList, getPurchaseDetail, createPurchase, confirmPurchase } from '@/api/purchase'
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
  supplier_name: [{ required: true, message: '请输入供应商', trigger: 'blur' }],
  purchase_time: [{ required: true, message: '请选择进货时间', trigger: 'change' }]
}
const form = reactive({ supplier_name: '', purchase_time: '', remark: '', items: [] })

const detail = reactive({ visible: false, data: {}, items: [] })

const totalAmount = computed(() =>
  form.items.reduce((sum, it) => sum + Number(it.quantity || 0) * Number(it.unit_cost || 0), 0)
)

async function loadData() {
  loading.value = true
  try {
    const data = await getPurchaseList(search)
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
  form.items.push({ product_id: null, quantity: 1, unit_cost: 0 })
}

function openDialog() {
  Object.assign(form, { supplier_name: '', purchase_time: '', remark: '', items: [{ product_id: null, quantity: 1, unit_cost: 0 }] })
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
    await createPurchase({
      supplier_name: form.supplier_name,
      purchase_time: form.purchase_time,
      remark: form.remark,
      items: form.items
    })
    ElMessage.success('创建成功')
    dialog.visible = false
    loadData()
  } finally {
    submitting.value = false
  }
}

async function handleConfirm(row) {
  await ElMessageBox.confirm(`确认入库单号「${row.order_no}」?`, '提示', { type: 'warning' })
  await confirmPurchase(row.id)
  ElMessage.success('入库成功')
  loadData()
}

async function showDetail(row) {
  const data = await getPurchaseDetail(row.id)
  detail.data = data
  detail.items = data.items || []
  detail.visible = true
}

onMounted(loadData)
</script>
