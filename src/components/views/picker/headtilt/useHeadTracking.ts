import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseHeadTrackingOptions {
  enabled?: boolean;
  sensitivity?: number; // Độ nhạy góc nghiêng (độ), mặc định 18-20°
  holdDurationMs?: number; // Thời gian giữ đầu để chốt (ms), mặc định 1000ms (1 giây)
  onConfirmed?: (direction: 'left' | 'right') => void;
}

export interface HeadTrackingState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isCameraActive: boolean;
  isModelLoaded: boolean;
  cameraError: string | null;
  tiltDirection: 'left' | 'right' | 'none';
  tiltAngle: number;
  holdProgress: number; // 0 - 100%
  isLocked: boolean;
  engineType: 'mediapipe' | 'native_cv';
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  triggerManualTilt: (direction: 'left' | 'right' | 'none') => void;
  resetTilt: () => void;
}

/**
 * Tải động MediaPipe FaceMesh từ CDN nếu mạng khả dụng
 */
async function loadMediaPipeFaceMesh(): Promise<any> {
  if (typeof window !== 'undefined' && (window as any).FaceMesh) {
    return (window as any).FaceMesh;
  }

  return new Promise((resolve, reject) => {
    const existingScript = document.getElementById('mediapipe-facemesh-script');
    if (existingScript) {
      let checkCount = 0;
      const interval = setInterval(() => {
        checkCount++;
        if ((window as any).FaceMesh) {
          clearInterval(interval);
          resolve((window as any).FaceMesh);
        } else if (checkCount > 30) {
          clearInterval(interval);
          reject(new Error('Hết thời gian chờ nạp FaceMesh.'));
        }
      }, 100);
      return;
    }

    const script = document.createElement('script');
    script.id = 'mediapipe-facemesh-script';
    script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js';
    script.crossOrigin = 'anonymous';
    script.async = true;

    script.onload = () => {
      if ((window as any).FaceMesh) {
        resolve((window as any).FaceMesh);
      } else {
        reject(new Error('Script loaded but window.FaceMesh is undefined.'));
      }
    };

    script.onerror = () => {
      reject(new Error('Không thể tải MediaPipe từ CDN (sẽ sử dụng Native CV Engine).'));
    };

    document.head.appendChild(script);
  });
}

/**
 * ⚡ NATIVE CANVAS COMPUTER VISION HEAD TILT ESTIMATOR (0 Dependencies, 100% Offline)
 * Phân tích độ nghiêng của đầu dựa trên Central Image Moments của vùng mặt.
 * Hoạt động ngay tức thì 60 FPS, không phụ thuộc internet/CDN.
 */
class NativeCanvasTiltEstimator {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private width = 160;
  private height = 120;
  private smoothedAngle = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
  }

  public estimateTilt(video: HTMLVideoElement): { angle: number; hasFace: boolean } {
    if (!this.ctx || !video || video.readyState < 2) {
      return { angle: 0, hasFace: false };
    }

    try {
      // Vẽ khung hình thu nhỏ từ video
      this.ctx.drawImage(video, 0, 0, this.width, this.height);
      const imgData = this.ctx.getImageData(0, 0, this.width, this.height);
      const data = imgData.data;

      let m00 = 0;
      let m10 = 0;
      let m01 = 0;

      // Giới hạn vùng quét trung tâm để tránh nhiễu xung quanh
      const minX = Math.floor(this.width * 0.15);
      const maxX = Math.floor(this.width * 0.85);
      const minY = Math.floor(this.height * 0.1);
      const maxY = Math.floor(this.height * 0.9);

      // Phân đoạn vùng da/mặt (Skin Tone Segmentation)
      for (let y = minY; y < maxY; y += 2) {
        for (let x = minX; x < maxX; x += 2) {
          const idx = (y * this.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          // Điều kiện màu da người phổ quát trong không gian RGB
          const isSkin =
            r > 80 &&
            g > 40 &&
            b > 20 &&
            r > g &&
            r > b &&
            Math.abs(r - g) > 12 &&
            r - Math.min(g, b) > 15;

          if (isSkin) {
            m00++;
            m10 += x;
            m01 += y;
          }
        }
      }

      // Nếu không đủ pixel khuôn mặt
      if (m00 < 120) {
        return { angle: 0, hasFace: false };
      }

      const cx = m10 / m00;
      const cy = m01 / m00;

      // Tính Central Moments bậc 2 (mu20, mu02, mu11)
      let mu20 = 0;
      let mu02 = 0;
      let mu11 = 0;

      for (let y = minY; y < maxY; y += 2) {
        for (let x = minX; x < maxX; x += 2) {
          const idx = (y * this.width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const isSkin =
            r > 80 &&
            g > 40 &&
            b > 20 &&
            r > g &&
            r > b &&
            Math.abs(r - g) > 12 &&
            r - Math.min(g, b) > 15;

          if (isSkin) {
            const dx = x - cx;
            const dy = y - cy;
            mu20 += dx * dx;
            mu02 += dy * dy;
            mu11 += dx * dy;
          }
        }
      }

      // Góc trục elip: theta = 0.5 * atan2(2 * mu11, mu20 - mu02)
      const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
      let deg = theta * (180 / Math.PI);

      // Điều chỉnh theo hướng selfie (mirrored)
      deg = -deg;

      // Giới hạn góc hợp lý cho chuyển động đầu (-45° đến +45°)
      deg = Math.max(-45, Math.min(45, deg));

      // Lọc làm mịn góc (Exponential Moving Average)
      this.smoothedAngle = this.smoothedAngle * 0.6 + deg * 0.4;

      return { angle: this.smoothedAngle, hasFace: true };
    } catch {
      return { angle: 0, hasFace: false };
    }
  }
}

export function useHeadTracking({
  enabled = true,
  sensitivity = 18,
  holdDurationMs = 900,
  onConfirmed
}: UseHeadTrackingOptions = {}): HeadTrackingState {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<any>(null);
  const nativeCvRef = useRef<NativeCanvasTiltEstimator | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [engineType, setEngineType] = useState<'mediapipe' | 'native_cv'>('native_cv');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tiltDirection, setTiltDirection] = useState<'left' | 'right' | 'none'>('none');
  const [tiltAngle, setTiltAngle] = useState<number>(0);
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [isLocked, setIsLocked] = useState(false);

  const activeDirectionRef = useRef<'left' | 'right' | 'none'>('none');
  const holdStartRef = useRef<number | null>(null);
  const confirmedRef = useRef(false);
  const isLockedRef = useRef(false);
  isLockedRef.current = isLocked;

  const sensitivityRef = useRef(sensitivity);
  sensitivityRef.current = sensitivity;

  const holdDurationRef = useRef(holdDurationMs);
  holdDurationRef.current = holdDurationMs;

  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  // Dọn dẹp stream camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  // Khởi động Camera
  const startCamera = useCallback(async (): Promise<boolean> => {
    try {
      setCameraError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Trình duyệt không hỗ trợ truy cập Camera.');
      }

      // Dừng stream cũ nếu đang chạy
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      streamRef.current = stream;

      // Gán stream cho video element nếu đã mount
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(err => console.warn('Video play:', err));
      }

      // Khởi tạo ngay bộ ước lượng Native CV
      if (!nativeCvRef.current) {
        nativeCvRef.current = new NativeCanvasTiltEstimator();
      }

      setIsCameraActive(true);
      setIsModelLoaded(true); // Native CV sẵn sàng lập tức!
      return true;
    } catch (err: unknown) {
      console.warn('Lỗi mở Camera:', err);
      const msg = err instanceof Error ? err.message : 'Không thể mở Camera.';
      setCameraError(msg);
      setIsCameraActive(false);
      return false;
    }
  }, []);

  // 🛡️ Tự động gắn stream vào video element khi video element mount sau
  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.play().catch(() => {});
      }
    }
  }, [isCameraActive]);

  // Reset nghiêng
  const resetTilt = useCallback(() => {
    setTiltDirection('none');
    setTiltAngle(0);
    setHoldProgress(0);
    setIsLocked(false);
    activeDirectionRef.current = 'none';
    holdStartRef.current = null;
    confirmedRef.current = false;
  }, []);

  // Giả lập nghiêng thủ công
  const triggerManualTilt = useCallback((dir: 'left' | 'right' | 'none') => {
    if (isLocked) return;

    if (dir === 'none') {
      resetTilt();
      return;
    }

    const angle = dir === 'left' ? -sensitivityRef.current : sensitivityRef.current;
    setTiltDirection(dir);
    setTiltAngle(angle);
    setHoldProgress(100);
    setIsLocked(true);
    confirmedRef.current = true;

    if (onConfirmedRef.current) {
      onConfirmedRef.current(dir);
    }
  }, [isLocked, resetTilt]);

  // Xử lý góc nghiêng và thời gian giữ (Dwell Time)
  const processTiltAngle = useCallback((angle: number, hasFace: boolean) => {
    if (isLockedRef.current) return;

    if (!hasFace) {
      setTiltDirection('none');
      setTiltAngle(0);
      activeDirectionRef.current = 'none';
      holdStartRef.current = null;
      setHoldProgress(0);
      return;
    }

    const roundedAngle = Math.round(angle);
    setTiltAngle(roundedAngle);

    let detectedDir: 'left' | 'right' | 'none' = 'none';
    if (angle < -sensitivityRef.current) {
      detectedDir = 'left';
    } else if (angle > sensitivityRef.current) {
      detectedDir = 'right';
    } else {
      detectedDir = 'none';
    }

    setTiltDirection(detectedDir);

    if (detectedDir !== 'none' && !confirmedRef.current) {
      if (activeDirectionRef.current !== detectedDir) {
        activeDirectionRef.current = detectedDir;
        holdStartRef.current = performance.now();
        setHoldProgress(0);
      } else if (holdStartRef.current) {
        const elapsed = performance.now() - holdStartRef.current;
        const progress = Math.min(100, Math.round((elapsed / holdDurationRef.current) * 100));
        setHoldProgress(progress);

        if (progress >= 100 && !confirmedRef.current) {
          confirmedRef.current = true;
          setIsLocked(true);
          isLockedRef.current = true;

          if (onConfirmedRef.current) {
            onConfirmedRef.current(detectedDir);
          }
        }
      }
    } else {
      activeDirectionRef.current = 'none';
      holdStartRef.current = null;
      setHoldProgress(0);
    }
  }, []);

  // 1. Thử nạp MediaPipe FaceMesh ngầm (Nếu mạng OK)
  useEffect(() => {
    let isMounted = true;

    async function initMediaPipe() {
      try {
        const FaceMeshClass = await loadMediaPipeFaceMesh();
        if (!isMounted) return;

        const faceMesh = new FaceMeshClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        faceMesh.onResults((results: any) => {
          if (!isMounted || isLockedRef.current) return;

          if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            processTiltAngle(0, false);
            return;
          }

          const landmarks = results.multiFaceLandmarks[0];
          const leftEye = landmarks[33];
          const rightEye = landmarks[263];

          if (leftEye && rightEye) {
            const deltaY = rightEye.y - leftEye.y;
            const deltaX = rightEye.x - leftEye.x;
            const rawAngle = Math.atan2(deltaY, deltaX) * (180 / Math.PI);
            const angle = -rawAngle;
            processTiltAngle(angle, true);
          }
        });

        faceMeshRef.current = faceMesh;
        setEngineType('mediapipe');
      } catch (e) {
        // Fallback Native CV đã tự động kích hoạt
        console.info('[HeadTracking] Sử dụng Native CV Engine:', e);
      }
    }

    initMediaPipe();

    return () => {
      isMounted = false;
      if (faceMeshRef.current) {
        try {
          faceMeshRef.current.close();
        } catch (_) {}
        faceMeshRef.current = null;
      }
    };
  }, [processTiltAngle]);

  // 2. VÒNG LẶP DỰ ĐOÁN XỬ LÝ VIDEO FRAME (DUAL-ENGINE: FaceMesh or Native Canvas CV)
  useEffect(() => {
    if (!enabled || !isCameraActive) return;

    let isSubscribed = true;
    let isProcessing = false;

    const processLoop = async () => {
      if (!isSubscribed) return;

      const video = videoRef.current;
      if (
        video &&
        video.readyState >= 2 &&
        !video.paused &&
        !video.ended &&
        !isLockedRef.current &&
        !isProcessing
      ) {
        isProcessing = true;
        try {
          if (faceMeshRef.current) {
            await faceMeshRef.current.send({ image: video });
          } else if (nativeCvRef.current) {
            const { angle, hasFace } = nativeCvRef.current.estimateTilt(video);
            processTiltAngle(angle, hasFace);
          }
        } catch {
          // Bỏ qua lỗi frame
        } finally {
          isProcessing = false;
        }
      }

      if (isSubscribed) {
        animFrameRef.current = requestAnimationFrame(processLoop);
      }
    };

    animFrameRef.current = requestAnimationFrame(processLoop);

    return () => {
      isSubscribed = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [enabled, isCameraActive, processTiltAngle]);

  // Dọn dẹp khi unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return {
    videoRef,
    isCameraActive,
    isModelLoaded,
    cameraError,
    tiltDirection,
    tiltAngle,
    holdProgress,
    isLocked,
    engineType,
    startCamera,
    stopCamera,
    triggerManualTilt,
    resetTilt
  };
}
