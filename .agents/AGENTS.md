## Style & UI Guidelines

1. **Consistent UI Components**: Luôn tuân thủ cách thức thiết kế các khung tab, button switch, dropdown menu giống hệt như chuẩn đã làm ở trang `site setting page` (FacebookPageSettings.tsx). Không tự ý sáng tạo layout UI mới cho các component cơ bản này.
2. **Color Palette**: Tuyệt đối sử dụng màu sắc theo cấu hình (theme/color variables) của layout hiện tại. Tuyệt đối KHÔNG sử dụng màu Hồng và Tím.

## VPS Safety & Deployment Guidelines (Bắt buộc tuân thủ)

1. **Zero-Data Loss & Phân tách dự án (Zero Interference)**:
   - Tuyệt đối KHÔNG chạy các lệnh xóa volume hoặc reset database (`docker compose down -v`, `prisma db push --force-reset`).
   - Trên VPS `169.58.190.115` đang có các dự án khác vận hành (như `linh.goxo.us` tại `/root/ztreel-app` và `t4.goxo.us` tại `/root/ztreel-t4`). Tuyệt đối NGHIÊM CẤM đụng chạm, sửa đổi, dừng hoặc xóa bất kỳ file/container/volume nào ngoài phạm vi của `t7` (`/root/ztreel7-app`, prefix `ztreel7_`).
2. **Quyền hạn can thiệp**: Mọi thay đổi mã nguồn hoặc cấu hình trên VPS (`t7.goxo.us`) chỉ được phép thực hiện khi người dùng yêu cầu hoặc đồng ý.
3. **Quản lý Git**:
   - `upstream` (Read-only, cục bộ tại thư mục này): `https://github.com/trungseodn/t6goxo` (tuyệt đối không push). Không ảnh hưởng đến các máy/dự án khác.
   - `origin` (Chính): `https://github.com/trungseodn/t7goxo` (tất cả code đẩy vào đây).
4. **Thông tin & Lệnh SSH đăng nhập VPS**:
   - Hostname: `vmi3698279` | IP: `169.58.190.115` (Port: `22`) | User: `root`
   - Domain: `t7.goxo.us`
   - Thư mục dự án trên VPS: `/root/ztreel7-app`
   - Compose file: `docker-compose.t7.yml`
   - Lệnh SSH chuẩn:
     ```powershell
     ssh -o StrictHostKeyChecking=no root@169.58.190.115
     ```
   - Chạy lệnh một lần từ PowerShell:
     ```powershell
     ssh -o BatchMode=yes -o StrictHostKeyChecking=no root@169.58.190.115 '<lệnh_bash>'
     ```
5. **Quy trình chi tiết**: Xem đầy đủ tại file [DEPLOYMENT_RULES.md](file:///d:/projects/t7.goxo.us/DEPLOYMENT_RULES.md).
