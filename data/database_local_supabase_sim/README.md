# 🧪 DATABASE LOCAL SUPABASE SIMULATOR

> **MỤC ĐÍCH**: Thư mục này mô phỏng cơ sở dữ liệu Supabase Cloud trên môi trường localhost để liên thông dữ liệu khi chạy thử tại http://localhost:3000/

---

## ⚠️ QUY TẮC BẮT BUỘC

1. **CHỈ DÙNG KHI LOCALHOST**: Dữ liệu trong thư mục này chỉ có tác dụng khi chạy server local (`npm run dev` / `localhost:3000`).
2. **KHÔNG ĐỒNG BỘ GITHUB**: Thư mục này đã được thêm vào `.gitignore`. **TUYỆT ĐỐI KHÔNG** commit hoặc push lên GitHub.
3. **KHÔNG ẢNH HƯỞNG PRODUCTION**: Khi triển khai lên web GitHub Pages / Vercel, Supabase Cloud thật sẽ được sử dụng thay thế.
4. **ZERO DATA LOSS**: Dữ liệu thật trên GitHub/Supabase Cloud sẽ không bao giờ bị ảnh hưởng bởi thư mục này.

---

## 📂 CẤU TRÚC CÁC BẢNG MÔ PHỎNG

```
database_local_supabase_sim/
├── README.md                    ← File này
├── sim_config.json              ← Cấu hình kết nối simulator
├── tables/
│   ├── users.json               ← Bảng users (mô phỏng auth.users)
│   ├── user_data.json           ← Bảng dữ liệu giáo viên/lớp học
│   ├── schools.json             ← Bảng trường học
│   ├── audit_logs.json          ← Bảng nhật ký thao tác
│   └── registrations.json       ← Bảng đăng ký sử dụng
└── snapshots/                   ← Lưu các bản chụp dữ liệu theo thời gian
    └── .gitkeep
```

---

## 🔄 LUỒNG DỮ LIỆU (Fallback 3 Lớp)

```
Khi localhost:3000
  ┌─────────────────────────────────────┐
  │  Supabase Cloud (nếu có ENV key)    │ ← Ưu tiên 1
  └──────────────┬──────────────────────┘
                 │ Nếu lỗi / không có key
  ┌──────────────▼──────────────────────┐
  │  database_local_supabase_sim/       │ ← Ưu tiên 2 (Thư mục này)
  │  (JSON Server mô phỏng Supabase)    │
  └──────────────┬──────────────────────┘
                 │ Nếu lỗi
  ┌──────────────▼──────────────────────┐
  │  LocalStorage (trình duyệt)         │ ← Ưu tiên 3 (Fallback cuối)
  └─────────────────────────────────────┘

Khi triển khai Production (GitHub Pages / Vercel):
  Supabase Cloud thật → LocalStorage (bỏ qua thư mục này hoàn toàn)
```

---

## 🚀 CÁCH SỬ DỤNG

Thư mục này được server local tự động nhận diện qua biến môi trường:
```
USE_LOCAL_SUPABASE_SIM=true   ← Bật simulator (chỉ khi localhost)
LOCAL_SIM_DIR=./data/database_local_supabase_sim
```

---

*Được tạo bởi meo meo (Antigravity IDE) - Chỉ dùng nội bộ localhost*
