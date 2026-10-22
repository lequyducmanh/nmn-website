# NMN · Năng lượng tế bào

Website giới thiệu **PURE NMN 12000MG+** và **NMN Regene** với hiệu ứng 3D khi cuộn trang, kèm trang **Tin tức & Sự kiện**.

Toàn bộ website nằm trong một file duy nhất: `index.html`.

## Xem trang

- Mở trực tiếp `index.html` bằng trình duyệt (cần có mạng để tải thư viện 3D và font chữ).
- Hoặc bật **GitHub Pages**: *Settings → Pages → Branch: `main` / root* — trang sẽ có địa chỉ dạng `https://<tên-tài-khoản>.github.io/<tên-repo>/`.

## Chỉnh nội dung

Mở `index.html`, tìm gần cuối file:

| Khối | Nội dung |
|---|---|
| `CONFIG` | Tên thương hiệu, tên cửa hàng, hotline, Zalo, giá sản phẩm |
| `POSTS` | Bài viết trang Tin tức (tiêu đề, ngày, tóm tắt, nội dung) |
| `EVENTS` | Sự kiện (ngày, giờ, địa điểm, mô tả) |

Bài viết và sự kiện có `sample: true` đang là **nội dung mẫu** — thay bằng thông tin thật rồi đổi thành `sample: false` để bỏ nhãn "Mẫu".

## Đường dẫn

- `#tin-tuc` — trang Tin tức & Sự kiện
- `#bai/<slug>` — một bài viết
- `#su-kien/<slug>` — một sự kiện

## Công nghệ

HTML, CSS, JavaScript thuần · [three.js](https://threejs.org) 0.160 (tải từ jsDelivr) · Google Fonts (Noto Serif Display, Be Vietnam Pro).

> Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.
