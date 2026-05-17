# 🛡 Sandbot Admin Server — Hướng dẫn sử dụng

## 1. Cài đặt & chạy server

```bash
cd sandbot-server
npm install
npm start
# Server chạy tại: http://localhost:3001
```

Để deploy lên internet (dùng Railway miễn phí):
1. Tạo account tại railway.app
2. New Project → Deploy from GitHub
3. Upload thư mục này lên GitHub → connect
4. Thêm environment variables: PORT, ADMIN_PASSWORD, JWT_SECRET

---

## 2. Đăng nhập Admin

```bash
curl -X POST http://localhost:3001/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"sandbot2024!"}'
```
→ Nhận được `token`. Dùng token này cho mọi request admin khác.

---

## 3. Xem dashboard (stats)

```bash
curl http://localhost:3001/api/admin/stats \
  -H "Authorization: Bearer YOUR_TOKEN"
```
Trả về: tổng thiết bị, active hôm nay, số bị khóa, tổng tin nhắn, lỗi gần đây.

---

## 4. Quản lý thiết bị (người dùng)

### Xem danh sách tất cả
```bash
curl "http://localhost:3001/api/admin/devices?page=1&limit=50" \
  -H "Authorization: Bearer TOKEN"
```

### Tìm kiếm theo ID
```bash
curl "http://localhost:3001/api/admin/devices?search=sandbot-abc123" \
  -H "Authorization: Bearer TOKEN"
```

### Xem chi tiết 1 thiết bị + lịch sử lỗi
```bash
curl http://localhost:3001/api/admin/devices/DEVICE_ID \
  -H "Authorization: Bearer TOKEN"
```

### Khóa chatbot của 1 người dùng
```bash
curl -X POST http://localhost:3001/api/admin/devices/DEVICE_ID/block \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason":"Vi phạm điều khoản sử dụng"}'
```

### Mở khóa
```bash
curl -X POST http://localhost:3001/api/admin/devices/DEVICE_ID/unblock \
  -H "Authorization: Bearer TOKEN"
```

### Đặt giới hạn tin nhắn/ngày cho 1 người
```bash
curl -X POST http://localhost:3001/api/admin/devices/DEVICE_ID/limit \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"limit":200}'
```

---

## 5. Gửi thông báo đến người dùng

### Thông báo thường (info)
```bash
curl -X POST http://localhost:3001/api/admin/notifications \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "info",
    "title": "Bảo trì hệ thống",
    "body": "Server sẽ bảo trì vào 2:00 AM ngày 15/4. Vui lòng lưu công việc.",
    "target": "all",
    "expiresInHours": 48
  }'
```

### Thông báo lỗi/cảnh báo
```bash
curl -X POST http://localhost:3001/api/admin/notifications \
  -d '{
    "type": "error",
    "title": "Sự cố API",
    "body": "Gemini API đang gặp sự cố. Đội ngũ đang xử lý.",
    "target": "all"
  }'
```

### Thông báo cập nhật (sẽ tự tải về app)
```bash
curl -X POST http://localhost:3001/api/admin/notifications \
  -d '{
    "type": "update",
    "title": "Sandbot v1.2.0 có sẵn",
    "body": "Phiên bản mới với nhiều cải tiến!",
    "version": "1.2.0",
    "updateUrl": "https://your-server.com/downloads/sandbot-1.2.0.exe",
    "sizeMB": 85,
    "target": "all"
  }'
```

### Gửi thông báo cho 1 thiết bị cụ thể
```bash
# Chỉ thay "all" bằng device ID
  -d '{"type":"info","title":"Thông báo riêng","target":"sandbot-abc123-..."}'
```

---

## 6. Xem lỗi từ người dùng

```bash
curl http://localhost:3001/api/admin/errors \
  -H "Authorization: Bearer TOKEN"
```

---

## 7. Điều chỉnh giới hạn tin nhắn toàn bộ

```bash
# Đặt tất cả users thành 200 tin/ngày
curl -X POST http://localhost:3001/api/admin/global/msg-limit \
  -d '{"limit":200}'

# Khóa toàn bộ (maintenance mode)
curl -X POST http://localhost:3001/api/admin/global/block-all

# Mở khóa tất cả
curl -X POST http://localhost:3001/api/admin/global/unblock-all
```

---

## 8. Kết nối app với server

Trong file `src/main/main.js`, tìm dòng:
```javascript
const SERVER_URL = store.get('serverUrl') || 'https://your-sandbot-server.com';
```
Thay `your-sandbot-server.com` bằng URL server của bạn.

Sau đó tìm hàm `pollServer()` và bỏ comment dòng fetch:
```javascript
async function pollServer() {
  try {
    const deviceId = store.get('deviceId');
    const version = app.getVersion ? app.getVersion() : '1.1.1';
    const res = await fetch(`${SERVER_URL}/api/client/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, version, platform: process.platform }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
}
```

---

## 9. Đổi mật khẩu admin

```bash
curl -X POST http://localhost:3001/api/admin/change-password \
  -H "Authorization: Bearer TOKEN" \
  -d '{"newPassword":"mat-khau-moi-manh-hon"}'
```

---

## 10. Dữ liệu mỗi user (deviceId)

Mỗi khi app được cài và chạy lần đầu, nó tự tạo 1 `deviceId` ngẫu nhiên (dạng `sandbot-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). ID này:
- Lưu trong máy user (`electron-store`)
- Gửi lên server khi heartbeat
- Dùng để admin nhận dạng và quản lý
- KHÔNG liên kết với tài khoản Google hay Gemini API
- Dù nhiều user dùng chung API key, mỗi máy vẫn có ID riêng

User có thể xem ID của mình trong: System Tray → click phải → hiển thị ID ngắn.
