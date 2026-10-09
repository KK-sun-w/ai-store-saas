// Windows SAPI 文字转语音 - 返回音频 Buffer（不落盘，避免沙盒限制）
const { spawn } = require('child_process');

function synthesize(text, opts = {}) {
  const voice = opts.voice || 'Microsoft Huihui Desktop';
  const rate = opts.rate ?? 0;
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    '  Add-Type -AssemblyName System.Speech',
    '  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    "  $s.SelectVoice('" + voice + "')",
    '  $s.Rate = ' + rate,
    '  $ms = New-Object System.IO.MemoryStream',
    '  $s.SetOutputToWaveStream($ms)',
    '  $s.Speak([Console]::In.ReadToEnd())',
    '  $s.Dispose()',
    '  $bytes = $ms.ToArray()',
    '  $ms.Dispose()',
    '  [Console]::Out.Write([Convert]::ToBase64String($bytes))',
    '} catch {',
    '  [Console]::Error.WriteLine($_.Exception.Message)',
    '  exit 1',
    '}',
  ].join('\n');
  return new Promise((resolve, reject) => {
    const proc = spawn('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', d => out += d.toString());
    proc.stderr.on('data', d => err += d.toString());
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error('TTS fail: ' + err.slice(-300)));
      try {
        const buf = Buffer.from(out.trim(), 'base64');
        resolve(buf);
      } catch (e) {
        reject(new Error('TTS decode fail: ' + e.message));
      }
    });
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

module.exports = { synthesize };