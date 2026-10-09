// AI Agent API - SSE 流式客户端
/**
 * 流式对话 (SSE)
 * @param {string} message  用户输入
 * @param {Array}  history  [{role, content}] 对话历史
 * @param {(event: {type, ...}) => void} onEvent  每收到一个 SSE 事件回调
 * @returns {Promise<void>}  结束后 resolve
 */
export async function chatStream(message, history = [], onEvent) {
  const token = localStorage.getItem('token') || ''
  const resp = await fetch('/api/ai/agent/chatStream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ message, history }),
  })

  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // SSE: 用 \n\n 分隔事件, 每个事件里可能有多行 data:
    const events = buffer.split('\n\n')
    buffer = events.pop() || ''

    for (const raw of events) {
      const lines = raw.split('\n')
      let dataStr = ''
      for (const line of lines) {
        if (line.startsWith('data: ')) dataStr += line.slice(6)
        else if (line.startsWith('data:')) dataStr += line.slice(5)
      }
      if (!dataStr || dataStr === '[DONE]') continue
      try {
        const evt = JSON.parse(dataStr)
        onEvent(evt)
        if (evt.type === 'done' || evt.type === 'error') return
      } catch {
        // 非 JSON, 跳过
      }
    }
  }
}
