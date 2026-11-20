import type { SavedQrCode } from '../types';

/**
 * Per-account copy of the saved QR codes on this device (localStorage).
 * - Executives (Quản trị trường, BGH, Quản trị tối cao) have no school-database record of their own, so this is their only copy.
 * - Everyone else: a safety net next to the account data. A fresh account whose data record is rewritten while the
 *   account data is still loading would otherwise lose codes saved a moment ago.
 * Merging is by id, newest `updatedAt` wins; deleted ids are remembered (tombstones) so a deleted code is not revived.
 */
interface QrLocal { v: 2; items: SavedQrCode[]; deleted: Record<string, number> }

const keyOf = (owner?: string) => `lhhp_qr_${String(owner || '').toLowerCase()}`;
const valid = (q: any): q is SavedQrCode => Boolean(q && q.id && typeof q.url === 'string');

export function readQrLocal(owner?: string): QrLocal {
  const empty: QrLocal = { v: 2, items: [], deleted: {} };
  if (!owner) return empty;
  try {
    const raw = JSON.parse(localStorage.getItem(keyOf(owner)) || 'null');
    if (Array.isArray(raw)) return { v: 2, items: raw.filter(valid), deleted: {} };      // first version stored a bare list
    if (raw && Array.isArray(raw.items)) return { v: 2, items: raw.items.filter(valid), deleted: raw.deleted && typeof raw.deleted === 'object' ? raw.deleted : {} };
  } catch (_) { /* unreadable copy: start empty */ }
  return empty;
}

export function writeQrLocal(owner: string | undefined, items: SavedQrCode[], deleted: Record<string, number>): void {
  if (!owner) return;
  try { localStorage.setItem(keyOf(owner), JSON.stringify({ v: 2, items, deleted })); } catch (_) { /* storage full or blocked */ }
}

/** Union by id; the newer `updatedAt` wins; ids deleted after their last update stay deleted */
export function mergeQr(a: SavedQrCode[], b: SavedQrCode[], deleted: Record<string, number>): SavedQrCode[] {
  const map = new Map<string, SavedQrCode>();
  [...a, ...b].forEach(q => {
    if (!valid(q)) return;
    const cur = map.get(q.id);
    if (!cur || (q.updatedAt || 0) > (cur.updatedAt || 0)) map.set(q.id, q);
  });
  return Array.from(map.values())
    .filter(q => !(deleted[q.id] && deleted[q.id] >= (q.updatedAt || 0)))
    .sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
}
