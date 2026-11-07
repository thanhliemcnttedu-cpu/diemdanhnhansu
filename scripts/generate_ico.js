import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, '..');
const faviconPath = path.join(rootDir, 'public', 'favicon.png');
const buildDir = path.join(rootDir, 'build');
const icoPath = path.join(buildDir, 'icon.ico');
const publicIcoPath = path.join(rootDir, 'public', 'icon.ico');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

async function convert() {
  try {
    // 1. Thử dùng png-to-ico nếu đã cài xong
    const pngToIco = (await import('png-to-ico')).default;
    const buf = await pngToIco(faviconPath);
    fs.writeFileSync(icoPath, buf);
    fs.writeFileSync(publicIcoPath, buf);
    console.log('✅ Đã tạo icon.ico thành công bằng png-to-ico!');
  } catch (e) {
    // 2. Fallback tạo ICO chuẩn Windows nhúng PNG header
    console.log('Tạo icon.ico bằng pure Node.js ICO container...');
    const pngBuf = fs.readFileSync(faviconPath);
    
    // Header ICO: 6 bytes
    // 0-1: 0 (reserved)
    // 2-3: 1 (ICO type)
    // 4-5: 1 (1 icon image)
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(1, 4);

    // Directory Entry: 16 bytes
    // 0: width (0 = 256)
    // 1: height (0 = 256)
    // 2: color count (0 = >= 8bpp)
    // 3: reserved (0)
    // 4-5: color planes (1)
    // 6-7: bits per pixel (32)
    // 8-11: image size
    // 12-15: offset
    const dirEntry = Buffer.alloc(16);
    dirEntry.writeUInt8(0, 0); // 256px
    dirEntry.writeUInt8(0, 1); // 256px
    dirEntry.writeUInt8(0, 2);
    dirEntry.writeUInt8(0, 3);
    dirEntry.writeUInt16LE(1, 4);
    dirEntry.writeUInt16LE(32, 6);
    dirEntry.writeUInt32LE(pngBuf.length, 8);
    dirEntry.writeUInt32LE(22, 12); // Header (6) + Entry (16) = offset 22

    const finalIco = Buffer.concat([header, dirEntry, pngBuf]);
    fs.writeFileSync(icoPath, finalIco);
    fs.writeFileSync(publicIcoPath, finalIco);
    console.log('✅ Đã tạo icon.ico chuẩn Windows nhúng PNG thành công!');
  }
}

convert();
