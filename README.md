# NMN Regene & PURE NMN 12,000mg+

Website giới thiệu **PURE NMN 12,000mg+** và **NMN Regene**: trang chủ có hiệu ứng 3D khi cuộn, **Cửa hàng – giỏ hàng – đặt hàng**, **Tin tức & Sự kiện**, và **trang quản trị nội dung (CMS)** để thay ảnh, sửa chữ, thêm sản phẩm/bài viết mà không cần sửa code.

- Website: **https://lequyducmanh.github.io/nmn-website/**
- Quản trị: **https://lequyducmanh.github.io/nmn-website/admin/**

## Cấu trúc

```
index.html              Khung trang (các phần cố định: khoa học NAD+, nghiên cứu…)
assets/
  css/site.css          Giao diện
  js/app.js             Chức năng: đọc nội dung, trang chủ, cửa hàng, giỏ hàng, tin tức, điều hướng
  js/scene.js           Cảnh 3D (three.js)
content/                ← NỘI DUNG (sửa qua /admin)
  site.json             Cài đặt chung, liên hệ, phí giao hàng, ngân hàng, chữ trên trang chủ, SEO
  products.json         Sản phẩm: giá, ảnh, mô tả, thông số, vị trí trên trang chủ
  posts.json            Bài viết
  events.json           Sự kiện
images/                 Ảnh tải lên qua CMS (products/, posts/, events/, misc/)
admin/                  Trang quản trị (index.html, admin.css, admin.js)
```

Website đọc `content/*.json` mỗi lần tải trang, nên **đổi nội dung không cần sửa code**.

## Dùng trang quản trị (CMS)

### 1. Tạo mã truy cập GitHub (làm một lần)

1. Mở **https://github.com/settings/personal-access-tokens/new** (đăng nhập tài khoản sở hữu repo).
2. *Token name*: `NMN CMS` · *Expiration*: chọn thời hạn (ví dụ 90 ngày).
3. *Repository access* → **Only select repositories** → chọn `nmn-website`.
4. *Permissions → Repository permissions → **Contents*** → **Read and write**.
5. **Generate token**, sao chép mã (bắt đầu bằng `github_pat_…`).

> Mã chỉ lưu trên trình duyệt của bạn và chỉ gửi tới GitHub. Không chia sẻ mã. Nếu lộ, xoá mã trong GitHub Settings → Developer settings → Personal access tokens. Mỗi người quản trị nên dùng mã riêng.

### 2. Đăng nhập và sửa

Mở `/admin/`, dán mã → **Đăng nhập**. Các mục:

| Mục | Sửa được gì |
|---|---|
| **Cài đặt chung** | Thương hiệu, hotline, Zalo, email, phí giao hàng, miễn phí ship từ, tài khoản ngân hàng (bật chuyển khoản + QR), link nhận đơn, SEO |
| **Trang chủ** | Tiêu đề lớn, đoạn giới thiệu, 3 điểm nổi bật, dải chữ chạy, phần liên hệ |
| **Sản phẩm** | Thêm/sửa/ẩn/xoá/sắp xếp; giá, giá gốc; **ảnh chính + ảnh phụ**; tên theo hồ sơ, công dụng, thành phần & hàm lượng, cách dùng, bảo quản, lưu ý, số ĐKSP/XNQC; chọn **Vị trí 1 / Vị trí 2** để hiện ở trang chủ |
| **Bài viết** | Soạn bài có tiêu đề, chữ đậm, danh sách, trích dẫn, ghi chú, liên kết, **chèn ảnh**; ảnh bìa; bản nháp/đăng; bài nổi bật |
| **Sự kiện** | Ngày, giờ, địa điểm, số chỗ, link đăng ký, ảnh bìa, mô tả |
| **Thư viện ảnh** | Tải nhiều ảnh, xem ảnh đang dùng ở đâu, xoá ảnh |

- Ảnh tải lên được **tự nén** (tối đa 1600px, định dạng WebP) để website nhanh.
- Trong tiêu đề, đặt chữ trong `*dấu sao*` để hiện **chữ nghiêng màu vàng**, ví dụ `Chăm sóc làn da từ *bên trong*`.

### 3. Xem trước và Xuất bản

- **Xem trước**: mở website với nội dung đang sửa (có thanh “Bản xem trước”) — khách chưa thấy.
- **Xuất bản**: lưu mọi thay đổi vào GitHub trong **một lần cập nhật**; website hiển thị nội dung mới sau khoảng **1 phút**.
- CMS tự kiểm tra lỗi trước khi xuất bản (thiếu tên, đường dẫn trùng, ngày sai…) và cảnh báo nếu nội dung vừa bị sửa ở nơi khác.
- Mọi lần xuất bản đều lưu trong **lịch sử GitHub** → có thể khôi phục phiên bản cũ.

## Quy định câu từ quảng cáo (bắt buộc)

Theo thông báo nội dung quảng cáo của Công ty (CV số 2110/2026/CV-CVJ). Sản phẩm là **thực phẩm bảo vệ sức khỏe**, nên mọi nội dung trên website phải bám đúng **hồ sơ công bố** và **nội dung quảng cáo đã được xác nhận**.

| Sản phẩm | Công dụng được phép ghi | Số ĐKSP | Số XNQC |
|---|---|---|---|
| NMN Regene | Hỗ trợ chống lão hoá da | 5585/2024/ĐKSP | 1669/2024/XNQC-ATTP |
| PURE NMN 12,000mg+ | Hỗ trợ làm đẹp da | 581/2023/ĐKSP | 336/2023/XNQC-ATTP |

**Không được dùng:**
- Từ ngữ quá mức: *trường thọ, trường sinh, đảo ngược lão hóa, kéo dài tuổi thọ, trẻ hóa, thần dược*…
- Nói sản phẩm chữa, điều trị, phòng ngừa bệnh, hay thay thế thuốc; nhắc tên bệnh (tiểu đường, tim mạch, ung thư…).
- Lấy nghiên cứu trên tế bào, động vật hoặc nghiên cứu chung về NMN để nói người dùng sản phẩm có tác dụng tương tự.
- Cam kết hiệu quả tuyệt đối, tức thì; so sánh “tốt nhất / số 1 / duy nhất”; lời chứng thực, ảnh trước – sau.

**Bắt buộc:** luôn có câu *“Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.”* (đã có ở chân trang, trang chủ, trang sản phẩm).

CMS có **bộ dò từ khoá**: thẻ *Kiểm tra câu từ quảng cáo* ở trang Tổng quan, và cảnh báo khi bấm Xuất bản. Bộ dò chỉ hỗ trợ — nội dung mới vẫn cần người phụ trách duyệt theo hồ sơ xác nhận quảng cáo.

## Cửa hàng & nhận đơn

- Giỏ hàng lưu trên trình duyệt của khách. Khi đặt hàng, website tạo **mã đơn** và trang xác nhận.
- **Mặc định:** khách gửi đơn qua **Zalo** (nội dung đơn được chép sẵn) hoặc gọi hotline.
- **Nhận đơn tự động vào Google Sheets:** làm theo mục dưới, rồi dán link vào CMS → Cài đặt chung → *Link nhận đơn tự động*.

### Nhận đơn vào Google Sheets (miễn phí)

1. Tạo Google Sheet mới → **Tiện ích mở rộng → Apps Script**, dán đoạn sau rồi **Lưu**:

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

2. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: *Thực thi với tư cách* **Tôi**, *Người có quyền truy cập* **Bất kỳ ai** → **Triển khai**.
3. Sao chép **URL ứng dụng web** (`https://script.google.com/macros/s/…/exec`) và dán vào CMS.

## Đường dẫn trên website

| Đường dẫn | Trang |
|---|---|
| `#cua-hang` | Cửa hàng |
| `#san-pham/<đường-dẫn>` | Chi tiết sản phẩm |
| `#thanh-toan` | Đặt hàng |
| `#don-hang/<mã>` | Xác nhận đơn |
| `#tin-tuc` | Tin tức & Sự kiện |
| `#bai/<đường-dẫn>`, `#su-kien/<đường-dẫn>` | Một bài viết / sự kiện |

## Khi sửa code (CSS/JS)

Tăng số `?v=…` ở các thẻ `<link>`/`<script>` trong `index.html` và `admin/index.html` để khách nhận bản mới ngay (không cần khi chỉ sửa nội dung qua CMS).

## Chạy thử trên máy

Website đọc nội dung bằng `fetch`, nên cần mở qua một máy chủ web (không mở trực tiếp file):

```bash
cd nmn-website
python3 -m http.server 8000
# mở http://localhost:8000
```

## Dữ liệu cho công cụ tìm kiếm

Website tự sinh dữ liệu có cấu trúc **schema.org (JSON-LD)**: `Organization` ở trang chủ, `Product` (giá, ảnh) ở trang sản phẩm, `Article` cho bài viết, `Event` cho sự kiện — giúp Google hiểu và hiển thị nội dung tốt hơn.

## Trước khi bán hàng chính thức

Website thương mại điện tử tại Việt Nam thường cần: thông tin doanh nghiệp (tên, mã số thuế, địa chỉ), chính sách đổi trả – giao hàng – bảo mật, thông báo website với Bộ Công Thương, và hồ sơ công bố sản phẩm cho thực phẩm bảo vệ sức khỏe. Hãy kiểm tra với bộ phận pháp lý/kế toán.

## Công nghệ

HTML, CSS, JavaScript thuần (không cần build) · [three.js](https://threejs.org) 0.160 · Google Fonts (Noto Serif Display, Be Vietnam Pro) · GitHub Git Data API (CMS) · VietQR (mã QR chuyển khoản) · GitHub Pages.

> Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.
