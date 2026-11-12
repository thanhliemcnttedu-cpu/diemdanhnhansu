/**
 * HOT UPDATE OF THE UI (layer 1) for the lite desktop build.
 *
 * The installer ships a copy of the built web UI (dist/). This module can replace it WITHOUT reinstalling:
 *   1. read a small manifest from the update channel (ui-manifest.json)
 *   2. download the UI package (ui-<version>.zip), check size + SHA-256 + Ed25519 signature
 *   3. unpack it under <userData>/ui-updates/<version>/ and make it the active UI
 *   4. if the new UI fails to start twice, fall back to the previous / bundled UI and never retry that version
 *
 * No dependency on Electron or node_modules (the lite app ships without node_modules): only Node built-ins.
 * User data (localStorage / IndexedDB) is never touched: the page origin stays app://lhhp.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const MAX_PACKAGE_BYTES = 80 * 1024 * 1024;
const MAX_FAILED_STARTS = 2;

/** -1 / 0 / 1 for dotted numeric versions ("1.2.10" > "1.2.9") */
function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

const isVersion = (v) => typeof v === 'string' && /^\d+(\.\d+){1,3}$/.test(v);

/** The exact text that is signed: any change of version / file content / minimum shell breaks the signature */
function signedText(m) {
  return ['lhhp-ui-update-v1', m.version, m.sha256, String(m.size), m.minShell || ''].join('\n');
}

function verifySignature(manifest, publicKeyPem) {
  try {
    const key = crypto.createPublicKey(publicKeyPem);
    return crypto.verify(null, Buffer.from(signedText(manifest), 'utf8'), key, Buffer.from(String(manifest.signature || ''), 'base64'));
  } catch (_) {
    return false;
  }
}

/** Minimal ZIP reader (stored + deflate, no zip64, no encryption) for packages produced by our own release script */
function unzipTo(buffer, destDir) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('BAD_ZIP');
  const count = buffer.readUInt16LE(eocd + 10);
  let p = buffer.readUInt32LE(eocd + 16);
  const root = path.resolve(destDir);
  let files = 0;
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('BAD_ZIP');
    const flags = buffer.readUInt16LE(p + 8);
    const method = buffer.readUInt16LE(p + 10);
    const compSize = buffer.readUInt32LE(p + 20);
    const rawSize = buffer.readUInt32LE(p + 24);
    const nameLen = buffer.readUInt16LE(p + 28);
    const extraLen = buffer.readUInt16LE(p + 30);
    const commentLen = buffer.readUInt16LE(p + 32);
    const localOffset = buffer.readUInt32LE(p + 42);
    const name = buffer.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (flags & 1) throw new Error('BAD_ZIP');
    const target = path.resolve(root, name);
    if (target !== root && !target.startsWith(root + path.sep)) throw new Error('BAD_ZIP_PATH');
    if (name.endsWith('/')) { fs.mkdirSync(target, { recursive: true }); continue; }
    if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('BAD_ZIP');
    const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    const comp = buffer.subarray(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = comp;
    else if (method === 8) data = zlib.inflateRawSync(comp);
    else throw new Error('BAD_ZIP');
    if (data.length !== rawSize) throw new Error('BAD_ZIP');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, data);
    files++;
  }
  return files;
}

/**
 * @param {object} o
 * @param {string} o.userDataDir   Electron app.getPath('userData')
 * @param {string} o.bundledDir    dist/ shipped inside the installer
 * @param {string} o.shellVersion  version of the installed shell (app.getVersion())
 * @param {string} o.manifestUrl   update channel; empty = updates off
 * @param {string} o.publicKeyPem  Ed25519 public key; empty = updates off (never install unsigned code)
 * @param {Function} o.fetch       fetch implementation (Electron net.fetch)
 * @param {Function} [o.onState]   called with every state change
 */
function createUpdater(o) {
  const baseDir = path.join(o.userDataDir, 'ui-updates');
  const stateFile = path.join(baseDir, 'state.json');
  const enabled = Boolean(o.manifestUrl && o.publicKeyPem);
  let busy = false;
  let status = { phase: 'idle', message: '' };

  const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } };
  const bundledVersion = (() => {
    const v = readJson(path.join(o.bundledDir, 'ui-version.json'));
    return isVersion(v && v.version) ? v.version : o.shellVersion;
  })();

  const loadState = () => {
    const s = readJson(stateFile) || {};
    return { active: s.active || null, previous: s.previous || null, bad: Array.isArray(s.bad) ? s.bad : [], lastCheck: s.lastCheck || '' };
  };
  const saveState = (s) => {
    fs.mkdirSync(baseDir, { recursive: true });
    const tmp = stateFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
    fs.renameSync(tmp, stateFile);
  };
  const dirOf = (version) => path.join(baseDir, version);
  const usable = (entry) => Boolean(entry && isVersion(entry.version)
    && compareVersions(entry.version, bundledVersion) > 0
    && fs.existsSync(path.join(dirOf(entry.version), 'index.html')));

  const emit = (patch) => {
    status = { ...status, ...patch };
    if (o.onState) { try { o.onState(info()); } catch (_) { /* ignore */ } }
  };

  /** Folder the UI is served from right now */
  function activeDir() {
    const s = loadState();
    return usable(s.active) ? dirOf(s.active.version) : o.bundledDir;
  }
  function activeVersion() {
    const s = loadState();
    return usable(s.active) ? s.active.version : bundledVersion;
  }

  /**
   * Call once at start-up, before the window loads. Counts a start of a not-yet-confirmed update; after
   * MAX_FAILED_STARTS starts without confirmation the update is dropped and blacklisted.
   */
  function beginStart() {
    const s = loadState();
    if (s.active && !usable(s.active)) { s.active = null; saveState(s); return; }
    if (!s.active || s.active.confirmed) return;
    s.active.starts = (s.active.starts || 0) + 1;
    if (s.active.starts > MAX_FAILED_STARTS) rollbackState(s);
    else saveState(s);
  }

  function rollbackState(s) {
    if (s.active && !s.bad.includes(s.active.version)) s.bad.push(s.active.version);
    s.active = usable(s.previous) ? { ...s.previous, confirmed: true } : null;
    s.previous = null;
    saveState(s);
  }

  /** The UI reported that it started correctly */
  function confirmStarted() {
    const s = loadState();
    if (s.active && !s.active.confirmed) {
      s.active.confirmed = true; s.active.starts = 0;
      saveState(s);
      cleanup();
    }
  }

  /** The UI failed to load: go back at once. Returns true when the served folder changed. */
  function reportLoadFailure() {
    const s = loadState();
    if (!s.active || s.active.confirmed) return false;
    rollbackState(s);
    emit({ phase: 'rolled-back', message: 'Bản cập nhật không khởi động được nên phần mềm đã quay về bản trước.' });
    return true;
  }

  /** Remove unpacked versions that are neither active nor the fallback */
  function cleanup() {
    const s = loadState();
    const keep = new Set([s.active && s.active.version, s.previous && s.previous.version].filter(Boolean));
    let names = [];
    try { names = fs.readdirSync(baseDir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of names) {
      if (e.isDirectory() && !keep.has(e.name)) {
        try { fs.rmSync(path.join(baseDir, e.name), { recursive: true, force: true }); } catch (_) { /* in use: next time */ }
      }
    }
  }

  function info() {
    const s = loadState();
    return {
      enabled, shellVersion: o.shellVersion, bundledVersion, uiVersion: activeVersion(),
      lastCheck: s.lastCheck, ...status,
    };
  }

  async function fetchBuffer(url, maxBytes, onProgress) {
    const res = await o.fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP_${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (total > maxBytes) throw new Error('TOO_LARGE');
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (got > maxBytes) { try { await reader.cancel(); } catch (_) { /* ignore */ } throw new Error('TOO_LARGE'); }
      chunks.push(Buffer.from(value));
      if (onProgress) onProgress(got, total);
    }
    return Buffer.concat(chunks);
  }

  /**
   * Look for a newer UI and install it. Resolves with the final info; never throws.
   * phase: 'up-to-date' | 'ready' (restart the window to use it) | 'need-installer' | 'error' | 'off'
   */
  async function checkAndInstall() {
    if (!enabled) { emit({ phase: 'off', message: 'Bản cài đặt này chưa được cấu hình kênh cập nhật.' }); return info(); }
    if (busy) return info();
    busy = true;
    try {
      emit({ phase: 'checking', message: 'Đang kiểm tra bản cập nhật…', newVersion: '', progress: 0 });
      let manifest;
      try {
        manifest = JSON.parse((await fetchBuffer(o.manifestUrl, 256 * 1024)).toString('utf8'));
      } catch (e) {
        emit({ phase: 'error', message: 'Không kết nối được kênh cập nhật. Phần mềm vẫn chạy bình thường với bản đang có.' });
        return info();
      }
      const s0 = loadState();
      s0.lastCheck = new Date().toISOString();
      saveState(s0);

      if (!manifest || !isVersion(manifest.version) || !/^[0-9a-f]{64}$/.test(String(manifest.sha256 || ''))
        || !Number.isInteger(manifest.size) || manifest.size <= 0 || manifest.size > MAX_PACKAGE_BYTES
        || typeof manifest.file !== 'string' || !/^[\w.\-]+\.zip$/.test(manifest.file)) {
        emit({ phase: 'error', message: 'Thông tin bản cập nhật không hợp lệ nên đã bỏ qua.' });
        return info();
      }
      // Signature first: nothing from an unsigned manifest is trusted, not even the "need a new installer" notice
      if (!verifySignature(manifest, o.publicKeyPem)) {
        emit({ phase: 'error', message: 'Bản cập nhật không có chữ ký hợp lệ của tác giả nên đã bỏ qua.' });
        return info();
      }
      if (compareVersions(manifest.version, activeVersion()) <= 0) {
        emit({ phase: 'up-to-date', message: `Phần mềm đang ở bản mới nhất (${activeVersion()}).` });
        return info();
      }
      if (loadState().bad.includes(manifest.version)) {
        emit({ phase: 'up-to-date', message: `Bản ${manifest.version} từng không khởi động được trên máy này nên được bỏ qua. Đang dùng bản ${activeVersion()}.` });
        return info();
      }
      if (manifest.minShell && compareVersions(o.shellVersion, manifest.minShell) < 0) {
        emit({ phase: 'need-installer', newVersion: manifest.version, message: `Bản ${manifest.version} cần bộ cài đặt mới (từ ${manifest.minShell}). Hãy tải bộ cài mới và cài đè, dữ liệu được giữ nguyên.` });
        return info();
      }

      emit({ phase: 'downloading', newVersion: manifest.version, progress: 0, message: `Đang tải bản ${manifest.version}…` });
      let zip;
      try {
        const zipUrl = new URL(manifest.file, o.manifestUrl).toString();
        zip = await fetchBuffer(zipUrl, manifest.size, (got) => emit({ progress: Math.min(99, Math.round(got * 100 / manifest.size)) }));
      } catch (e) {
        emit({ phase: 'error', message: 'Tải bản cập nhật bị gián đoạn. Phần mềm sẽ thử lại ở lần mở sau.' });
        return info();
      }
      if (zip.length !== manifest.size || crypto.createHash('sha256').update(zip).digest('hex') !== manifest.sha256) {
        emit({ phase: 'error', message: 'Tệp cập nhật tải về không khớp mã kiểm tra nên đã bỏ qua.' });
        return info();
      }

      const finalDir = dirOf(manifest.version);
      const tmpDir = finalDir + '.tmp';
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        fs.rmSync(finalDir, { recursive: true, force: true });
        fs.mkdirSync(tmpDir, { recursive: true });
        unzipTo(zip, tmpDir);
        const inner = readJson(path.join(tmpDir, 'ui-version.json'));
        if (!fs.existsSync(path.join(tmpDir, 'index.html')) || !inner || inner.version !== manifest.version) throw new Error('BAD_PACKAGE');
        fs.renameSync(tmpDir, finalDir);
      } catch (e) {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* ignore */ }
        emit({ phase: 'error', message: 'Không giải nén được bản cập nhật (ổ đĩa đầy hoặc tệp hỏng). Phần mềm vẫn dùng bản đang có.' });
        return info();
      }

      const s = loadState();
      const current = usable(s.active) ? s.active : null;
      s.previous = current && current.confirmed ? { version: current.version } : (usable(s.previous) ? s.previous : null);
      s.active = { version: manifest.version, confirmed: false, starts: 0, installedAt: new Date().toISOString() };
      saveState(s);
      // status is set before info() reads the new active version
      emit({ phase: 'ready', progress: 100, newVersion: manifest.version, notes: String(manifest.notes || '').slice(0, 600), message: `Đã tải xong bản ${manifest.version}.` });
      return info();
    } finally {
      busy = false;
    }
  }

  return { enabled, activeDir, activeVersion, beginStart, confirmStarted, reportLoadFailure, checkAndInstall, info, cleanup };
}

module.exports = { createUpdater, compareVersions, signedText, verifySignature, unzipTo };
