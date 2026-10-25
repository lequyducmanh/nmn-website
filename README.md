# NMN · Năng lượng tế bào

Website giới thiệu **PURE NMN 12000MG+** và **NMN Regene** với hiệu ứng 3D khi cuộn trang, kèm **Cửa hàng – giỏ hàng – đặt hàng** và trang **Tin tức & Sự kiện**.

Toàn bộ website nằm trong một file duy nhất: `index.html`.

## Xem trang

- Trực tuyến: **https://lequyducmanh.github.io/nmn-website/**
- Hoặc mở trực tiếp `index.html` bằng trình duyệt (cần có mạng để tải thư viện 3D và font chữ).

## Chỉnh nội dung

Mở `index.html`, tìm các khối sau trong thẻ `<script>` gần cuối file:

| Khối | Nội dung |
|---|---|
| `CONFIG` | Tên thương hiệu, tên cửa hàng, hotline, Zalo, phí giao hàng, tài khoản ngân hàng, link nhận đơn |
| `PRODUCTS` | Sản phẩm trong cửa hàng: tên, **giá**, mô tả, thông số, cách dùng, ảnh |
| `POSTS` | Bài viết trang Tin tức |
| `EVENTS` | Sự kiện |

Bài viết và sự kiện có `sample: true` đang là **nội dung mẫu** — thay bằng thông tin thật rồi đổi thành `sample: false` để bỏ nhãn "Mẫu".

> ⚠ Giá mặc định trong `PRODUCTS` (4.950.000đ, 6.950.000đ, 11.900.000đ) lấy theo giá niêm yết của một đại lý — hãy sửa theo giá bán của bạn.

## Cửa hàng & đặt hàng

- Giỏ hàng được lưu trên trình duyệt của khách (tải lại trang vẫn còn).
- Khi khách bấm **Đặt hàng**, website tạo **mã đơn** (ví dụ `NMN-261025-AB12`) và trang xác nhận.
- **Mặc định (chưa cấu hình gì):** đơn chưa tự gửi về cho bạn. Trang xác nhận hướng dẫn khách **gửi đơn qua Zalo** (nội dung đơn được chép sẵn) hoặc **gọi hotline**.
- **Nhận đơn tự động vào Google Sheets:** làm theo mục bên dưới rồi dán link vào `CONFIG.orderEndpoint`.

### Cấu hình trong `CONFIG`

| Mục | Ý nghĩa |
|---|---|
| `shippingFee` | Phí giao hàng (số). `null` = hiện "Báo khi xác nhận đơn" |
| `freeShippingFrom` | Miễn phí giao hàng cho đơn từ số tiền này. `null` = không áp dụng |
| `orderEndpoint` | Link nhận đơn tự động (Google Apps Script). Để trống = khách gửi đơn qua Zalo |
| `bank` | Điền `code` (mã ngân hàng VietQR, ví dụ `VCB`, `MB`, `TCB`), `account`, `owner`, `name` để bật **Chuyển khoản** kèm mã QR. Để trống = chỉ nhận COD |
| `perks` | Các cam kết hiển thị ở cửa hàng — chỉ ghi những gì bạn thực sự áp dụng |

### Nhận đơn vào Google Sheets (miễn phí)

1. Tạo một Google Sheet mới → **Tiện ích mở rộng → Apps Script**.
2. Xoá code mẫu, dán đoạn sau rồi bấm **Lưu**:

```js
function doPost(e) {
  const o = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('Đơn hàng') || ss.insertSheet('Đơn hàng');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Mã đơn', 'Thời gian', 'Họ tên', 'SĐT', 'Email', 'Tỉnh/TP', 'Địa chỉ',
                  'Sản phẩm', 'Tạm tính', 'Phí ship', 'Tổng', 'Thanh toán', 'Ghi chú']);
  }
  sh.appendRow([
    o.code, new Date(o.createdAt), o.customer.name, "'" + o.customer.phone, o.customer.email,
    o.customer.city, o.customer.address,
    o.items.map(i => i.name + ' × ' + i.qty).join(', '),
    o.subtotal, o.shipping == null ? 'Báo sau' : o.shipping, o.total,
    o.payment === 'bank' ? 'Chuyển khoản' : 'COD', o.customer.note
  ]);
  return ContentService.createTextOutput('ok');
}
```

3. Bấm **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: *Thực thi với tư cách*: **Tôi**; *Người có quyền truy cập*: **Bất kỳ ai** → **Triển khai** và cấp quyền.
4. Sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`) và dán vào `orderEndpoint` trong `CONFIG`.

## Đường dẫn

| Đường dẫn | Trang |
|---|---|
| `#cua-hang` | Cửa hàng |
| `#san-pham/<slug>` | Chi tiết sản phẩm (`pure-nmn`, `nmn-regene`, `bo-doi`) |
| `#thanh-toan` | Đặt hàng |
| `#don-hang/<mã>` | Xác nhận đơn hàng |
| `#tin-tuc` | Tin tức & Sự kiện |
| `#bai/<slug>`, `#su-kien/<slug>` | Một bài viết / sự kiện |

## Trước khi bán hàng chính thức

Website thương mại điện tử bán hàng tại Việt Nam thường cần: thông tin doanh nghiệp (tên, mã số thuế, địa chỉ), chính sách đổi trả – giao hàng – bảo mật, thông báo website với Bộ Công Thương, và giấy tờ công bố sản phẩm cho thực phẩm bảo vệ sức khỏe. Hãy kiểm tra với bộ phận pháp lý/kế toán của bạn.

## Công nghệ

HTML, CSS, JavaScript thuần · [three.js](https://threejs.org) 0.160 (tải từ jsDelivr) · Google Fonts (Noto Serif Display, Be Vietnam Pro) · VietQR (ảnh mã QR chuyển khoản).

> Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh.
