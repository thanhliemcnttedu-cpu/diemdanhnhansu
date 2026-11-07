import fs from 'fs';
import path from 'path';

const defaultBoysDir = path.resolve('public/avatars/default/boys');
const defaultGirlsDir = path.resolve('public/avatars/default/girls');

const boyColors = [
  { bg: '#3b82f6', skin: '#fde047', hair: '#1e293b', label: 'Boy-Smart' },
  { bg: '#0284c7', skin: '#fcd34d', hair: '#475569', label: 'Boy-Sport' },
  { bg: '#0d9488', skin: '#fed7aa', hair: '#334155', label: 'Boy-Hero' },
  { bg: '#6366f1', skin: '#fed7aa', hair: '#1e1b4b', label: 'Boy-Star' },
  { bg: '#8b5cf6', skin: '#fde047', hair: '#312e81', label: 'Boy-Smile' },
  { bg: '#2563eb', skin: '#ffedd5', hair: '#0f172a', label: 'Boy-Happy' }
];

const girlColors = [
  { bg: '#ec4899', skin: '#fde047', hair: '#831843', label: 'Girl-Sweet' },
  { bg: '#f43f5e', skin: '#fcd34d', hair: '#4c0519', label: 'Girl-Braid' },
  { bg: '#d946ef', skin: '#fed7aa', hair: '#701a75', label: 'Girl-Active' },
  { bg: '#a855f7', skin: '#ffedd5', hair: '#581c87', label: 'Girl-Cute' },
  { bg: '#fb7185', skin: '#fde047', hair: '#881337', label: 'Girl-Bright' },
  { bg: '#e11d48', skin: '#fed7aa', hair: '#4c0519', label: 'Girl-Lovely' }
];

function generateBoySvg(item, idx) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <circle cx="60" cy="60" r="58" fill="${item.bg}"/>
  <!-- Shirt -->
  <path d="M30 115 C30 85 90 85 90 115 Z" fill="#ffffff" opacity="0.95"/>
  <path d="M48 85 L60 100 L72 85 Z" fill="#2563eb"/>
  <!-- Head -->
  <circle cx="60" cy="60" r="28" fill="${item.skin}"/>
  <!-- Hair -->
  <path d="M34 52 C34 32 86 32 86 52 C78 40 42 40 34 52 Z" fill="${item.hair}"/>
  <path d="M34 52 C38 42 50 40 56 46 C62 40 78 42 86 52" fill="${item.hair}"/>
  <!-- Eyes -->
  <circle cx="50" cy="60" r="3.5" fill="#0f172a"/>
  <circle cx="70" cy="60" r="3.5" fill="#0f172a"/>
  <circle cx="51.5" cy="58.5" r="1.2" fill="#ffffff"/>
  <circle cx="71.5" cy="58.5" r="1.2" fill="#ffffff"/>
  <!-- Smile -->
  <path d="M52 70 Q60 77 68 70" stroke="#b45309" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <!-- Cheeks -->
  <circle cx="45" cy="66" r="3.5" fill="#f87171" opacity="0.45"/>
  <circle cx="75" cy="66" r="3.5" fill="#f87171" opacity="0.45"/>
</svg>`;
}

function generateGirlSvg(item, idx) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <circle cx="60" cy="60" r="58" fill="${item.bg}"/>
  <!-- Shirt -->
  <path d="M30 115 C30 85 90 85 90 115 Z" fill="#ffffff" opacity="0.95"/>
  <path d="M48 85 L60 98 L72 85 Z" fill="#ec4899"/>
  <!-- Braids / Hair Back -->
  <circle cx="34" cy="68" r="8" fill="${item.hair}"/>
  <circle cx="86" cy="68" r="8" fill="${item.hair}"/>
  <!-- Head -->
  <circle cx="60" cy="60" r="28" fill="${item.skin}"/>
  <!-- Hair Front -->
  <path d="M32 54 C32 30 88 30 88 54 C82 42 66 40 60 46 C54 40 38 42 32 54 Z" fill="${item.hair}"/>
  <!-- Eyes -->
  <circle cx="50" cy="60" r="3.5" fill="#0f172a"/>
  <circle cx="70" cy="60" r="3.5" fill="#0f172a"/>
  <circle cx="51.5" cy="58.5" r="1.2" fill="#ffffff"/>
  <circle cx="71.5" cy="58.5" r="1.2" fill="#ffffff"/>
  <!-- Eyelashes -->
  <path d="M46 56 L44 54" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M74 56 L76 54" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>
  <!-- Smile -->
  <path d="M52 70 Q60 77 68 70" stroke="#be185d" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  <!-- Cheeks -->
  <circle cx="45" cy="66" r="4" fill="#fb7185" opacity="0.55"/>
  <circle cx="75" cy="66" r="4" fill="#fb7185" opacity="0.55"/>
  <!-- Bow Clip -->
  <polygon points="34,44 42,48 42,40" fill="#f43f5e"/>
  <polygon points="46,44 38,48 38,40" fill="#f43f5e"/>
  <circle cx="40" cy="44" r="2.5" fill="#fef08a"/>
</svg>`;
}

boyColors.forEach((b, idx) => {
  const filePath = path.join(defaultBoysDir, `boy-${idx + 1}.svg`);
  fs.writeFileSync(filePath, generateBoySvg(b, idx + 1), 'utf8');
});

girlColors.forEach((g, idx) => {
  const filePath = path.join(defaultGirlsDir, `girl-${idx + 1}.svg`);
  fs.writeFileSync(filePath, generateGirlSvg(g, idx + 1), 'utf8');
});

console.log('Successfully generated default SVG avatars for boys and girls!');
