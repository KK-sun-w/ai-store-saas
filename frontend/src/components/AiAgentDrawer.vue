<template>
  <!-- 悬浮触发按钮 -->
  <div class="ai-fab" @click="drawerVisible = true" title="AI 助手小Se">
    <div class="fab-badge" v-if="unread > 0">{{ unread }}</div>
    <el-icon :size="22"><ChatDotRound /></el-icon>
  </div>

  <!-- 右侧抽屉对话面板 -->
  <el-drawer
    v-model="drawerVisible"
    direction="rtl"
    size="420px"
    :with-header="false"
    class="ai-drawer"
  >
    <div class="ai-panel">
      <!-- 头部 -->
      <div class="ai-header">
        <div class="ai-header-left">
          <el-avatar :size="32" class="ai-avatar">AI</el-avatar>
          <div>
            <div class="ai-title">小Se · AI 门店助手</div>
            <div class="ai-subtitle">帮你管店 · 随时问</div>
          </div>
        </div>
        <div class="ai-header-right">
          <el-button link size="small" @click="resetChat">
            <el-icon><Refresh /></el-icon>
          </el-button>
          <el-button link size="small" @click="drawerVisible = false">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>

      <!-- 消息区 -->
      <div class="ai-messages" ref="messagesRef">
        <div v-if="messages.length === 0" class="ai-welcome">
          <el-avatar :size="56" class="ai-avatar-big">AI</el-avatar>
          <div class="welcome-title">你好，我是小Se 🤖</div>
          <div class="welcome-sub">我能帮你查库存、开单、盘点、看报表。试试这些👇</div>
          <div class="quick-actions">
            <el-button size="small" text @click="sendQuick('帮我查一下可乐库存')">📦 查库存</el-button>
            <el-button size="small" text @click="sendQuick('开个销售单，卖 2 瓶矿泉水，单价 2 元')">💰 开销售单</el-button>
            <el-button size="small" text @click="sendQuick('本月卖了多少，利润多少')">📊 看报表</el-button>
            <el-button size="small" text @click="sendQuick('今天开销多少')">💸 查开销</el-button>
          </div>
        </div>

        <div v-for="(msg, idx) in messages" :key="idx" class="msg-wrap" :class="msg.role">
          <!-- 系统气泡 -->
          <div v-if="msg.role === 'system'" class="system-msg">{{ msg.content }}</div>

          <!-- 用户 -->
          <template v-else-if="msg.role === 'user'">
            <el-avatar :size="30" class="user-avatar">我</el-avatar>
            <div class="bubble user-bubble">{{ msg.content }}</div>
          </template>

          <!-- AI (可能带工具调用) -->
          <template v-else>
            <el-avatar :size="30" class="ai-avatar-sm">AI</el-avatar>
            <div class="bubble ai-bubble-wrap">
              <!-- 工具调用卡片 -->
              <div
                v-for="(tc, tIdx) in (msg.tool_calls || [])"
                :key="tIdx"
                class="tool-call-card"
              >
                <div class="tool-call-head">
                  <span class="tool-icon">🛠️</span>
                  <span class="tool-name">{{ tc.name }}</span>
                  <span v-if="tc.status === 'loading'" class="tool-spinner" />
                  <span v-else-if="tc.status === 'done'" class="tool-status ok">✓</span>
                  <span v-else-if="tc.status === 'error'" class="tool-status err">✗</span>
                </div>
                <div v-if="tc.status === 'done' && tc.result" class="tool-result">
                  {{ tc.result.length > 200 ? tc.result.slice(0, 200) + '...' : tc.result }}
                </div>
                <div v-if="tc.status === 'error'" class="tool-result err">{{ tc.result }}</div>
              </div>

              <!-- AI 自然语言回复 (Markdown 简单渲染) -->
              <div class="ai-text" v-html="renderMarkdown(msg.content)" />
              <span v-if="msg.status === 'loading'" class="typing-cursor" />
            </div>
          </template>
        </div>
      </div>

      <!-- 输入区 -->
      <div class="ai-input-area">
        <el-input
          v-model="inputText"
          type="textarea"
          :autosize="{ minRows: 1, maxRows: 4 }"
          placeholder="问点什么... 比如 可乐还有多少库存?"
          @keydown.enter.exact.prevent="handleSend"
          :disabled="loading"
        />
        <el-button
          type="primary"
          :icon="loading ? Loading : Promotion"
          :loading="loading"
          circle
          @click="handleSend"
        />
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { ChatDotRound, Refresh, Close, Loading, Promotion } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { chatStream } from '@/api/ai'

const drawerVisible = ref(false)
const unread = ref(0)
const messages = ref([])
const inputText = ref('')
const loading = ref(false)
const messagesRef = ref(null)

// 打开时清零未读
import { watch } from 'vue'
watch(drawerVisible, (v) => { if (v) unread.value = 0 })

function renderMarkdown(text) {
  if (!text) return ''
  // 简单渲染: **bold**, - 列表, \n 换行
  let s = text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
  return s
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

function resetChat() {
  messages.value = []
}

function sendQuick(text) {
  inputText.value = text
  handleSend()
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || loading.value) return
  inputText.value = ''
  loading.value = true

  // 历史只收集 user 和 assistant (不带 tool_call 增量中间状态)
  const history = []
  for (const m of messages.value) {
    if (m.role === 'user') history.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant' && !m.status) history.push({ role: 'assistant', content: m.content })
  }

  // 1) 先把用户消息加到 UI
  messages.value.push({ role: 'user', content: text })
  // 2) 加一个 loading 的 AI 气泡
  const aiMsg = {
    role: 'assistant',
    content: '',
    status: 'loading',
    tool_calls: [],
  }
  messages.value.push(aiMsg)
  scrollToBottom()

  try {
    await chatStream(text, history, (evt) => {
      switch (evt.type) {
        case 'delta': {
          aiMsg.content += evt.content || ''
          break
        }
        case 'tool_call': {
          for (const tc of evt.calls || []) {
            aiMsg.tool_calls.push({
              name: tc.name,
              args: tc.args,
              status: 'loading',
              result: '',
            })
          }
          break
        }
        case 'tool_result': {
          const target = aiMsg.tool_calls.find((t) => t.name === evt.name && t.status === 'loading')
          if (target) {
            target.status = evt.error ? 'error' : 'done'
            target.result = evt.content || ''
          }
          break
        }
        case 'done': {
          aiMsg.status = ''
          break
        }
        case 'error': {
          aiMsg.status = 'error'
          aiMsg.content += `\n\n⚠️ 出错了: ${evt.message}`
          break
        }
      }
      scrollToBottom()
    })
  } catch (err) {
    aiMsg.status = ''
    aiMsg.content = (aiMsg.content || '') + `\n\n⚠️ 网络错误: ${err.message}`
  } finally {
    loading.value = false
    if (!drawerVisible.value) unread.value++
    scrollToBottom()
  }
}
</script>

<style scoped>
/* ========== 悬浮按钮 ========== */
.ai-fab {
  position: fixed;
  right: 24px;
  bottom: 32px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: linear-gradient(135deg, #409eff, #7c3aed);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(64, 158, 255, 0.45);
  z-index: 2000;
  transition: transform 0.2s;
}
.ai-fab:hover { transform: scale(1.08); }
.fab-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 18px;
  height: 18px;
  border-radius: 9px;
  background: #f56c6c;
  font-size: 12px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

/* ========== 抽屉面板 ========== */
.ai-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fafbfc;
}
.ai-header {
  padding: 16px 20px;
  background: linear-gradient(135deg, #409eff, #7c3aed);
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ai-header-left { display: flex; align-items: center; gap: 12px; }
.ai-title { font-size: 15px; font-weight: 600; }
.ai-subtitle { font-size: 12px; opacity: 0.8; margin-top: 2px; }
.ai-header-right :deep(.el-button) { color: #fff; }
.ai-avatar, .ai-avatar-sm, .user-avatar, .ai-avatar-big {
  background: linear-gradient(135deg, #409eff, #7c3aed);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}
.user-avatar {
  background: #409eff;
}
.ai-avatar-big {
  width: 56px;
  height: 56px;
  font-size: 18px;
}

/* ========== 欢迎 ========== */
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.ai-welcome {
  text-align: center;
  padding: 40px 20px;
  color: #606266;
}
.welcome-title { font-size: 16px; font-weight: 600; margin-top: 12px; }
.welcome-sub { font-size: 13px; color: #909399; margin-top: 6px; }
.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  margin-top: 16px;
}

/* ========== 消息气泡 ========== */
.msg-wrap { display: flex; gap: 8px; margin-bottom: 16px; align-items: flex-start; }
.msg-wrap.user { flex-direction: row-reverse; }
.system-msg {
  background: #fff7e6;
  border: 1px solid #ffd591;
  color: #d46b08;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  text-align: center;
  margin: 8px 0;
}

.bubble {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}
.user-bubble {
  background: #409eff;
  color: #fff;
  border-top-right-radius: 4px;
}
.ai-bubble-wrap {
  background: #fff;
  border: 1px solid #ebeef5;
  border-top-left-radius: 4px;
  padding: 12px 14px;
  width: 80%;
}
.ai-text { color: #303133; }
.ai-text code {
  background: #f5f7fa;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 13px;
  color: #d63384;
}
.typing-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: #409eff;
  margin-left: 2px;
  animation: blink 1s infinite;
}
@keyframes blink { 50% { opacity: 0; } }

/* ========== 工具调用卡片 ========== */
.tool-call-card {
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  font-size: 13px;
}
.tool-call-head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #606266;
  font-weight: 500;
}
.tool-icon { font-size: 14px; }
.tool-name { font-family: monospace; }
.tool-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #409eff33;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-left: auto;
}
@keyframes spin { to { transform: rotate(360deg); } }
.tool-status { margin-left: auto; font-size: 12px; }
.tool-status.ok { color: #67c23a; }
.tool-status.err { color: #f56c6c; }
.tool-result {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px dashed #dcdfe6;
  color: #606266;
  font-size: 12px;
  font-family: monospace;
  white-space: pre-wrap;
  max-height: 140px;
  overflow: auto;
}
.tool-result.err { color: #f56c6c; }

/* ========== 输入区 ========== */
.ai-input-area {
  border-top: 1px solid #ebeef5;
  padding: 12px 16px;
  background: #fff;
  display: flex;
  gap: 8px;
  align-items: flex-end;
}
.ai-input-area :deep(.el-textarea__inner) {
  border-radius: 10px;
  padding: 8px 14px;
  resize: none;
}

/* ========== 滚动条 ========== */
.ai-messages::-webkit-scrollbar { width: 5px; }
.ai-messages::-webkit-scrollbar-thumb {
  background: #dcdfe6;
  border-radius: 3px;
}
</style>
