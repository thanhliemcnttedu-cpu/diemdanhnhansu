/**
 * 📦 THU GỌN DỮ LIỆU LỚP TRƯỚC KHI ĐẨY LÊN GOOGLE DRIVE (bước 1 tối ưu dung lượng, 11/2026)
 * Phần lớn dung lượng tệp gvcn_*.json là ẢNH nhúng (ảnh lớp tới 2048px lưu 2 lần, ảnh học sinh). Trên Drive:
 * - bỏ ảnh gốc `originalAvatar` (chỉ để cắt lại ảnh — máy giáo viên vẫn giữ; bước gộp dữ liệu giữ bản trên máy);
 * - nén lại ảnh JPEG quá lớn: ảnh lớp / ảnh khác ≤ 1280px, ảnh học sinh & giáo viên ≤ 360px, chất lượng ~80%;
 * - chỉ thay khi bản nén THỰC SỰ nhỏ hơn; ảnh PNG giữ nguyên (tránh mất nền trong suốt).
 * KHÔNG đổi dữ liệu trên máy (chỉ tạo bản sao để gửi). Có bộ nhớ đệm để không nén lại ảnh đã nén ở các lần lưu sau.
 */
const cache = new Map<string, string>();
const keyOf = (s: string, side: number) => `${side}|${s.length}|${s.slice(32, 96)}|${s.slice(-64)}`;
const isJpeg = (v: unknown): v is string => typeof v === 'string' && /^data:image\/(jpeg|jpg|webp);base64,/i.test(v);

// Ngưỡng (số ký tự base64 ≈ byte × 1.37)
const LIMIT_PORTRAIT = 45_000;   // ảnh học sinh / giáo viên > ~33 KB thì nén
const LIMIT_LARGE = 220_000;     // ảnh lớp / phần thưởng > ~160 KB thì nén

function shrinkDataUrl(dataUrl: string, maxSide: number, quality: number): Promise<string> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return Promise.resolve(dataUrl);
  const k = keyOf(dataUrl, maxSide);
  const hit = cache.get(k);
  if (hit) return Promise.resolve(hit);
  return new Promise(resolve => {
    const img = new Image();
    let done = false;
    const finish = (out: string) => { if (done) return; done = true; cache.set(k, out); resolve(out); };
    const timer = setTimeout(() => finish(dataUrl), 6000);
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) { clearTimeout(timer); finish(dataUrl); return; }
        const scale = Math.min(1, maxSide / Math.max(w, h));
        const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        const canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) { clearTimeout(timer); finish(dataUrl); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, 0, 0, cw, ch);
        const out = canvas.toDataURL('image/jpeg', quality);
        clearTimeout(timer);
        finish(out.length < dataUrl.length ? out : dataUrl);
      } catch (_) { clearTimeout(timer); finish(dataUrl); }
    };
    img.onerror = () => { clearTimeout(timer); finish(dataUrl); };
    img.src = dataUrl;
  });
}

const portrait = async (v: unknown) => (isJpeg(v) && v.length > LIMIT_PORTRAIT ? shrinkDataUrl(v, 360, 0.82) : v);
const large = async (v: unknown) => (isJpeg(v) && v.length > LIMIT_LARGE ? shrinkDataUrl(v, 1280, 0.8) : v);

/** Bản sao gọn của dữ liệu lớp (fullClassroomData) để gửi lên Drive. Lỗi bất kỳ → trả nguyên bản. */
export async function compactClassroomDataForDrive<T extends Record<string, any>>(full: T): Promise<T> {
  try {
    const out: any = { ...full };
    if (Array.isArray(full.classes)) {
      out.classes = await Promise.all(full.classes.map(async (c: any) => {
        if (!c || typeof c !== 'object') return c;
        const { originalAvatar: _o, ...rest } = c;
        rest.avatar = await large(rest.avatar);
        return rest;
      }));
    }
    if (Array.isArray(full.students)) {
      out.students = await Promise.all(full.students.map(async (s: any) => {
        if (!s || typeof s !== 'object') return s;
        const { originalAvatar: _o, ...rest } = s;
        rest.avatar = await portrait(rest.avatar);
        return rest;
      }));
    }
    if (Array.isArray(full.rewards)) {
      out.rewards = await Promise.all(full.rewards.map(async (r: any) => {
        if (!r || typeof r !== 'object') return r;
        const next = { ...r };
        for (const key of ['image', 'imageUrl', 'icon', 'avatar']) if (isJpeg(next[key])) next[key] = await large(next[key]);
        return next;
      }));
    }
    if (full.teacherProfile && typeof full.teacherProfile === 'object') {
      // Hồ sơ giáo viên: chỉ nén, không bỏ ảnh gốc (có nơi thay cả hồ sơ bằng bản trên Drive)
      const tp: any = { ...(full.teacherProfile as any) };
      tp.avatar = await portrait(tp.avatar);
      if (tp.originalAvatar) tp.originalAvatar = await large(tp.originalAvatar);
      out.teacherProfile = tp;
    }
    return out as T;
  } catch (_) {
    return full;
  }
}
