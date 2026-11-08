// Gỡ thành phần Chromium không dùng tới để bộ cài nhẹ hơn:
// dxcompiler.dll / dxil.dll chỉ phục vụ WebGPU (ứng dụng chỉ dùng Canvas/WebGL) — ~25 MB.
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  const dir = context.appOutDir;
  for (const f of ['dxcompiler.dll', 'dxil.dll']) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      fs.rmSync(p);
      console.log(`  • đã bỏ ${f}`);
    }
  }
};
