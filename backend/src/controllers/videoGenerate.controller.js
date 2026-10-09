// AI 短视频成片生成 Controller
const asyncHandler = require('../utils/asyncHandler');
const { ok, fail } = require('../utils/response');
const videoSvc = require('../services/videoGenerate.service');

// 提交视频生成任务
// body 新增 digital_human_id / provider(jimeng 模式需要数字人ID)
exports.createTask = asyncHandler(async (req, res) => {
  const { user_input, reference_url, avatar_desc, template, duration, digital_human_id, provider } = req.body;
  if (!user_input) return fail(res, '请填写视频需求描述');
  // jimeng 模式必须传数字人ID
  if (provider === 'jimeng' && !digital_human_id) {
    return fail(res, '即梦模式需要选择数字人形象');
  }
  const tenantId = req.user?.tenantId || 1;
  const { taskId } = await videoSvc.startAsync({
    tenantId, userInput: user_input, referenceUrl: reference_url,
    avatarDesc: avatar_desc, template, duration,
    digitalHumanId: digital_human_id, provider,
  });
  return ok(res, { task_id: taskId }, '任务已提交');
});

// 查询任务状态
exports.getTask = asyncHandler(async (req, res) => {
  const { task_id } = req.params;
  const tenantId = req.user?.tenantId || 1;
  const task = await videoSvc.getTask(task_id, tenantId);
  if (!task) return fail(res, '任务不存在', 404);
  return ok(res, task);
});

// 模板列表
exports.listTemplates = asyncHandler(async (req, res) => {
  return ok(res, Object.entries(videoSvc.TEMPLATES).map(([key, v]) => ({
    key, name: v.name, style: v.style
  })));
});
