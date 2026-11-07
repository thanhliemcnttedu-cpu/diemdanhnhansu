/**
 * 🤖 Dò khuôn mặt trong ẢNH TẬP THỂ LỚP (chạy hoàn toàn trên trình duyệt).
 *
 * - Dùng MediaPipe Tasks Vision FaceDetector, tải từ CDN khi giáo viên bấm "Tự dò khuôn mặt"
 *   (không làm nặng gói phần mềm, không gửi ảnh đi đâu).
 * - Ảnh tập thể có khuôn mặt nhỏ → dò theo từng MẢNH ẢNH chồng lấn được phóng to, rồi gộp kết quả.
 * - Trả về các khung "đầu & vai" (đã nới rộng từ khung mặt) theo thứ tự hàng: trên → dưới, trái → phải.
 */

export interface DetectedFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

const TASKS_VERSION = '0.10.14';
const TASKS_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VERSION}`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let detectorPromise: Promise<any> | null = null;

async function getDetector(): Promise<any> {
  if (!detectorPromise) {
    detectorPromise = (async () => {
      const vision: any = await import(/* @vite-ignore */ `${TASKS_BASE}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${TASKS_BASE}/wasm`);
      return vision.FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        minDetectionConfidence: 0.45,
        minSuppressionThreshold: 0.3
      });
    })().catch(err => {
      detectorPromise = null; // allow retry later (e.g. when back online)
      throw err;
    });
  }
  return detectorPromise;
}

const iou = (a: DetectedFaceBox, b: DetectedFaceBox) => {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
};

/** Gộp khung trùng (nhiều mảnh ảnh cùng thấy 1 khuôn mặt) */
function mergeBoxes(boxes: DetectedFaceBox[]): DetectedFaceBox[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const kept: DetectedFaceBox[] = [];
  for (const b of sorted) {
    const overlap = kept.some(k => {
      if (iou(k, b) > 0.3) return true;
      // same face seen at another scale/tile: centres close together
      const dx = b.x + b.width / 2 - (k.x + k.width / 2);
      const dy = b.y + b.height / 2 - (k.y + k.height / 2);
      return Math.hypot(dx, dy) < Math.max(k.width, b.width) * 0.6;
    });
    if (!overlap) kept.push(b);
  }
  return kept;
}

/** Sắp theo hàng ảnh (trên → dưới), trong mỗi hàng trái → phải */
function sortReadingOrder(boxes: DetectedFaceBox[]): DetectedFaceBox[] {
  if (boxes.length === 0) return boxes;
  const heights = boxes.map(b => b.height).sort((a, b) => a - b);
  const rowTol = heights[Math.floor(heights.length / 2)] * 0.6;
  const byY = [...boxes].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const rows: DetectedFaceBox[][] = [];
  for (const b of byY) {
    const cy = b.y + b.height / 2;
    const row = rows.find(r => Math.abs(r[0].y + r[0].height / 2 - cy) <= rowTol);
    if (row) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap(r => r.sort((a, b) => a.x - b.x));
}

/** Nới khung mặt thành khung vuông "đầu & vai" (lấy cả tóc), giữ trong ảnh */
function toHeadBox(b: DetectedFaceBox, imgW: number, imgH: number): DetectedFaceBox {
  const side = Math.max(b.width, b.height) * 1.55;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2 - b.height * 0.08; // a bit up to include hair
  let x = cx - side / 2;
  let y = cy - side / 2;
  x = Math.max(0, Math.min(x, imgW - side));
  y = Math.max(0, Math.min(y, imgH - side));
  const s = Math.min(side, imgW, imgH);
  return { x, y, width: s, height: s, score: b.score };
}

/**
 * Dò tất cả khuôn mặt trong ảnh. onProgress(0..1) để hiện tiến trình.
 * Ném lỗi nếu không tải được bộ dò (mất mạng) — giáo viên vẫn khoanh tay được như cũ.
 */
export async function detectFacesInGroupPhoto(
  img: HTMLImageElement,
  onProgress?: (p: number) => void
): Promise<DetectedFaceBox[]> {
  const detector = await getDetector();
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return [];

  // Bộ dò BlazeFace thu ảnh về 128px → khuôn mặt phải chiếm ≥ ~1/4 mảnh mới dò được.
  // Vì vậy dò theo "kim tự tháp" mảnh VUÔNG nhiều cỡ (1/1 … 1/5 cạnh ngắn), chồng lấn 50%.
  const minSide = Math.min(W, H);
  const tiles: Array<{ x: number; y: number; s: number }> = [];
  for (let k = 1; k <= 5; k++) {
    const side = minSide / k;
    if (side < 96) break;
    const stride = side / 2;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = 0; x + side <= W + 0.5; x += stride) xs.push(x);
    for (let y = 0; y + side <= H + 0.5; y += stride) ys.push(y);
    if (xs[xs.length - 1] + side < W - 1) xs.push(W - side);
    if (ys[ys.length - 1] + side < H - 1) ys.push(H - side);
    for (const y of ys) for (const x of xs) tiles.push({ x, y, s: side });
  }

  const canvas = document.createElement('canvas');
  const TILE_PX = 192;
  canvas.width = TILE_PX;
  canvas.height = TILE_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];
  const found: DetectedFaceBox[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const scale = TILE_PX / t.s;
    ctx.clearRect(0, 0, TILE_PX, TILE_PX);
    ctx.drawImage(img, t.x, t.y, t.s, t.s, 0, 0, TILE_PX, TILE_PX);
    const result = detector.detect(canvas);
    for (const d of result?.detections || []) {
      const bb = d.boundingBox;
      if (!bb) continue;
      // Bỏ khuôn mặt bị mảnh cắt ngang (chạm mép mảnh nhưng không phải mép ảnh) — mảnh khác sẽ thấy trọn
      const m = TILE_PX * 0.02;
      const cut =
        (bb.originX < m && t.x > 0.5) ||
        (bb.originY < m && t.y > 0.5) ||
        (bb.originX + bb.width > TILE_PX - m && t.x + t.s < W - 0.5) ||
        (bb.originY + bb.height > TILE_PX - m && t.y + t.s < H - 0.5);
      if (cut) continue;
      const box: DetectedFaceBox = {
        x: t.x + bb.originX / scale,
        y: t.y + bb.originY / scale,
        width: bb.width / scale,
        height: bb.height / scale,
        score: d.categories?.[0]?.score ?? 0.5
      };
      if (box.width >= 10 && box.height >= 10) found.push(box);
    }
    if (i % 8 === 7 || i === tiles.length - 1) {
      onProgress?.((i + 1) / tiles.length);
      await new Promise(r => setTimeout(r, 0)); // yield to the UI
    }
  }

  let merged = mergeBoxes(found);
  // Loại nhận nhầm (nền, áo, tóc): giữ khung có điểm ≥ max(0.6, TB 3 mặt rõ nhất − 0.2)
  if (merged.length >= 3) {
    const top = merged.map(b => b.score).sort((p, q) => q - p).slice(0, 3);
    const ref = top.reduce((a, b) => a + b, 0) / top.length;
    const minScore = Math.max(0.6, ref - 0.2);
    merged = merged.filter(b => b.score >= minScore);
  }
  // Ảnh tập thể: khuôn mặt cỡ gần như nhau → loại khung quá nhỏ/quá to so với trung vị (nhận nhầm)
  if (merged.length >= 5) {
    const sizes = merged.map(b => b.width).sort((p, q) => p - q);
    const med = sizes[Math.floor(sizes.length / 2)];
    merged = merged.filter(b => b.width >= med * 0.45 && b.width <= med * 2.5);
  }

  return sortReadingOrder(merged).map(b => toHeadBox(b, W, H));
}
