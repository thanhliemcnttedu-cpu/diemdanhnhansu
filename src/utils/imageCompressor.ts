/**
 * Utility to compress images, crop avatars, and prevent localStorage QuotaExceededError.
 */

export async function compressImage(
  source: File | string,
  maxWidth = 400,
  maxHeight = 400,
  quality = 0.85
): Promise<string> {
  return new Promise((resolve) => {
    // Safety timeout: Never hang in loading state longer than 4s
    const timeoutId = setTimeout(() => {
      console.warn('compressImage timed out, resolving fallback');
      if (typeof source === 'string') resolve(source);
      else resolve('');
    }, 4000);

    const finish = (result: string) => {
      clearTimeout(timeoutId);
      resolve(result);
    };

    const processDataUrl = (dataUrl: string) => {
      if (!dataUrl) {
        finish('');
        return;
      }

      // If it's already an SVG or tiny string, return it directly
      if (dataUrl.startsWith('data:image/svg+xml') || dataUrl.length < 5000) {
        finish(dataUrl);
        return;
      }

      const img = new Image();
      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          if (width <= 0 || height <= 0) {
            finish(dataUrl);
            return;
          }

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(width, 1);
          canvas.height = Math.max(height, 1);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            finish(dataUrl);
            return;
          }

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const compressed = canvas.toDataURL('image/jpeg', quality);
          finish(compressed);
        } catch (err) {
          console.warn('compressImage processing error:', err);
          finish(dataUrl);
        }
      };

      img.onerror = (err) => {
        console.warn('compressImage img.onerror:', err);
        finish(dataUrl);
      };

      img.src = dataUrl;
    };

    if (source instanceof File) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const raw = (e.target?.result as string) || '';
        processDataUrl(raw);
      };
      reader.onerror = () => finish('');
      reader.readAsDataURL(source);
    } else {
      processDataUrl(source);
    }
  });
}

/**
 * Bakes the zoomed & panned avatar into a clean square image canvas
 * so it renders reliably everywhere at ~20-30KB without needing CSS transforms.
 */
export async function bakeCroppedAvatar(
  imageSrc: string,
  scale: number = 1,
  position: { x: number; y: number } = { x: 0, y: 0 },
  outputSize: number = 240
): Promise<string> {
  return new Promise((resolve) => {
    if (!imageSrc) {
      resolve('');
      return;
    }

    // Safety timeout: never hang longer than 3s
    const timeoutId = setTimeout(() => {
      console.warn('bakeCroppedAvatar timed out, resolving original source');
      resolve(imageSrc);
    }, 3000);

    const finish = (result: string) => {
      clearTimeout(timeoutId);
      resolve(result);
    };

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(imageSrc);
          return;
        }

        // Fill crisp background
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, outputSize, outputSize);

        // Center point
        const cx = outputSize / 2;
        const cy = outputSize / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.translate(position.x, position.y);
        ctx.scale(scale, scale);

        // Draw image centered
        const nw = img.naturalWidth || outputSize;
        const nh = img.naturalHeight || outputSize;

        // Cover fit
        const coverScale = Math.max(outputSize / nw, outputSize / nh);
        const dw = nw * coverScale;
        const dh = nh * coverScale;

        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();

        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        finish(dataUrl);
      } catch (err) {
        console.warn('bakeCroppedAvatar error:', err);
        finish(imageSrc);
      }
    };

    img.onerror = () => finish(imageSrc);
    img.src = imageSrc;
  });
}

/**
 * Bakes the zoomed & panned full uncropped image into a high quality square avatar
 * only when user confirms. Matches preview viewport pixel-for-pixel without pre-cropping.
 */
export async function bakeCropFromFullImage(
  imageSrc: string,
  frameSize = 240,
  position: { x: number; y: number } = { x: 0, y: 0 },
  scale: number = 1,
  outputSize: number = 360,
  flipX: boolean = false
): Promise<string> {
  return new Promise((resolve) => {
    if (!imageSrc) {
      resolve('');
      return;
    }

    // If it's an external preset avatar without zoom or translation or flip, return source directly
    if (imageSrc.startsWith('http') && scale === 1 && position.x === 0 && position.y === 0 && !flipX) {
      resolve(imageSrc);
      return;
    }

    const timeoutId = setTimeout(() => {
      console.warn('bakeCropFromFullImage timed out, returning imageSrc');
      resolve(imageSrc);
    }, 4000);

    const finish = (result: string) => {
      clearTimeout(timeoutId);
      resolve(result);
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const nw = img.naturalWidth || outputSize;
        const nh = img.naturalHeight || outputSize;

        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(imageSrc);
          return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outputSize, outputSize);

        // Scale ratio from preview frame to export canvas
        const R = outputSize / frameSize;
        const s0 = Math.max(frameSize / nw, frameSize / nh);

        ctx.save();
        ctx.translate(outputSize / 2, outputSize / 2);
        if (flipX) {
          ctx.scale(-1, 1);
        }
        ctx.translate(position.x * R, position.y * R);
        ctx.scale(scale * s0 * R, scale * s0 * R);

        ctx.drawImage(img, -nw / 2, -nh / 2, nw, nh);
        ctx.restore();

        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        finish(dataUrl);
      } catch (err) {
        console.warn('bakeCropFromFullImage error:', err);
        finish(imageSrc);
      }
    };

    img.onerror = () => finish(imageSrc);
    img.src = imageSrc;
  });
}

