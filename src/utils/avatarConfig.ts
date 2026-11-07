/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Avatar Management & Auto-Assignment System (v4.0)
 * Automatically discovers avatar files from public/avatars/ without touching code.
 * Supports two distinct categories: 'default' (cartoon/vector/mặc định) and 'real_demo' (ảnh thật học sinh)
 * Separated by gender: 'boys' (Nam) and 'girls' (Nữ)
 */

import { Gender } from '../types';

export type AvatarSourceType = 'default' | 'real_demo';

export interface AvatarFolderStructure {
  default: {
    boys: string[];
    girls: string[];
  };
  real_demo: {
    boys: string[];
    girls: string[];
  };
}

// 1. Static Initial Manifest: Pre-indexed from public/avatars/
// Includes all formats: .jpg, .jpeg, .png, .webp, .svg, .jfif, .avif
const STATIC_AVATAR_MANIFEST: AvatarFolderStructure = {
  default: {
    boys: [
      '/avatars/default/boys/boy1.jpg',
      '/avatars/default/boys/boy4.jfif',
      '/avatars/default/boys/boy5.jfif',
      '/avatars/default/boys/boy6.jfif',
      '/avatars/default/boys/boy7.jfif',
      '/avatars/default/boys/boy8.jfif',
      '/avatars/default/boys/boy9.jfif',
      '/avatars/default/boys/boy10.jfif',
      '/avatars/default/boys/boy11.jfif',
      '/avatars/default/boys/boy12.jfif'
    ],
    girls: [
      '/avatars/default/girls/girl1.jfif',
      '/avatars/default/girls/girl2.jfif',
      '/avatars/default/girls/girl3.png',
      '/avatars/default/girls/girl4.jpg',
      '/avatars/default/girls/girl5.png'
    ]
  },
  real_demo: {
    boys: [
      '/avatars/real_demo/boys/student-avatar-04.jpg',
      '/avatars/real_demo/boys/student-avatar-18.jpg',
      '/avatars/real_demo/boys/student-avatar-19.jpg',
      '/avatars/real_demo/boys/student-avatar-20.jpg',
      '/avatars/real_demo/boys/student-avatar-21.jpg',
      '/avatars/real_demo/boys/student-avatar-22.jpg',
      '/avatars/real_demo/boys/student-avatar-32.jpg',
      '/avatars/real_demo/boys/student-avatar-33.jpg',
      '/avatars/real_demo/boys/student-avatar-34.jpg',
      '/avatars/real_demo/boys/student-avatar-35.jpg',
      '/avatars/real_demo/boys/student-avatar-36.jpg',
      '/avatars/real_demo/boys/student-avatar-37.jpg',
      '/avatars/real_demo/boys/student-avatar-38.jpg',
      '/avatars/real_demo/boys/student-avatar-39.jpg',
      '/avatars/real_demo/boys/student-avatar-40.jpg',
      '/avatars/real_demo/boys/student-avatar-47.jpg',
      '/avatars/real_demo/boys/student-avatar-48.jpg',
      '/avatars/real_demo/boys/student-avatar-49.jpg',
      '/avatars/real_demo/boys/student-avatar-50.jpg'
    ],
    girls: [
      '/avatars/real_demo/girls/student-avatar-16.jpg',
      '/avatars/real_demo/girls/student-avatar-23.jpg',
      '/avatars/real_demo/girls/student-avatar-24.jpg',
      '/avatars/real_demo/girls/student-avatar-25.jpg',
      '/avatars/real_demo/girls/student-avatar-26.jpg',
      '/avatars/real_demo/girls/student-avatar-27.jpg',
      '/avatars/real_demo/girls/student-avatar-28.jpg',
      '/avatars/real_demo/girls/student-avatar-30.jpg'
    ]
  }
};

// 2. Dynamic Live Cache: Updated via /api/avatars-list when running dev server
let dynamicAvatarManifest: AvatarFolderStructure = {
  default: {
    boys: [...STATIC_AVATAR_MANIFEST.default.boys],
    girls: [...STATIC_AVATAR_MANIFEST.default.girls]
  },
  real_demo: {
    boys: [...STATIC_AVATAR_MANIFEST.real_demo.boys],
    girls: [...STATIC_AVATAR_MANIFEST.real_demo.girls]
  }
};

let hasAttemptedServerFetch = false;

/**
 * Dynamically queries the server to scan public/avatars folder at runtime.
 * When a developer or teacher adds new images to public/avatars/default or real_demo,
 * this function automatically retrieves them without requiring code modification.
 */
export async function refreshAvatarListFromServer(): Promise<AvatarFolderStructure> {
  try {
    const res = await fetch(`/api/avatars-list?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.success && data?.data) {
        if (Array.isArray(data.data.default?.boys) && data.data.default.boys.length > 0) {
          dynamicAvatarManifest.default.boys = data.data.default.boys;
        }
        if (Array.isArray(data.data.default?.girls) && data.data.default.girls.length > 0) {
          dynamicAvatarManifest.default.girls = data.data.default.girls;
        }
        if (Array.isArray(data.data.real_demo?.boys) && data.data.real_demo.boys.length > 0) {
          dynamicAvatarManifest.real_demo.boys = data.data.real_demo.boys;
        }
        if (Array.isArray(data.data.real_demo?.girls) && data.data.real_demo.girls.length > 0) {
          dynamicAvatarManifest.real_demo.girls = data.data.real_demo.girls;
        }
      }
    }
  } catch (_) {
    // Graceful fallback to static manifest
  }
  return dynamicAvatarManifest;
}

// Initial background scan on module import
if (typeof window !== 'undefined' && !hasAttemptedServerFetch) {
  hasAttemptedServerFetch = true;
  refreshAvatarListFromServer().catch(() => {});
}

// High-quality Fallback DiceBear SVG Avatars (Guaranteed non-empty safety net)
const FALLBACK_DEFAULT_BOYS: string[] = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=SmartBoy&backgroundColor=c0aede',
  'https://api.dicebear.com/7.x/bottts/svg?seed=SportBoy&backgroundColor=b6e3f4',
  'https://api.dicebear.com/7.x/bottts/svg?seed=HappyBoy&backgroundColor=d1d4f9'
];

const FALLBACK_DEFAULT_GIRLS: string[] = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=SweetGirl&backgroundColor=ffdfbf',
  'https://api.dicebear.com/7.x/bottts/svg?seed=BraidGirl&backgroundColor=ffd5dc',
  'https://api.dicebear.com/7.x/bottts/svg?seed=CuteGirl&backgroundColor=d1d4f9'
];

/**
 * Retrieve the array of available avatars for a given source type and gender.
 */
export function getAvatarList(type: AvatarSourceType, gender: Gender): string[] {
  const isMale = gender === 'Nam';
  const category = type === 'default' ? dynamicAvatarManifest.default : dynamicAvatarManifest.real_demo;
  const list = isMale ? category.boys : category.girls;

  if (list && list.length > 0) {
    return list;
  }

  // Fallback to static manifest if empty
  const staticCategory = type === 'default' ? STATIC_AVATAR_MANIFEST.default : STATIC_AVATAR_MANIFEST.real_demo;
  const staticList = isMale ? staticCategory.boys : staticCategory.girls;
  if (staticList && staticList.length > 0) {
    return staticList;
  }

  return isMale ? FALLBACK_DEFAULT_BOYS : FALLBACK_DEFAULT_GIRLS;
}

/**
 * Intelligent allocation algorithm:
 * Assigns an avatar from the candidate list matching the student's gender.
 * Uses index seeding and classId hashing to ensure distinct distribution without immediate duplicates.
 */
export function getStudentAvatarAssignment(options: {
  gender: Gender;
  type: AvatarSourceType;
  index: number;
  classId?: string;
  usedUrls?: Set<string>;
}): string {
  const { gender, type, index, classId = '', usedUrls } = options;
  const pool = getAvatarList(type, gender);

  if (pool.length === 0) {
    return gender === 'Nam' ? FALLBACK_DEFAULT_BOYS[0] : FALLBACK_DEFAULT_GIRLS[0];
  }

  // 1. Try to find an unused avatar in the pool first if a set is provided
  if (usedUrls && usedUrls.size < pool.length) {
    const available = pool.filter(url => !usedUrls.has(url));
    if (available.length > 0) {
      const chosen = available[index % available.length];
      usedUrls.add(chosen);
      return chosen;
    }
  }

  // 2. Hash classId for class-specific distribution
  let hash = 0;
  for (let i = 0; i < classId.length; i++) {
    hash = (hash * 31 + classId.charCodeAt(i)) & 0xffffffff;
  }

  const chosenIndex = Math.abs((index + Math.abs(hash)) % pool.length);
  const chosen = pool[chosenIndex];
  if (usedUrls) usedUrls.add(chosen);
  return chosen;
}

/**
 * Returns summary counts of detected avatars in each directory.
 */
export function getAvatarPoolSummary() {
  const defaultBoys = getAvatarList('default', 'Nam');
  const defaultGirls = getAvatarList('default', 'Nữ');
  const realBoys = getAvatarList('real_demo', 'Nam');
  const realGirls = getAvatarList('real_demo', 'Nữ');

  return {
    default: {
      boysCount: defaultBoys.length,
      girlsCount: defaultGirls.length,
      total: defaultBoys.length + defaultGirls.length
    },
    real_demo: {
      boysCount: realBoys.length,
      girlsCount: realGirls.length,
      total: realBoys.length + realGirls.length
    }
  };
}

const ALL_VALID_STATIC_URLS = new Set([
  ...STATIC_AVATAR_MANIFEST.default.boys,
  ...STATIC_AVATAR_MANIFEST.default.girls,
  ...STATIC_AVATAR_MANIFEST.real_demo.boys,
  ...STATIC_AVATAR_MANIFEST.real_demo.girls
]);

/**
 * Checks if an avatar URL is valid and actually exists
 */
export function isValidAvatarUrl(url?: string): boolean {
  if (!url || typeof url !== 'string' || !url.trim()) return false;
  if (url.startsWith('data:image/')) return true;
  if (url.includes('api.dicebear.com/')) return true;
  if (url.startsWith('/avatars/')) {
    return ALL_VALID_STATIC_URLS.has(url);
  }
  return true;
}

/**
 * Automatically sanitizes an avatar: if it points to a deleted or non-existent file,
 * it returns a valid existing real demo avatar for the student's gender.
 */
export function sanitizeStudentAvatar(avatar: string | undefined, gender: Gender = 'Nam', index: number = 0, classId: string = ''): string {
  if (!avatar || !isValidAvatarUrl(avatar)) {
    return getStudentAvatarAssignment({ gender, type: 'real_demo', index, classId });
  }
  return avatar;
}

/**
 * Fallback avatar URL when an avatar fails to load
 */
export function getFallbackAvatar(gender?: Gender, name?: string): string {
  const isFemale = gender === 'Nữ';
  return isFemale 
    ? '/avatars/real_demo/girls/student-avatar-16.jpg' 
    : '/avatars/real_demo/boys/student-avatar-04.jpg';
}

/**
 * Graceful error handler for <img> elements displaying student avatars
 */
export function handleAvatarImgError(e: React.SyntheticEvent<HTMLImageElement, Event>, gender?: Gender, name?: string) {
  const target = e.currentTarget;
  const isFemale = gender === 'Nữ';
  const primaryFallback = isFemale 
    ? '/avatars/real_demo/girls/student-avatar-16.jpg' 
    : '/avatars/real_demo/boys/student-avatar-04.jpg';
  
  // Prevent infinite loops if fallback also errors
  if (target.src.includes(primaryFallback)) {
    target.src = isFemale
      ? `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name || 'Girl')}&backgroundColor=ffd5dc`
      : `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name || 'Boy')}&backgroundColor=d1d4f9`;
  } else {
    target.src = primaryFallback;
  }
}


