/**
 * Image Processor Utility for CertificateView
 * Removes white/light backgrounds from images using Canvas 2D
 */

export const removeWhiteBackground = (img: HTMLImageElement): Promise<string> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const maxDim = 1200;
    let width = img.naturalWidth || img.width || 800;
    let height = img.naturalHeight || img.height || 400;

    // Giữ nguyên tỷ lệ khi giới hạn kích thước tối đa
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(img.src);
      return;
    }

    // 1. Vẽ ảnh gốc lên canvas
    ctx.drawImage(img, 0, 0, width, height);

    // 2. Lấy dữ liệu điểm ảnh thô (RGBA)
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 3. Quét từng pixel (mỗi pixel chiếm 4 bytes: R, G, B, A)
    for (let i = 0; i < data.length; i += 4) {
      // Nếu pixel ĐÃ TRONG SUỐT (Alpha = 0), bỏ qua ngay
      if (data[i + 3] === 0) {
        continue;
      }

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Nếu pixel là MÀU SÁNG/TRẮNG (VD: r > 220 && g > 220 && b > 220), gán Alpha = 0 (làm trong suốt)
      if (r > 220 && g > 220 && b > 220) {
        data[i + 3] = 0;
      }
      // Tuyệt đối KHÔNG chạm vào các pixel còn lại
    }

    // 4. Ghi ngược dữ liệu đã xử lý trở lại canvas và xuất file PNG trong suốt
    ctx.putImageData(imgData, 0, 0);
    resolve(canvas.toDataURL('image/png'));
  });
};
