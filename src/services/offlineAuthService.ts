/**
 * Offline sign-in (desktop build with an offline data folder only).
 *
 * After every successful ONLINE sign-in the app keeps a one-way verifier of the password (PBKDF2-SHA256 with a
 * random salt — the password itself is never stored here) together with the public account record. When the
 * school's Apps Script cannot be reached, the same account can sign in on this PC by proving the password
 * against that verifier, for OFFLINE_VALID_DAYS after its last online sign-in.
 *
 * Records live in localStorage (fast, synchronous lookups for the login screen) and are mirrored into the
 * offline folder so they survive a wiped browser profile.
 */
import type { UserAccount } from '../types';
import { googleDriveService } from './googleDriveService';
import { offlineStoreService } from './offlineStoreService';

export const OFFLINE_VALID_DAYS = 30;
const STORAGE_KEY = 'lhhp_offline_auth_v1';
const MIRROR_FILE = 'dang_nhap_ngoai_tuyen.json';
const ITERATIONS = 150000;

interface OfflineAuthRecord {
  /** Shared Drive folder the account belongs to — a record is only valid for the connection it was made on */
  folderId: string;
  username: string;
  /** Other spellings the person may type (e.g. citizen-ID number with / without leading zeros) */
  aliases: string[];
  salt: string;
  hash: string;
  iterations: number;
  user: UserAccount;
  /** Last successful ONLINE sign-in (ms) — the offline window is counted from here */
  lastOnlineAt: number;
}

export type OfflineVerifyResult =
  | { status: 'ok'; user: UserAccount; daysLeft: number }
  | { status: 'no_record' | 'wrong' | 'expired' | 'unsupported' };

const clean = (v: string) => String(v || '').trim().toLowerCase();
const currentFolderId = () => String(googleDriveService.getConfig().folderId || '').trim();

const toB64 = (bytes: Uint8Array): string => {
  let s = '';
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s);
};
const fromB64 = (text: string): Uint8Array => Uint8Array.from(atob(text), c => c.charCodeAt(0));

const hasCrypto = () => typeof crypto !== 'undefined' && !!crypto.subtle;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return toB64(new Uint8Array(bits));
}

/** Compare without stopping at the first different character */
const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const readLocal = (): OfflineAuthRecord[] => {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch { return []; }
};

const writeAll = (list: OfflineAuthRecord[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* quota: the folder copy still holds it */ }
  void offlineStoreService.writeJson(MIRROR_FILE, { version: 1, records: list });
};

/** localStorage first; when empty (new browser profile) fall back to the copy in the offline folder */
async function loadRecords(): Promise<OfflineAuthRecord[]> {
  const localList = readLocal();
  if (localList.length > 0) return localList;
  const mirror = await offlineStoreService.readJson<{ records?: OfflineAuthRecord[] }>(MIRROR_FILE);
  const list = Array.isArray(mirror?.records) ? mirror!.records! : [];
  if (list.length > 0) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ } }
  return list;
}

const namesTyped = (typed: string): string[] => {
  const name = clean(typed);
  const digits = name.replace(/\s/g, '');
  const out = [name];
  // Citizen-ID number typed without its leading zeros (9–11 digits) → the full 12-digit form
  if (/^\d{9,11}$/.test(digits)) out.push(digits.padStart(12, '0'));
  return out;
};

const matches = (r: OfflineAuthRecord, folderId: string, names: string[]) =>
  r.folderId === folderId && names.some(n => n === r.username || (r.aliases || []).includes(n));

const stripSecrets = (user: UserAccount): UserAccount => {
  const copy: any = { ...user };
  delete copy.password;
  delete copy.currentPassword;
  return copy as UserAccount;
};

export const offlineAuthService = {
  /** Offline sign-in exists only where the offline data folder exists (desktop build) */
  isEnabled(): boolean {
    return offlineStoreService.isAvailable() && hasCrypto();
  },

  /** Is there at least one account on this PC that could sign in offline for the current school connection */
  hasRecords(): boolean {
    if (!this.isEnabled()) return false;
    const folderId = currentFolderId();
    return readLocal().some(r => r.folderId === folderId);
  },

  /** Call after a successful ONLINE sign-in. Never throws. */
  async remember(user: UserAccount, password: string, typedUsername?: string): Promise<void> {
    if (!this.isEnabled() || !user?.username || !password) return;
    try {
      const folderId = currentFolderId();
      const username = clean(user.username);
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const hash = await derive(password, salt, ITERATIONS);
      const list = await loadRecords();
      const previous = list.find(r => r.folderId === folderId && r.username === username);
      const aliases = Array.from(new Set([...(previous?.aliases || []), ...namesTyped(typedUsername || '')].filter(a => a && a !== username)));
      const record: OfflineAuthRecord = {
        folderId, username, aliases, salt: toB64(salt), hash, iterations: ITERATIONS,
        user: stripSecrets(user), lastOnlineAt: Date.now(),
      };
      writeAll([...list.filter(r => !(r.folderId === folderId && r.username === username)), record]);
    } catch (err) {
      console.warn('offlineAuth.remember failed:', err);
    }
  },

  /** Password changed while online → keep the offline verifier in step. Never throws. */
  async updatePassword(username: string, newPassword: string): Promise<void> {
    if (!this.isEnabled() || !newPassword) return;
    try {
      const folderId = currentFolderId();
      const names = namesTyped(username);
      const list = await loadRecords();
      const record = list.find(r => matches(r, folderId, names));
      if (!record) return;
      const salt = crypto.getRandomValues(new Uint8Array(16));
      record.salt = toB64(salt);
      record.hash = await derive(newPassword, salt, ITERATIONS);
      record.iterations = ITERATIONS;
      writeAll(list);
    } catch (err) {
      console.warn('offlineAuth.updatePassword failed:', err);
    }
  },

  /** Check a sign-in attempt against what this PC remembers */
  async verify(typedUsername: string, password: string): Promise<OfflineVerifyResult> {
    if (!this.isEnabled()) return { status: 'unsupported' };
    try {
      const folderId = currentFolderId();
      const record = (await loadRecords()).find(r => matches(r, folderId, namesTyped(typedUsername)));
      if (!record) return { status: 'no_record' };
      const hash = await derive(password, fromB64(record.salt), record.iterations || ITERATIONS);
      if (!sameText(hash, record.hash)) return { status: 'wrong' };
      const ageDays = (Date.now() - record.lastOnlineAt) / 86400000;
      // A clock set back in time must not extend the window
      if (ageDays > OFFLINE_VALID_DAYS || ageDays < -1) return { status: 'expired' };
      return { status: 'ok', user: record.user, daysLeft: Math.max(0, Math.ceil(OFFLINE_VALID_DAYS - ageDays)) };
    } catch (err) {
      console.warn('offlineAuth.verify failed:', err);
      return { status: 'no_record' };
    }
  },

  /** Forget one account on this PC (e.g. the account was removed by the school) */
  async forget(username: string): Promise<void> {
    const folderId = currentFolderId();
    const names = namesTyped(username);
    const list = await loadRecords();
    const kept = list.filter(r => !matches(r, folderId, names));
    if (kept.length !== list.length) writeAll(kept);
  },
};
