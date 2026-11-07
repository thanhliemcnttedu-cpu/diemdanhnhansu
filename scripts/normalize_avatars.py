# -*- coding: utf-8 -*-
"""Normalize demo avatars to one uniform style: square 1:1, 512x512, JPEG q88, RGB, no metadata.
- real_demo (photos): detect the face and crop a head-and-shoulders square centred on it.
- default (cartoons on white): keep the whole character, trim white border, pad to square.
Cách dùng (cần Python + Pillow + opencv-python-headless<5):
  python scripts/normalize_avatars.py public/avatars public/avatars avatar_check.png
Khi thư mục vào = thư mục ra: ảnh gốc khác .jpg sẽ được thay bằng bản .jpg chuẩn.
Ảnh trong real_demo (ảnh thật) cắt theo khuôn mặt; ảnh trong default (hoạt hình) giữ trọn nhân vật.
Sau khi thêm/đổi tên ảnh, cập nhật danh sách tĩnh trong src/utils/avatarConfig.ts."""
import os, sys
import numpy as np
import cv2
from PIL import Image, ImageOps, ImageDraw

SRC, OUT, SHEET = sys.argv[1], sys.argv[2], sys.argv[3]
SIZE = 512
EXTS = {'.jpg', '.jpeg', '.png', '.jfif', '.webp'}
FACE = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_default.xml'))
FACE_ALT = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, 'haarcascade_frontalface_alt2.xml'))
log = []

def to_rgb(im):
    im = ImageOps.exif_transpose(im)
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        im = im.convert('RGBA')
        bg = Image.new('RGB', im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        return bg
    return im.convert('RGB')

def detect_face(im):
    gray = cv2.cvtColor(np.array(im), cv2.COLOR_RGB2GRAY)
    w, h = im.size
    min_side = max(24, int(min(w, h) * 0.06))
    faces = []
    for cas in (FACE, FACE_ALT):
        found = cas.detectMultiScale(gray, scaleFactor=1.08, minNeighbors=5, minSize=(min_side, min_side))
        faces += [tuple(f) for f in found]
    # Only accept faces whose centre lies in the upper 55% of the picture (avoids shirt/print false positives)
    faces = [f for f in faces if f[1] + f[3] / 2 <= h * 0.55]
    if not faces:
        return None
    faces.sort(key=lambda f: f[2] * f[3], reverse=True)
    return faces[0]

def crop_square(im, cx, cy, side):
    w, h = im.size
    side = int(min(side, w, h))
    left = int(round(cx - side / 2)); top = int(round(cy - side / 2))
    left = max(0, min(left, w - side)); top = max(0, min(top, h - side))
    return im.crop((left, top, left + side, top + side))

def photo_avatar(im, name):
    w, h = im.size
    f = detect_face(im)
    if f is not None:
        x, y, fw, fh = f
        side = fh * 3.1                     # head + shoulders
        cx = x + fw / 2
        cy = y + fh / 2 + fh * 0.45         # face sits in the upper-middle of the frame
        log.append(f'{name}: face {fw}x{fh} -> crop {int(min(side, w, h))}')
        return crop_square(im, cx, cy, side)
    side = min(w, h)
    log.append(f'{name}: NO FACE -> top-biased square')
    return crop_square(im, w / 2, (h - side) * 0.12 + side / 2 if h > w else h / 2, side)

def cartoon_avatar(im, name):
    arr = np.array(im)
    mask = (arr < 242).any(axis=2)          # non-white pixels
    ys, xs = np.where(mask)
    if len(xs):
        im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    w, h = im.size
    side = int(max(w, h) * 1.08)           # small white margin
    canvas = Image.new('RGB', (side, side), (255, 255, 255))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    log.append(f'{name}: cartoon padded {w}x{h} -> {side}')
    return canvas

pairs = []
for dp, _, fs in os.walk(SRC):
    for f in sorted(fs):
        base, ext = os.path.splitext(f)
        if ext.lower() not in EXTS:
            continue
        rel_dir = os.path.relpath(dp, SRC)
        im = to_rgb(Image.open(os.path.join(dp, f)))
        is_photo = rel_dir.replace(os.sep, '/').startswith('real_demo')
        out_im = (photo_avatar if is_photo else cartoon_avatar)(im, f).resize((SIZE, SIZE), Image.LANCZOS)
        out_dir = os.path.join(OUT, rel_dir)
        os.makedirs(out_dir, exist_ok=True)
        out_im.save(os.path.join(out_dir, base + '.jpg'), 'JPEG', quality=88, optimize=True, progressive=True)
        src_path = os.path.join(dp, f)
        if os.path.abspath(OUT) == os.path.abspath(SRC) and ext.lower() != '.jpg' and os.path.exists(src_path):
            os.remove(src_path)  # in-place: replace .jfif/.png/... with the normalized .jpg
        pairs.append((f, im, out_im))

T, cols = 150, 6
rows = (len(pairs) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (2 * T + 20), rows * (T + 28)), (235, 238, 245))
d = ImageDraw.Draw(sheet)
for i, (name, before, after) in enumerate(pairs):
    r, c = divmod(i, cols)
    x, y = c * (2 * T + 20), r * (T + 28)
    b = ImageOps.contain(before, (T, T))
    sheet.paste(b, (x + (T - b.width) // 2, y + (T - b.height) // 2))
    sheet.paste(after.resize((T, T)), (x + T + 4, y))
    d.text((x, y + T + 4), name[:30], fill=(30, 30, 60))
sheet.save(SHEET)
print('\n'.join(log))
print(f'{len(pairs)} images -> {OUT}')
