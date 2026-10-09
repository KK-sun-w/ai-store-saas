<template>
  <div class="mentor-page">
    <!-- 顶部标题 -->
    <div class="mentor-header">
      <h2>门店商业导师</h2>
      <span class="desc">基于真实进销存数据 + 店铺历史记忆, 给你做经营诊断和发展规划</span>
    </div>

    <!-- 对话区 -->
    <div class="chat-area">
      <!-- 消息列表 -->
      <div class="messages" ref="msgBox">
        <div v-for="(msg, i) in messages" :key="i" :class="['msg-row', msg.role]">
          <div class="msg-avatar">{{ msg.role === 'user' ? '老板' : '导师' }}</div>
          <div class="msg-bubble">
            <div class="msg-text" v-html="renderMd(msg.content)"></div>
          </div>
        </div>
        <!-- 加载中 -->
        <div v-if="loading" class="msg-row assistant">
          <div class="msg-avatar">导师</div>
          <div class="msg-bubble"><div class="msg-text typing">正在分析店铺数据...</div></div>
        </div>
      </div>

      <!-- 底部输入区 -->
      <div class="input-bar">
        <el-input
          v-model="inputText" type="textarea" :rows="2"
          placeholder="问导师任何经营问题, 如: 我的店现在赚钱吗? 哪些商品该淘汰? 下一步该怎么发展?"
          @keydown.enter.exact.prevent="send"
          :disabled="loading"
        />
        <el-button type="primary" @click="send" :loading="loading" :disabled="!inputText.trim()">
          发送
        </el-button>
      </div>
    </div>

    <!-- 数据源摘要面板(折叠) -->
    <el-drawer v-model="showMeta" title="本次对话元信息" size="400px">
      <div v-if="lastMeta" class="meta-panel">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="任务ID">{{ lastMeta.task_id }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ lastMeta.elapsed_ms }}ms</el-descriptions-item>
          <el-descriptions-item label="Token消耗">
            输入{{ lastMeta.token_stats.input }} / 输出{{ lastMeta.token_stats.output }} / 共{{ lastMeta.token_stats.total }}
          </el-descriptions-item>
          <el-descriptions-item label="记忆注入">{{ lastMeta.memory_injected ? '已注入店铺历史记忆' : '无记忆' }}</el-descriptions-item>
        </el-descriptions>
        <h4 style="margin:16px 0 8px">数据源(工具调用)</h4>
        <div v-if="lastMeta.data_sources && lastMeta.data_sources.length">
          <el-tag v-for="(ds, i) in lastMeta.data_sources" :key="i" style="margin:0 4px 4px 0">
            {{ ds.tool || ds.name }}
          </el-tag>
        </div>
        <div v-else style="color:#999">本次未调用数据工具</div>
      </div>
    </el-drawer>

    <!-- 浮动按钮: 查看元信息 -->
    <el-button v-if="lastMeta" class="meta-btn" circle type="info" @click="showMeta = true">
      <el-icon><InfoFilled /></el-icon>
    </el-button>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled } from '@element-plus/icons-vue'
import { mentorChat } from '@/api/mentor'

const messages = ref([])       // [{role:'user'|'assistant', content:String}]
const inputText = ref('')
const loading = ref(false)
const lastMeta = ref(null)
const showMeta = ref(false)
const msgBox = ref(null)

async function send() {
  const text = inputText.value.trim()
  if (!text || loading.value) return

  // push 用户消息
  messages.value.push({ role: 'user', content: text })
  inputText.value = ''
  loading.value = true
  await scrollToBottom()

  try {
    const res = await mentorChat({ message: text, history: buildHistory() })
    const reply = res.data?.reply || res.data?.message || '导师暂无回复'
    messages.value.push({ role: 'assistant', content: reply })
    lastMeta.value = res.data?.meta || null
  } catch (err) {
    console.error('mentor chat error:', err)
    ElMessage.error('对话失败: ' + (err.message || '未知错误'))
    messages.value.push({ role: 'assistant', content: '抱歉, 我暂时无法回复, 请稍后重试。' })
  } finally {
    loading.value = false
    await scrollToBottom()
  }
}

// 构建历史消息(只传最近6轮, 控制token)
function buildHistory() {
  return messages.value.slice(-12).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }))
}

// 简易markdown渲染(加粗+表格+换行)
function renderMd(text) {
  if (!text) return ''
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>')
  return html
}

async function scrollToBottom() {
  await nextTick()
  if (msgBox.value) msgBox.value.scrollTop = msgBox.value.scrollHeight
}
</script>

<style scoped>
.mentor-page { display: flex; flex-direction: column; padding-bottom: 20px; }
.mentor-header { margin-bottom: 12px; }
.mentor-header h2 { margin: 0; font-size: 20px; }
.mentor-header .desc { font-size: 13px; color: #999; }
.chat-area { display: flex; flex-direction: column; border: 1px solid #e4e7ed; border-radius: 8px; min-height: 400px; }
.messages { flex: 1; max-height: 60vh; overflow-y: auto; padding: 16px; background: #f5f7fa; }
.msg-row { display: flex; margin-bottom: 16px; gap: 8px; }
.msg-row.user { flex-direction: row-reverse; }
.msg-avatar { flex-shrink: 0; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; background: #409eff; color: #fff; }
.msg-row.assistant .msg-avatar { background: #67c23a; }
.msg-bubble { max-width: 75%; }
.msg-text { padding: 10px 14px; border-radius: 8px; font-size: 14px; line-height: 1.6; word-break: break-word; }
.msg-row.user .msg-text { background: #409eff; color: #fff; }
.msg-row.assistant .msg-text { background: #fff; color: #303133; border: 1px solid #e4e7ed; }
.typing { color: #999; font-style: italic; }
.input-bar { display: flex; gap: 8px; padding: 12px; background: #fff; border-top: 1px solid #e4e7ed; align-items: flex-end; }
.input-bar .el-button { height: 40px; }
.meta-btn { position: fixed; right: 24px; bottom: 24px; z-index: 100; }
.meta-panel { padding: 16px; }
</style>

