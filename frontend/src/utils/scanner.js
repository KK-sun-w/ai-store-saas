/**
 * 扫码工具 — 优先用原生 BarcodeDetector, iOS Safari < 17.4 回退 html5-qrcode
 * 用法: import { openScanner, closeScanner } from "@/utils/scanner"
 */
let _cleanup = null

export function closeScanner() {
  if (_cleanup) { _cleanup(); _cleanup = null }
}

export function openScanner({ onDetected }) {
  closeScanner()
  const useNative = "BarcodeDetector" in window
  const useQrcode = typeof window.Html5Qrcode !== "undefined"
  if (!useNative && !useQrcode) {
    alert("当前浏览器不支持扫码，请手动输入条码")
    return
  }

  const dlg = document.createElement("div")
  dlg.id = "__scan_dlg__"
  dlg.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;"
  dlg.innerHTML = '<div style="position:relative;width:min(90vw,400px);aspect-ratio:1;background:#000;border-radius:12px;overflow:hidden;"><div id="__scan_region__" style="width:100%;height:100%;"></div><div style="position:absolute;top:20%;left:15%;right:15%;bottom:20%;border:2px solid #409eff;border-radius:8px;pointer-events:none;"></div></div><div style="color:#fff;margin-top:16px;font-size:14px;">请将条码对准取景框中央</div><button onclick="window.__scan_close__()" style="margin-top:20px;padding:10px 36px;background:#409eff;color:#fff;border:none;border-radius:8px;font-size:15px;cursor:pointer;">关闭</button>'
  document.body.appendChild(dlg)
  window.__scan_close__ = () => closeScanner()
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeScanner() })

  if (useNative) {
    const video = document.createElement("video")
    video.autoplay = true; video.playsInline = true
    video.style.cssText = "width:100%;height:100%;object-fit:cover;"
    document.getElementById("__scan_region__").appendChild(video)
    let stream = null, found = false
    _cleanup = () => { if (stream) { stream.getTracks().forEach(t => t.stop()) }; dlg.remove(); window.__scan_close__ = null }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(s => {
        stream = s; video.srcObject = s
        const det = new BarcodeDetector({ formats: ["code_128","code_39","ean_13","ean_8","upc_a","upc_e","qr_code"] })
        const tick = async () => {
          if (found || !stream) return
          try {
            const codes = await det.detect(video)
            if (codes.length > 0) { found = true; closeScanner(); onDetected && onDetected(codes[0].rawValue) }
            else requestAnimationFrame(tick)
          } catch(e) { requestAnimationFrame(tick) }
        }
        requestAnimationFrame(tick)
      })
      .catch(err => { closeScanner(); alert("无法打开摄像头: " + err.message) })
    return
  }

  if (useQrcode) {
    let scanner = null
    _cleanup = () => { if (scanner) { scanner.stop().catch(() => {}).finally(() => { try { scanner.clear() } catch(e){} }) }; dlg.remove(); window.__scan_close__ = null }
    try {
      scanner = new window.Html5Qrcode("__scan_region__")
      const cfg = { fps: 10, qrbox: () => ({ width: Math.min(window.innerWidth * 0.55, 280), height: Math.min(window.innerWidth * 0.35, 120) }), aspectRatio: 1.5 }
      scanner.start({ facingMode: "environment" }, cfg,
        (decoded) => { closeScanner(); onDetected && onDetected(decoded) }, () => {})
        .catch(err => {
          if (String(err).includes("Constraint")) {
            window.Html5Qrcode.getCameras().then(cams => {
              if (cams && cams.length) {
                scanner.start(cams[cams.length-1].id, cfg, (d) => { closeScanner(); onDetected && onDetected(d) }, () => {})
                  .catch(() => { closeScanner(); alert("摄像头启动失败") })
              } else { closeScanner(); alert("未检测到摄像头") }
            })
          } else { closeScanner(); alert("无法启动扫码") }
        })
    } catch(err) { closeScanner(); alert("扫码组件加载失败") }
  }
}
