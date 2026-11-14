/**
 * Smoke test of the packaged desktop shell (run after `npm run package:win:lite`, also on GitHub Actions
 * BEFORE the installer is published):
 *   node scripts/smoke-test-desktop-lite.mjs [path to LopHocHanhPhuc.exe]
 *
 * Starts the packaged exe with a throw-away profile, connects through the DevTools protocol and checks that
 *  - the process stays alive and the window loads the UI from app://lhhp/
 *  - the UI and the shell both report the version in package.json
 *  - the offline-folder bridge is there
 * A packaged exe that cannot start (e.g. corrupted while its resources were edited) makes this exit 1,
 * so a broken installer is never released.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const exe = path.resolve(process.argv[2] || path.join(root, 'release-lite', 'win-unpacked', 'LopHocHanhPhuc.exe'));
const expected = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lhhp-smoke-'));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

if (!fs.existsSync(exe)) { console.error(`⛔ Không thấy ${exe}`); process.exit(1); }
console.log(`▶ Chạy thử ${path.relative(root, exe)} (cần bản ${expected})…`);

// LHHP_USER_DATA_DIR moves the app's own data folder (see desktop-lite/main.cjs); --user-data-dir alone only
// moves the browser storage, and the test would then read / write the real installation's settings on this PC.
const child = spawn(exe, [`--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
  stdio: 'ignore',
  env: { ...process.env, LHHP_USER_DATA_DIR: profile },
});
let exitCode = null;
child.on('exit', (code) => { exitCode = code; });

const finish = (failures) => {
  try { child.kill(); } catch { /* already gone */ }
  setTimeout(() => {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* files still locked: temp dir, harmless */ }
    if (failures.length) { failures.forEach(f => console.error(`⛔ ${f}`)); process.exit(1); }
    console.log('✅ Bản đóng gói chạy được: mở giao diện, đúng phiên bản, có cầu nối thư mục ngoại tuyến.');
    process.exit(0);
  }, 1500);
};

let target = null;
for (let i = 0; i < 80 && !target && exitCode === null; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    target = list.find(t => t.type === 'page' && String(t.url).startsWith('app://'));
  } catch { /* not listening yet */ }
}
if (exitCode !== null) {
  const hex = exitCode < 0 || exitCode > 0xFFFF ? ` (0x${(exitCode >>> 0).toString(16).toUpperCase()})` : '';
  finish([`Tệp exe thoát ngay khi khởi động, mã ${exitCode}${hex} — bản đóng gói bị hỏng.`]);
} else if (!target) {
  finish(['Sau 40 giây vẫn không thấy cửa sổ giao diện (app://).']);
} else {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const waiting = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } };
  const evaluate = (expression) => new Promise((resolve) => {
    const id = ++seq;
    waiting.set(id, (m) => resolve(m.result?.result?.value));
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });

  // The UI needs a moment to mount before the bridge objects can be asked
  let state = null;
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    state = await evaluate(`(async () => {
      const d = window.lhhpDesktop;
      if (!d || !document.getElementById('root') || !document.getElementById('root').children.length) return null;
      const info = d.update ? await d.update.getInfo() : null;
      const folder = d.offline ? await d.offline.info() : null;
      return { url: location.href, ui: info && info.uiVersion, shell: info && info.shellVersion, hasOffline: !!d.offline, suggested: folder && folder.suggested };
    })()`);
    if (state) break;
  }
  ws.close();

  const failures = [];
  if (!state) failures.push('Giao diện không dựng được trong cửa sổ (trang trắng).');
  else {
    console.log(`  giao diện ${state.ui} • vỏ ${state.shell} • ${state.url}`);
    if (!String(state.url).startsWith('app://lhhp/')) failures.push(`Địa chỉ giao diện lạ: ${state.url}`);
    if (state.ui !== expected) failures.push(`Giao diện đóng gói là bản ${state.ui}, cần ${expected}.`);
    if (state.shell !== expected) failures.push(`Vỏ đóng gói là bản ${state.shell}, cần ${expected}.`);
    if (!state.hasOffline || !state.suggested) failures.push('Thiếu cầu nối thư mục ngoại tuyến (window.lhhpDesktop.offline).');
  }
  finish(failures);
}
