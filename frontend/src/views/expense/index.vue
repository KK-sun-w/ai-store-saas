<template>
  <div>
    <div class="table-toolbar">
      <div class="search-bar">
        <el-select v-model="search.expense_type" placeholder="开销类型" clearable style="width: 160px">
          <el-option v-for="t in expenseTypes" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>
      <el-button type="primary" :icon="Plus" @click="openDialog()">记一笔开销</el-button>
    </div>

    <el-table :data="list" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" align="center" />
      <el-table-column prop="expense_type" label="类型" width="110">
        <template #default="{ row }">{{ typeLabel(row.expense_type) }}</template>
      </el-table-column>
      <el-table-column prop="amount" label="金额" width="120" align="right">
        <template #default="{ row }">
          <span style="color: #f56c6c">¥{{ Number(row.amount).toFixed(2) }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="payee" label="收款方" width="140" />
      <el-table-column prop="payment_method" label="支付方式" width="110">
        <template #default="{ row }">{{ methodLabel(row.payment_method) }}</template>
      </el-table-column>
      <el-table-column prop="expense_time" label="发生时间" width="170" />
      <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip />
      <el-table-column label="操作" width="150" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" link @click="handleDelete(row)">删除</el-button>
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

    <el-dialog v-model="dialog.visible" :title="dialog.mode === 'edit' ? '编辑开销' : '新增开销'" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="开销类型" prop="expense_type">
          <el-select v-model="form.expense_type" style="width: 100%">
            <el-option v-for="t in expenseTypes" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="金额" prop="amount">
          <el-input-number v-model="form.amount" :min="0" :precision="2" style="width: 100%" />
        </el-form-item>
        <el-form-item label="发生时间" prop="expense_time">
          <el-date-picker v-model="form.expense_time" type="datetime" style="width: 100%" />
        </el-form-item>
        <el-form-item label="收款方">
          <el-input v-model="form.payee" />
        </el-form-item>
        <el-form-item label="支付方式">
          <el-select v-model="form.payment_method" style="width: 100%">
            <el-option v-for="m in paymentMethods" :key="m.value" :label="m.label" :value="m.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog.visible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getExpenseList, createExpense, updateExpense, deleteExpense } from '@/api/expense'

const loading = ref(false)
const submitting = ref(false)
const list = ref([])
const total = ref(0)

const search = reactive({ page: 1, pageSize: 10, expense_type: '' })

const expenseTypes = [
  { value: 'rent', label: '房租' },
  { value: 'utility', label: '水电' },
  { value: 'salary', label: '人工' },
  { value: 'marketing', label: '营销' },
  { value: 'other', label: '其他' }
]
const paymentMethods = [
  { value: 'cash', label: '现金' },
  { value: 'wechat', label: '微信' },
  { value: 'alipay', label: '支付宝' },
  { value: 'bank', label: '银行卡' }
]

const typeLabel = (v) => expenseTypes.find((t) => t.value === v)?.label || v
const methodLabel = (v) => paymentMethods.find((m) => m.value === v)?.label || v

const dialog = reactive({ visible: false, mode: 'create', id: null })
const formRef = ref()
const form = reactive({
  expense_type: 'other', amount: 0, expense_time: '',
  payee: '', payment_method: '', remark: ''
})

const rules = {
  expense_type: [{ required: true, message: '请选择开销类型', trigger: 'change' }],
  amount: [{ required: true, message: '请输入金额', trigger: 'blur' }]
}

async function loadData() {
  loading.value = true
  try {
    const data = await getExpenseList(search)
    list.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function openDialog(row) {
  if (row) {
    dialog.mode = 'edit'
    dialog.id = row.id
    Object.assign(form, {
      expense_type: row.expense_type,
      amount: Number(row.amount),
      expense_time: row.expense_time,
      payee: row.payee,
      payment_method: row.payment_method,
      remark: row.remark
    })
  } else {
    dialog.mode = 'create'
    dialog.id = null
    Object.assign(form, {
      expense_type: 'other', amount: 0, expense_time: new Date().toISOString(),
      payee: '', payment_method: '', remark: ''
    })
  }
  dialog.visible = true
}

async function handleSubmit() {
  await formRef.value.validate()
  submitting.value = true
  try {
    if (dialog.mode === 'edit') {
      await updateExpense(dialog.id, form)
      ElMessage.success('更新成功')
    } else {
      await createExpense(form)
      ElMessage.success('创建成功')
    }
    dialog.visible = false
    loadData()
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row) {
  await ElMessageBox.confirm(`确定删除该开销记录？`, '提示', { type: 'warning' })
  await deleteExpense(row.id)
  ElMessage.success('删除成功')
  loadData()
}

onMounted(loadData)
</script>