import request from './request'

// 门店商业导师 - 非流式对话
export function mentorChat(data) {
  return request({ url: '/mentor/chat', method: 'post', data })
}

// 门店商业导师 - 流式对话(返回EventSource用URL)
export function mentorChatStreamUrl() {
  return '/mentor/chatStream'
}

