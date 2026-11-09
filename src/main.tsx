import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { schoolDriveDbService } from './services/schoolDriveDbService';
import { installGlobalAvatarFallback } from './utils/avatarConfig';

// 🌐 Bản web tĩnh (Vercel): không có máy chủ Express (/api/*). Dò 1 lần khi khởi động; nếu không có,
// trả 404 ngay tại trình duyệt cho các lần gọi /api sau đó (cùng kiểu phản hồi như máy chủ tĩnh,
// nên logic dự phòng không đổi) để tránh hàng trăm yêu cầu mạng thừa từ các vòng đồng bộ định kỳ.
(() => {
  if (typeof window === 'undefined' || window.location.protocol === 'file:') return;
  const nativeFetch = window.fetch.bind(window);
  let apiAvailable: boolean | null = null;
  nativeFetch('/api/database/stats', { cache: 'no-store' })
    .then(r => {
      apiAvailable = r.ok && (r.headers.get('content-type') || '').includes('application/json');
      (window as any).__lhhpApiAvailable = apiAvailable;
    })
    .catch(() => {
      apiAvailable = false;
      (window as any).__lhhpApiAvailable = false;
    });
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (apiAvailable === false) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`)) {
        return Promise.resolve(new Response('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } }));
      }
    }
    return nativeFetch(input, init);
  };
})();

// 🧹 Bản web: dữ liệu trình duyệt chỉ thuộc 1 thư mục dùng chung — dọn bộ nhớ đệm cũ trước khi nạp
schoolDriveDbService.ensureCacheOwnership();
// 🛡️ Ảnh avatar học sinh lỗi ở bất kỳ màn hình nào → tự sửa / dùng ảnh dự phòng
installGlobalAvatarFallback();

// 📲 Trang điểm danh giáo viên – nhân viên (/diemdanh): giao diện riêng, nhẹ, không cần đăng nhập phần mềm
const isStaffCheckInRoute = typeof window !== 'undefined'
  && (/^\/diemdanh\/?$/i.test(window.location.pathname) || /^#\/?diemdanh/i.test(window.location.hash));

if (isStaffCheckInRoute) {
  import('./components/views/staff/StaffCheckInPage').then(({ StaffCheckInPage }) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <StaffCheckInPage />
      </StrictMode>,
    );
  });
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
