<!-- 商品卡片列表页 - 电脑后台, 保留左侧侧边栏 -->
<template>
  <div class="product-page">
    <!-- 顶部工具栏 -->
    <div class="toolbar">
      <div class="toolbar-left">
        <el-select v-model="filterCategory" placeholder="全部类别" clearable style="width:160px" @change="loadList(1)">
          <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
        </el-select>
        <el-input
          v-model="keyword"
          placeholder="输入货品名称/条形码/供应商查找"
          clearable
          @keyup.enter="loadList(1)"
          @clear="loadList(1)"
          style="width:320px"
        >
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button :icon="VideoCamera" @click="openScanner" title="扫码识别条码">扫码</el-button>
        <el-button :icon="Refresh" circle @click="loadList" />
      </div>
      <div class="toolbar-right">
        <el-button type="primary" @click="goNew">
          <el-icon style="margin-right:4px"><Plus /></el-icon>+ 新增商品
        </el-button>
      </div>
    </div>

    <!-- 卡片列表区域 -->
    <div class="card-scroll" v-loading="loading">
      <!-- 有数据时 -->
      <div v-if="list.length > 0" class="card-list">
        <div
          v-for="item in list"
          :key="item.id"
          class="product-card"
          @click="goDetail(item)"
        >
          <!-- 左侧图片 -->
          <div class="card-img">
            <el-image
              v-if="item.image_url"
              :src="resolveImgUrl(item.image_url)"
              fit="cover"
              class="prod-img"
              :preview-src-list="[resolveImgUrl(item.image_url)]"
              preview-teleported
            >
              <template #error>
                <div class="img-placeholder">
                  <el-icon :size="28"><Picture /></el-icon>
                  <span>无图片</span>
                </div>
              </template>
            </el-image>
            <div v-else class="img-placeholder">
              <el-icon :size="28"><Picture /></el-icon>
              <span>无图片</span>
            </div>
            <!-- 缺货/低库存标签 -->
            <div v-if="item.current_stock === 0" class="badge badge-out">缺货</div>
            <div v-else-if="item.stock_warning_threshold > 0 && item.current_stock <= item.stock_warning_threshold" class="badge badge-low">低库存</div>
          </div>

          <!-- 右侧信息 -->
          <div class="card-info">
            <div class="card-title">{{ item.name }}</div>
            <div class="card-meta">
              <span>条码：{{ item.barcode || '-' }}</span>
              <span class="sep">|</span>
              <span>SKU：{{ item.sku_code || '-' }}</span>
            </div>
            <div class="card-prices">
              <template v-if="isOwner">
                <span class="price-row"><span class="label">进货价</span><span class="val">¥{{ fmt(item.cost_price) }}</span></span>
                <span class="price-row"><span class="label">批发价</span><span class="val">¥{{ fmt(item.wholesale_price) }}</span></span>
                <span class="price-row price-retail"><span class="label">零售价</span><span class="val">¥{{ fmt(item.sale_price) }}</span></span>
              </template>
              <template v-else>
                <span class="price-row price-retail"><span class="label">零售价</span><span class="val">¥{{ fmt(item.sale_price) }}</span></span>
              </template>
            </div>
            <div class="card-stock">
              <span class="stock-num" :class="{'stock-zero': Number(item.current_stock) === 0}">
                库存 {{ fmt(item.current_stock) }}
              </span>
              <span class="stock-unit">{{ item.unit || '件' }}</span>
            </div>
          </div>

          <!-- 右侧箭头 -->
          <div class="card-arrow">
            <el-icon><ArrowRight /></el-icon>
          </div>
        </div>
      </div>

      <!-- 空数据 -->
      <el-empty v-else-if="!loading" description="暂无商品，点击右上角新增" />
    </div>

    <!-- 底部分页 -->
    <div class="pagination-bar">
      <span class="total-info">共 {{ total }} 种货品</span>
      <el-pagination
        background
        layout="prev, pager, next, jumper, sizes"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        :page-sizes="[10, 20, 50]"
        @current-change="loadList"
        @size-change="(s) => { pageSize = s; loadList(1); }"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search, Refresh, Plus, VideoCamera, Picture, ArrowRight } from '@element-plus/icons-vue'
import { getProductList } from '@/api/product'
import { openScanner as _openScan } from '@/utils/scanner'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()
const isOwner = computed(() => userStore.role === 'owner')

const loading = ref(false)
const list = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')
const filterCategory = ref('')
const categoryOptions = ref([])

function fmt(n) {
  const v = Number(n || 0)
  return v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)
}
function resolveImgUrl(url) {
  if (!url) return ''
  if (url.startsWith('http')) return url
  return window.location.origin + url
}

async function loadList(p) {
  if (p) page.value = p
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (keyword.value) params.keyword = keyword.value
    if (filterCategory.value) params.category = filterCategory.value
    const r = await getProductList(params)
    list.value = r.list || []
    total.value = r.total || 0
    // 提取分类选项
    const cats = [...new Set(list.value.map(x => x.category).filter(Boolean))]
    if (filterCategory.value && !categoryOptions.value.includes(filterCategory.value)) {
      cats.unshift(filterCategory.value)
    }
    categoryOptions.value = ['全部类别', ...cats]
  } catch (e) {
    ElMessage.error('加载商品列表失败')
  } finally {
    loading.value = false
  }
}

function goDetail(item) { router.push('/products/' + item.id + '/edit') }
function goNew() { router.push('/products/new') }

function openScanner() {
  _openScan({ onDetected: (code) => {
    ElMessage.success('扫到条码: ' + code)
    keyword.value = code
    loadList(1)
  }})
}

onMounted(() => loadList(1))
</script>

<style scoped>
.product-page { height: 100%; display: flex; flex-direction: column; padding: 16px; gap: 12px; box-sizing: border-box; }

/* 工具栏 */
.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  background: #fff; border-radius: 10px; padding: 12px 16px; box-shadow: 0 1px 4px rgba(0,0,0,.05); flex-shrink: 0;
}
.toolbar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.toolbar-right { display: flex; align-items: center; }

/* 滚动区域 */
.card-scroll { flex: 1; overflow-y: auto; border-radius: 10px; background: #fafbfc; padding: 8px; }
.card-scroll::-webkit-scrollbar { width: 8px; }
.card-scroll::-webkit-scrollbar-thumb { background: #dcdfe6; border-radius: 4px; }

/* 卡片列表 */
.card-list { display: flex; flex-direction: column; gap: 10px; }

/* 单张卡片 - 参考智慧记 */
.product-card {
  display: flex; align-items: stretch; gap: 14px;
  background: #fff; border-radius: 10px; padding: 14px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
  cursor: pointer; transition: all .2s;
  border: 1px solid transparent;
}
.product-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,.10); border-color: #409eff; transform: translateY(-1px); }

/* 左侧图片 */
.card-img { position: relative; flex-shrink: 0; width: 100px; height: 100px; border-radius: 8px; overflow: hidden; background: #f5f7fa; }
.prod-img { width: 100%; height: 100%; display: block; }
.img-placeholder { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #c0c4cc; gap: 4px; font-size: 11px; }
.badge { position: absolute; top: 4px; left: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; color: #fff; }
.badge-out { background: #f56c6c; }
.badge-low { background: #e6a23c; }

/* 右侧信息 */
.card-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.card-title { font-size: 16px; font-weight: 600; color: #303133; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-meta { font-size: 12px; color: #909399; display: flex; gap: 6px; flex-wrap: wrap; }
.card-meta .sep { color: #dcdfe6; }
.card-prices { display: flex; gap: 16px; flex-wrap: wrap; }
.price-row { display: inline-flex; align-items: baseline; gap: 4px; }
.price-row .label { font-size: 12px; color: #909399; }
.price-row .val { font-size: 14px; color: #606266; font-weight: 500; }
.price-retail .val { color: #f56c6c; font-weight: 600; }
.card-stock { display: flex; align-items: baseline; gap: 6px; font-size: 13px; }
.stock-num { color: #606266; font-weight: 500; }
.stock-num.stock-zero { color: #f56c6c; font-weight: 600; }
.stock-unit { color: #909399; font-size: 12px; }

/* 右侧箭头 */
.card-arrow { display: flex; align-items: center; color: #c0c4cc; flex-shrink: 0; }

/* 分页栏 */
.pagination-bar {
  display: flex; justify-content: space-between; align-items: center;
  background: #fff; border-radius: 10px; padding: 10px 16px; box-shadow: 0 1px 4px rgba(0,0,0,.05); flex-shrink: 0;
}
.total-info { font-size: 13px; color: #909399; }
</style>
