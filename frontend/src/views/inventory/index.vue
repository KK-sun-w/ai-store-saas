<template>
  <div>
    <div class="table-toolbar">
      <div class="search-bar">
        <el-input
          v-model="search.keyword"
          placeholder="商品名称/SKU"
          clearable
          style="width: 220px"
          @keyup.enter="loadData"
        />
        <el-button type="primary" @click="loadData">查询</el-button>
      </div>
    </div>
 
    <el-table :data="list" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" align="center" />
      <el-table-column prop="sku_code" label="SKU编码" width="140" />
      <el-table-column prop="name" label="商品名称" min-width="160" />
      <el-table-column prop="category" label="分类" width="100" />
      <el-table-column prop="unit" label="单位" width="70" align="center" />
      <el-table-column prop="current_stock" label="当前库存" width="110" align="center">
        <template #default="{ row }">
          <el-tag
            :type="Number(row.current_stock) <= Number(row.stock_warning_threshold) ? 'danger' : 'success'"
            size="small"
          >
            {{ row.current_stock }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="stock_warning_threshold" label="预警阈值" width="100" align="center" />
      <el-table-column label="操作" width="130" fixed="right" align="center">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openDialog(row)">盘点调整</el-button>
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
 
    <el-dialog v-model="dialog.visible" title="库存盘点调整" width="520px">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="商品">
          <span>{{ form.product_name }}</span>
        </el-form-item>
        <el-form-item label="当前库存">
          <el-tag type="info">{{ form.before_stock }}</el-tag>
        </el-form-item>
        <el-form-item label="调整方向" prop="direction">
          <el-radio-group v-model="form.direction">
            <el-radio value="add">盘盈(加)</el-radio>
            <el-radio value="sub">盘亏(减)</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="调整数量" prop="adjust_num">
          <el-input-number v-model="form.adjust_num" :min="0.01" :precision="2" :step="1" style="width: 100%" />
        </el-form-item>
        <el-form-item label="调整后库存">
          <el-tag :type="previewStock < 0 ? 'danger' : 'success'">{{ previewStock }}</el-tag>
          <span v-if="previewStock < 0" style="color: #f56c6c; margin-left: 8px; font-size: 12px">
            调整后不能小于 0
          </span>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="盘点原因(可选)" />
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
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getProductList } from '@/api/product'
import { checkAdjust } from '@/api/inventory'
 
const loading = ref(false)
const submitting = ref(false)
const list = ref([])
const total = ref(0)
 
const search = reactive({
  page: 1,
  pageSize: 10,
  keyword: ''
})
 
const dialog = reactive({ visible: false })
const formRef = ref()
 
const form = reactive({
  product_id: null,
  product_name: '',
  before_stock: 0,
  direction: 'add',
  adjust_num: 1,
  remark: ''
})
 
const rules = {
  direction: [{ required: true, message: '请选择调整方向', trigger: 'change' }],
  adjust_num: [{ required: true, message: '请输入调整数量', trigger: 'blur' }]
}
 
// 预览调整后库存
const previewStock = computed(() => {
  const before = Number(form.before_stock) || 0
  const num = Number(form.adjust_num) || 0
  return form.direction === 'add' ? before + num : before - num
})
 
async function loadData() {
  loading.value = true
  try {
    const data = await getProductList(search)
    list.value = data.list
    total.value = data.total
  } finally {
    loading.value = false
  }
}
 
function openDialog(row) {
  form.product_id = row.id
  form.product_name = `${row.name}(${row.sku_code})`
  form.before_stock = Number(row.current_stock)
  form.direction = 'add'
  form.adjust_num = 1
  form.remark = ''
  dialog.visible = true
}
 
async function handleSubmit() {
  await formRef.value.validate()
  if (previewStock.value < 0) {
    ElMessage.error('调整后库存不能小于 0')
    return
  }
  // 正数加、负数减,符合后端 adjust_num 语义
  const adjustNum = form.direction === 'add' ? Number(form.adjust_num) : -Number(form.adjust_num)
  submitting.value = true
  try {
    const res = await checkAdjust({
      product_id: form.product_id,
      adjust_num: adjustNum,
      remark: form.remark
    })
    ElMessage.success(`盘点调整成功,当前库存:${res.afterStock}`)
    dialog.visible = false
    loadData()
  } finally {
    submitting.value = false
  }
}
 
onMounted(loadData)
</script>