<!-- 商品详情/编辑页 -->
<template>
  <div class="detail-page">
    <div class="page-header">
      <el-button :icon="ArrowLeft" circle @click="$router.push('/products')" />
      <h2 class="page-title">{{ isEdit ? '货品详情' : '新增商品' }}</h2>
      <div class="header-actions">
        <el-button v-if="isEdit && isOwner" type="danger" plain @click="onDelete">删除商品</el-button>
      </div>
    </div>

    <el-card v-loading="pageLoading" shadow="never" class="detail-card">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" class="detail-form">
        <div class="form-row">
          <div class="img-upload">
            <el-upload
              :show-file-list="false"
              :action="uploadUrl"
              :headers="uploadHeaders"
              :on-success="onUploadSuccess"
              :on-error="onUploadError"
              accept="image/*"
              class="upload-wrapper"
            >
              <div class="upload-box">
                <el-image
                  v-if="form.image_url"
                  :src="resolveImgUrl(form.image_url)"
                  fit="cover"
                  style="width:120px;height:120px;border-radius:8px"
                  :preview-src-list="[resolveImgUrl(form.image_url)]"
                  preview-teleported
                />
                <div v-else class="upload-placeholder">
                  <el-icon :size="32"><Plus /></el-icon>
                  <span>上传图片</span>
                </div>
              </div>
            </el-upload>
            <div v-if="form.image_url" class="upload-hint">点击图片换一张</div>
          </div>

          <div class="basic-fields">
            <el-form-item label="商品名称" prop="name">
              <el-input v-model="form.name" placeholder="请输入商品名称" maxlength="128" />
            </el-form-item>
            <el-form-item label="条形码">
              <div style="display:flex;gap:8px;width:100%">
                <el-input v-model="form.barcode" placeholder="扫码或手动输入" maxlength="64" style="flex:1" />
                <el-button :icon="VideoCamera" @click="openScanner" title="扫码识别条码">扫码</el-button>
              </div>
            </el-form-item>
            <el-form-item label="SKU编码">
              <el-input v-model="form.sku_code" placeholder="不填将自动生成" maxlength="64" />
            </el-form-item>
            <el-form-item label="商品分类">
              <el-input v-model="form.category" placeholder="例如：饮品、日用" maxlength="32" />
            </el-form-item>
            <el-form-item label="计量单位">
              <el-input v-model="form.unit" placeholder="件/瓶/个/箱" maxlength="16" style="width:160px" />
            </el-form-item>
          </div>
        </div>

        <el-divider content-position="left">价格与库存</el-divider>
        <div class="price-grid">
          <el-form-item label="零售价">
            <el-input-number v-model="form.sale_price" :min="0" :precision="2" :step="0.5" style="width:100%" />
          </el-form-item>
          <el-form-item label="批发价">
            <el-input-number v-model="form.wholesale_price" :min="0" :precision="2" :step="0.5" style="width:100%" />
          </el-form-item>
          <el-form-item v-if="isOwner" label="进货价">
            <el-input-number v-model="form.cost_price" :min="0" :precision="2" :step="0.5" style="width:100%" />
          </el-form-item>
        </div>
        <div class="stock-grid">
          <el-form-item label="当前库存">
            <el-input-number v-model="form.current_stock" :min="0" :precision="2" :step="1" style="width:100%" />
          </el-form-item>
          <el-form-item label="预警阈值">
            <el-input-number v-model="form.stock_warning_threshold" :min="0" :precision="2" :step="1" style="width:100%" />
          </el-form-item>
          <el-form-item v-if="!isEdit" label="期初库存">
            <el-input-number v-model="form.initial_stock" :min="0" :precision="2" :step="1" style="width:100%" />
          </el-form-item>
        </div>

        <el-divider content-position="left">供应商与其他</el-divider>
        <el-form-item label="供应商">
          <el-input v-model="form.supplier" placeholder="输入供应商名称" maxlength="128" />
        </el-form-item>
        <el-form-item label="商品状态">
          <el-switch v-model="statusSwitch" active-text="在售" inactive-text="已下架" :inline-prompt="true" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="3" placeholder="商品备注说明" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>

      <div class="footer-actions">
        <el-button @click="$router.push('/products')">取消</el-button>
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Plus, VideoCamera } from '@element-plus/icons-vue'
import { getProductDetail, createProduct, updateProduct, deleteProduct } from '@/api/product'
import { openScanner as _openScan } from '@/utils/scanner'
import { useUserStore } from '@/stores/user'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const isOwner = computed(() => userStore.role === 'owner')
const isEdit = computed(() => !!route.params.id)

const formRef = ref(null)
const pageLoading = ref(false)
const saving = ref(false)

const uploadUrl = window.location.origin + '/api/upload'
const uploadHeaders = computed(() => ({
  Authorization: 'Bearer ' + (localStorage.getItem('token') || '')
}))

function resolveImgUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return window.location.origin + url
}

const form = reactive({
  name: '', barcode: '', category: '', unit: '件',
  image_url: '', sale_price: 0, wholesale_price: 0, cost_price: 0,
  current_stock: 0, stock_warning_threshold: 0, initial_stock: 0,
  supplier: '', sku_code: '', remark: '', status: 1
})

const statusSwitch = computed({
  get: () => form.status === 1,
  set: (v) => form.status = v ? 1 : 0
})

function coerceForm(data) {
  Object.assign(form, {
    name: data.name || '',
    barcode: data.barcode || '',
    category: data.category || '',
    unit: data.unit || '件',
    image_url: data.image_url || '',
    supplier: data.supplier || '',
    sku_code: data.sku_code || '',
    remark: data.remark || '',
    sale_price: Number(data.sale_price || 0),
    wholesale_price: Number(data.wholesale_price || 0),
    cost_price: Number(data.cost_price || 0),
    current_stock: Number(data.current_stock || 0),
    stock_warning_threshold: Number(data.stock_warning_threshold || 0),
    status: Number(data.status ?? 1)
  })
}

async function loadDetail() {
  if (!isEdit.value || !route.params.id) return
  pageLoading.value = true
  try {
    const r = await getProductDetail(route.params.id)
    coerceForm(r)
    if (!isOwner.value) form.cost_price = 0
  } catch (e) { ElMessage.error('加载商品详情失败'); router.push('/products') }
  finally { pageLoading.value = false }
}

function onUploadSuccess(resp) {
  const url = resp?.data?.url || resp?.url || ''
  if (!url) { console.warn('上传响应:', resp); ElMessage.error('上传响应异常'); return }
  form.image_url = url
  ElMessage.success('上传成功')
}
function onUploadError(err) { console.error('上传失败:', err); ElMessage.error('上传失败，请检查图片大小（≤5MB）') }

async function onSave() {
  const data = {
    name: form.name, barcode: form.barcode, category: form.category, unit: form.unit,
    image_url: form.image_url || null,
    sale_price: Number(form.sale_price || 0),
    wholesale_price: Number(form.wholesale_price || 0),
    cost_price: Number(form.cost_price || 0),
    current_stock: Number(form.current_stock || 0),
    stock_warning_threshold: Number(form.stock_warning_threshold || 0),
    supplier: form.supplier || null, sku_code: form.sku_code || null, remark: form.remark || null,
    status: form.status
  }
  if (!isEdit.value) data.initial_stock = Number(form.initial_stock || 0)
  if (!isOwner.value) delete data.cost_price
  saving.value = true
  try {
    if (isEdit.value) await updateProduct(route.params.id, data)
    else await createProduct(data)
    ElMessage.success(isEdit.value ? '保存成功' : '创建成功')
    router.push('/products')
  } catch (e) {} finally { saving.value = false }
}

async function onDelete() {
  try { await ElMessageBox.confirm('确定删除该商品？', '确认', { type: 'warning' }) } catch { return }
  try { await deleteProduct(route.params.id); ElMessage.success('已删除'); router.push('/products') } catch (e) {}
}

// ====== 扫码 (兼容 iOS) ======
function openScanner() {
  _openScan({ onDetected: (code) => { form.barcode = code; ElMessage.success('扫到条码') } })
}

onMounted(loadDetail)
</script>

<style scoped>
.detail-page { padding: 16px; height: 100%; overflow: auto; }
.page-header { display: flex; align-items: center; gap: 16px; margin-bottom: 16px; }
.page-title { font-size: 18px; margin: 0; flex: 1; color: #303133; }
.detail-card { max-width: 900px; margin: 0 auto; }
.detail-form { padding: 16px 24px; }
.form-row { display: flex; gap: 32px; flex-wrap: wrap; align-items: flex-start; }
.img-upload { flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; }
.upload-box { border: 2px dashed #dcdfe6; border-radius: 8px; cursor: pointer; overflow: hidden; width: 120px; height: 120px; display: flex; align-items: center; justify-content: center; transition: border-color .2s; }
.upload-box:hover { border-color: #409eff; }
.upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; color: #909399; font-size: 12px; }
.upload-hint { font-size: 11px; color: #909399; }
.basic-fields { flex: 1; min-width: 260px; }
.price-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 16px; }
.stock-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 16px; }
@media (max-width: 700px) { .price-grid, .stock-grid { grid-template-columns: 1fr; } }
.footer-actions { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid #ebeef5; margin-top: 24px; }
</style>
