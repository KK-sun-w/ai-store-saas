// 短视频营销Agent API
// 对接后端 /video-task 路由(生成/查询) 和 /digital-human 路由(数字人CRUD)
import request from './request'

const BASE = ''

/**
 * 提交视频生成任务
 * @param {object} data { user_input, reference_url, avatar_desc, template, duration, digital_human_id, provider }
 */
export function createVideoTask(data) {
  return request({ url: BASE + '/video-task/task', method: 'post', data })
}

/**
 * 查询视频任务状态
 */
export function getVideoTask(taskId) {
  return request({ url: BASE + `/video-task/task/${taskId}`, method: 'get' })
}

/**
 * 获取模板列表
 */
export function listVideoTemplates() {
  return request({ url: BASE + '/video-task/templates', method: 'get' })
}

// ============ 数字人形象管理 ============

/**
 * 列出当前租户的数字人形象
 */
export function listDigitalHumans() {
  return request({ url: BASE + '/digital-human', method: 'get' })
}

/**
 * 新建数字人形象(上传人像图片)
 * @param {FormData} formData 含 image(file) + name + description
 */
export function createDigitalHuman(formData) {
  return request({
    url: BASE + '/digital-human', method: 'post', data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/**
 * 删除数字人形象(软删)
 */
export function deleteDigitalHuman(id) {
  return request({ url: BASE + `/digital-human/${id}`, method: 'delete' })
}

// ============ 兼容旧调用名 ============
export function runVideoAgent(data) {
  return createVideoTask(data)
}
