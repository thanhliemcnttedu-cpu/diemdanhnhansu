/** Xáo trộn Fisher–Yates (không đổi mảng gốc) */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Xáo trộn sao cho KHÔNG trùng thứ tự "dễ đoán" (`isBad` trả true thì xáo lại, tối đa 30 lần).
 * Mặc định: không giữ nguyên thứ tự ban đầu (khi có từ 2 phần tử).
 */
export function shuffleAvoid<T>(arr: T[], isBad: (out: T[]) => boolean = (out) => out.every((x, i) => x === arr[i])): T[] {
  if (arr.length < 2) return [...arr];
  let out = shuffle(arr);
  for (let k = 0; k < 30 && isBad(out); k++) out = shuffle(arr);
  return out;
}

/** Nối cột: thứ tự cột A và cột B đều xáo trộn, không để cặp đúng nằm thẳng hàng toàn bộ */
export function shuffleMatching(n: number): { left: number[]; right: number[] } {
  const idx = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return { left: idx, right: idx };
  const left = shuffle(idx);
  const right = shuffleAvoid(idx, (r) => r.some((x, k) => x === left[k]) && (n === 2 || r.filter((x, k) => x === left[k]).length > Math.floor(n / 3)));
  return { left, right };
}
