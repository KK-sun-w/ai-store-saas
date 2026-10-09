const express = require("express");
const router = express.Router();
const { callLlm } = require("../../utils/llm");
const { auth } = require("../middlewares/auth");
const requirePerm = require("../middlewares/requirePerm");
const checkTokenQuota = require("../middlewares/checkTokenQuota");
const adc = require("../controllers/agentDispatch.controller");
const validate = require("../middlewares/validate");

// 原有:短视频文案测试
router.post("/video-copy", async (req, res) => {
  try {
    const { user_input, style } = req.body;
    const result = await callLlm("请根据需求生成短视频文案:" + user_input + ", 风格:" + style);
    res.json({ code: 0, data: { content: result } });
  } catch (err) {
    res.json({ code: 500, msg: "调用失败" });
  }
});

// Supervisor 统一调度
router.post("/agent-dispatch", auth, requirePerm("ai:call"), checkTokenQuota, validate([{ field: "user_query", required: false, type: "string", max: 5000 }]), adc.dispatch);

// 5 个独立 Agent 直接调用
router.post("/agent/inventory",   auth, requirePerm("ai:call"), checkTokenQuota, validate([{ field: "input", required: false, type: "string", max: 5000 }]), adc.runInventory);
router.post("/agent/product",     auth, requirePerm("ai:call"), checkTokenQuota, validate([{ field: "input", required: false, type: "string", max: 5000 }]), adc.runProduct);
router.post("/agent/marketing",   auth, requirePerm("ai:call"), checkTokenQuota, validate([{ field: "input", required: false, type: "string", max: 5000 }]), adc.runMarketing);
router.post("/agent/sales",        auth, requirePerm("ai:call"), checkTokenQuota, validate([{ field: "input", required: false, type: "string", max: 5000 }]), adc.runSales);
router.post("/agent/procurement", auth, requirePerm("ai:call"), checkTokenQuota, validate([{ field: "input", required: false, type: "string", max: 5000 }]), adc.runProcurement);

module.exports = router;


