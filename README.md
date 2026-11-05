# NMN Regene & PURE NMN 12,000mg+

Website giới thiệu **PURE NMN 12,000mg+** và **NMN Regene**: trang chủ có hiệu ứng 3D khi cuộn, **Cửa hàng – giỏ hàng – đặt hàng – chuyển khoản VietQR**, **Tin tức & Sự kiện**, trang **Liên hệ**, cùng **trang quản trị nội dung (CMS)** và **Quản lý đơn hàng**. Toàn bộ dữ liệu nằm trên **một Google Sheet**.

- Website: **https://clastive.vn/** (GitHub Pages, tên miền ở AZDIGI: 4 bản ghi A 185.199.108–111.153, `www` CNAME `lequyducmanh.github.io`)
- Quản trị nội dung: **/admin/** · Quản lý đơn hàng: **/admin/orders.html**
- Database: **Google Sheets** + Google Apps Script (xem mục *Google Sheets (database)*)

```
                 ┌──────────── Google Sheet (database) ────────────┐
                 │ Cài đặt · Sản phẩm · Bài viết · Sự kiện          │ ← CMS sửa, hoặc sửa thẳng trên Sheet
                 │ Đơn hàng · Thanh toán · Liên hệ · Ảnh            │ ← khách đặt hàng / chuyển khoản / gửi lời nhắn
                 └───────────────▲─────────────────────────────────┘
                                 │ Apps Script (Web App /exec)
 Website ──GET nội dung, POST đơn/lời nhắn, hỏi trạng thái thanh toán──┤
 CMS + Quản lý đơn hàng ──POST admin.* (Khoá quản trị)─────────────────┤
 SePay API ◀── Apps Script đối soát giao dịch tiền vào mỗi phút + khi khách đang chờ
 Google Drive ◀── ảnh tải lên từ CMS (chia sẻ dạng xem, link lh3.googleusercontent.com)
```

## Cấu trúc

```
index.html              Khung trang (các phần cố định: khoa học NAD+, nghiên cứu…)
assets/
  css/site.css          Giao diện
  js/config.js          ← LINK APPS SCRIPT (window.NMN_API) — sửa 1 lần khi cài Google Sheet
  js/app.js             Chức năng: đọc nội dung, trang chủ, cửa hàng, giỏ hàng, tin tức, liên hệ
  js/scene.js           Cảnh 3D (three.js)
content/                Bản dự phòng nội dung (dùng khi chưa có / không gọi được Google Sheet;
                        cũng là nguồn để Apps Script “nhập lần đầu”)
images/                 Ảnh có sẵn của website (ảnh mới tải lên qua CMS nằm trên Google Drive)
admin/                  CMS (index.html, admin.js) · Quản lý đơn hàng (orders.html, orders.js) · api.js (kết nối Apps Script)
tools/
  google-apps-script.gs ← TOÀN BỘ BACKEND: dán vào Apps Script của Google Sheet
  build-vn-address.py   Dữ liệu địa chỉ
```

## Google Sheets (database)

### Cài đặt lần đầu (~10 phút, làm một lần)

1. **Tạo Google Sheet**: mở [sheets.new](https://sheets.new) bằng tài khoản Google của cửa hàng → đặt tên, ví dụ `NMN Website — Database`.
2. **Dán backend**: menu **Tiện ích mở rộng → Apps Script** → xoá đoạn mã mẫu → dán **toàn bộ** tệp [`tools/google-apps-script.gs`](tools/google-apps-script.gs) → bấm 💾 **Lưu**.
3. **Tạo cấu trúc**: quay lại tab Google Sheet → **tải lại trang (F5)** → menu mới **NMN Website → ① Cài đặt lần đầu** → *Tiếp tục* → chọn tài khoản → *Nâng cao → Đi tới … (không an toàn)* → **Cho phép** (đây là script của chính bạn; cần quyền Sheet, Drive để lưu ảnh, gửi email báo đơn, gọi SePay). Nếu sau khi cấp quyền chưa thấy gì, bấm lại **① Cài đặt lần đầu**.
   Script tự tạo 8 trang tính, **nhập nội dung hiện có của website** (sản phẩm, cài đặt, bài viết, sự kiện), tạo **Khoá quản trị**, bật đối soát SePay mỗi phút và hiện hộp *Kết nối*.
4. **Triển khai Web App**: trong Apps Script → **Triển khai → Tùy chọn triển khai mới** → ⚙ *Chọn loại*: **Ứng dụng web** → *Thực thi với tư cách*: **Tôi** · *Người có quyền truy cập*: **Bất kỳ ai** → **Triển khai** → sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).
5. **Nối website**: mở [`assets/js/config.js`](assets/js/config.js) trên GitHub → ✎ → dán URL vào `window.NMN_API = "…";` → *Commit changes*. (Hoặc gửi URL cho người phụ trách kỹ thuật — URL không phải bí mật.)
6. **Đăng nhập CMS**: mở `/admin/` → dán **Khoá quản trị** (Google Sheet → **NMN Website → Thông tin kết nối**) → tích *Ghi nhớ trên máy này* nếu là máy riêng.
7. (Tuỳ chọn) **SePay** — xem mục *Xác nhận chuyển khoản tự động*.

> **Sửa mã Apps Script sau này** (khi có bản mới): dán mã mới đè lên → Lưu → **Triển khai → Quản lý triển khai → ✎ → Phiên bản: *Phiên bản mới* → Triển khai**. Link `/exec` giữ nguyên. Không tạo “triển khai mới” (sẽ ra link khác).

### Các trang tính

| Trang tính | Nội dung | Ghi chú |
|---|---|---|
| **Đơn hàng** | Mã đơn, thời gian, *Xử lý* (Mới / Đã xác nhận / Đang giao / Hoàn tất / Đã huỷ), *Thanh toán* (Chờ / Thiếu tiền / Đã thanh toán / COD), tổng, đã nhận, khách, địa chỉ, sản phẩm, ghi chú, nội dung CK, *Kiểm tra* | Tổng tiền **do máy chủ tính lại** theo trang tính Sản phẩm. Cột *Xử lý* có danh sách chọn |
| **Liên hệ** | Lời nhắn từ trang Liên hệ, ô *Đã xử lý* | |
| **Thanh toán** | Giao dịch tiền vào từ SePay, đơn khớp | Chống trùng theo mã giao dịch |
| **Sản phẩm** | Mỗi hàng 1 sản phẩm: giá, ẩn/hiện (ô tích), ảnh, mô tả, thành phần… | Thứ tự hàng = thứ tự trên website |
| **Cài đặt** | Khoá – Giá trị – Kiểu – Mô tả: hotline, Zalo, ngân hàng, phí ship, trang chủ, trang Liên hệ, SEO… | |
| **Bài viết**, **Sự kiện** | Mỗi hàng 1 bài / 1 sự kiện (nội dung HTML) | Nên soạn trong CMS |
| **Ảnh** | Ảnh đã tải lên Google Drive (thư mục *NMN website · ảnh*) | |

- **Hàng 1** là tên cột tiếng Việt, **hàng 2** (chữ xám nhỏ) là *mã trường* website dùng — **đừng sửa hàng 2**; có thể đổi tên/độ rộng/thứ tự cột, thêm cột ghi chú riêng (để trống hàng 2).
- Ô nhiều mục: *mỗi dòng một mục* (xuống dòng trong ô: **Ctrl/⌘ + Enter**); ô dạng cặp: `Tên | Giá trị` mỗi dòng.
- **Sửa thẳng trên Sheet** (đổi giá, bỏ tích *Hiển thị* để ẩn sản phẩm…) → website nhận ngay. Nếu chưa thấy: **NMN Website → Làm mới website ngay**.
- Mỗi đơn/lời nhắn mới gửi **email báo** tới tài khoản Google chủ Sheet (bật/tắt: **NMN Website → Bật / tắt email báo đơn mới**, hoặc Script property `NOTIFY_EMAIL`).
- Lịch sử thay đổi: **Tệp → Nhật ký phiên bản** của Google Sheet (khôi phục được).

### Bảo mật

- Khách **không đọc được** trang tính: website chỉ gọi Web App. Dữ liệu công khai = nội dung website; trạng thái thanh toán chỉ trả *đã trả / còn thiếu* theo đúng mã đơn, không kèm thông tin khách.
- Đơn hàng được kiểm tra dữ liệu, **tính lại tiền** theo bảng giá trên Sheet, chống gửi lặp (6 đơn / 10 phút / số điện thoại), chặn công thức trong ô (`=…`).
- CMS và Quản lý đơn hàng cần **Khoá quản trị** (64 ký tự ngẫu nhiên, lưu trong Script properties `ADMIN_KEY`; sai quá 30 lần/15 phút → tạm khoá). Lộ khoá → **NMN Website → Tạo khoá quản trị mới**.
- `SEPAY_TOKEN` chỉ nằm trong Script properties của Apps Script — không đưa vào website, CMS hay GitHub.
- Chỉ chia sẻ Google Sheet cho người cần xem đơn (quyền *Người xem* nếu chỉ xem).

## Dùng trang quản trị (CMS)

Mở `/admin/`, nhập **Khoá quản trị** → **Đăng nhập**. Các mục:

| Mục | Sửa được gì |
|---|---|
| **Cài đặt chung** | Thương hiệu, hotline, Zalo, email, phí giao hàng, miễn phí ship từ, tài khoản ngân hàng (bật chuyển khoản + QR, tự xác nhận SePay), gợi ý “Thêm vào đơn”, SEO |
| **Trang chủ** | Tiêu đề lớn, đoạn giới thiệu, 3 điểm nổi bật, dải chữ chạy, phần liên hệ |
| **Trang Liên hệ** | Tiêu đề, thông tin doanh nghiệp, giờ làm việc, bản đồ, chủ đề, câu hỏi thường gặp |
| **Sản phẩm** | Thêm/sửa/ẩn/xoá/sắp xếp; giá, giá gốc; **ảnh chính + ảnh phụ**; tên theo hồ sơ, công dụng, thành phần & hàm lượng, cách dùng, bảo quản, lưu ý, số ĐKSP/XNQC; **Vị trí 1 / Vị trí 2** ở trang chủ; link riêng (sản phẩm test) |
| **Bài viết** | Soạn bài có tiêu đề, chữ đậm, danh sách, trích dẫn, ghi chú, liên kết, **chèn ảnh**; ảnh bìa; bản nháp/đăng; bài nổi bật |
| **Sự kiện** | Ngày, giờ, địa điểm, số chỗ, link đăng ký, ảnh bìa, mô tả |
| **Thư viện ảnh** | Tải nhiều ảnh, xem ảnh đang dùng ở đâu, xoá ảnh |

- Ảnh tải lên được **tự nén** (tối đa 1600px, WebP) rồi lưu vào **Google Drive** khi Xuất bản.
- Trong tiêu đề, đặt chữ trong `*dấu sao*` để hiện **chữ nghiêng màu vàng**, ví dụ `Chăm sóc làn da từ *bên trong*`.
- **Xem trước**: mở website với nội dung đang sửa (thanh “Bản xem trước”) — khách chưa thấy.
- **Xuất bản**: tải ảnh mới lên Drive → lưu mọi phần đã sửa vào Google Sheet → **website hiển thị ngay**. CMS kiểm tra lỗi trước (thiếu tên, đường dẫn trùng, ngày sai, câu từ quảng cáo…) và **báo nếu Sheet vừa bị sửa ở nơi khác** (chọn ghi đè hoặc tải lại).
- **Tổng quan → Tải bản sao lưu (JSON)**: 4 tệp nội dung — chép vào `content/` để bản dự phòng của website luôn mới.

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

## Trang Liên hệ

`#lien-he`: nút gọi hotline, Zalo, email, chỉ đường; biểu mẫu gửi lời nhắn (có ô đồng ý liên hệ lại); thông tin doanh nghiệp; bản đồ Google Maps; câu hỏi thường gặp. Sửa tất cả trong CMS → **Trang Liên hệ**.

## Địa chỉ giao hàng (đơn vị hành chính mới)

Ô địa chỉ ở trang Đặt hàng dùng **2 cấp mới** — Tỉnh/Thành phố → Phường/Xã/Đặc khu (không còn quận/huyện):

- `assets/data/vn-units.json`: 34 tỉnh/thành, 3.321 phường/xã/đặc khu — bộ dữ liệu [vietnamese-provinces-database](https://github.com/ThangLeQuoc/vietnamese-provinces-database) v5.2.0 (theo Nghị quyết 388/NQ-UBTVQH16, cập nhật 20/09/2026), giấy phép MIT.
- `assets/data/vn-old-wards.json`: tra địa chỉ cũ → mới (khách gõ “Phường 12 Gò Vấp” → “Phường An Hội Tây, TP Hồ Chí Minh”) — từ [vietnam-address-database](https://github.com/quangtam/vietnam-address-database), giấy phép MIT. Chỉ tải khi khách bấm tra cứu.
- Tìm không dấu, gõ tắt (`hcm`, `hn`, `sg`…), gõ tên tỉnh cũ (“Bình Dương” → TP Hồ Chí Minh).
- Khách có thể lưu thông tin nhận hàng trên máy của mình để lần sau đặt nhanh hơn.

Khi có thay đổi địa giới mới: chạy `tools/build-vn-address.py` (hướng dẫn ở đầu tệp) rồi tăng `VER` trong `assets/js/vn-address.js`.

## Cửa hàng & nhận đơn

- Giỏ hàng lưu trên trình duyệt của khách. Khi đặt hàng, website gửi đơn tới Google Sheet; máy chủ tính lại tiền và trả **mã đơn** (dạng `NMN-261104-K7Q2M`).
- **Trang Đặt hàng:** khách sửa số lượng / xoá ngay trong phần Đơn hàng. Mục **“Thêm vào đơn”** gợi ý sản phẩm khách chưa chọn (mặc định hiện 2, còn lại sau *Xem thêm*); bấm thẻ mở **cửa sổ xem nhanh**. Bật/tắt, số lượng, tiêu đề: CMS → Cài đặt chung; chọn sản phẩm: CMS → Sản phẩm → “Gợi ý ở mục Thêm vào đơn”.
- **Quản lý đơn hàng** (`/admin/orders.html`, dùng chung Khoá quản trị): danh sách đơn tự cập nhật mỗi 20 giây, báo đơn mới, lọc/tìm, đổi trạng thái xử lý, ghi chú nội bộ, *Đánh dấu đã thanh toán* thủ công, tải CSV, xử lý lời nhắn, xem giao dịch SePay. Mọi thay đổi ghi thẳng vào Google Sheet.
- **Khi chưa có / tạm thời không gọi được Google Sheet:** website dùng nội dung trong `content/` (hoặc bản đã lưu trên máy khách) và khách gửi đơn qua **Zalo** (nội dung đơn được chép sẵn) hoặc gọi hotline.

### Xác nhận chuyển khoản tự động (SePay)

Khách chọn **Chuyển khoản · VietQR** → trang xác nhận đơn hiện mã QR (điền sẵn số tiền + nội dung `NMN…`) → khách quét bằng app ngân hàng → **trang tự chuyển sang “Thanh toán thành công” sau vài giây**; trang tính *Đơn hàng* ghi *Đã thanh toán*.

Cách hoạt động: [SePay](https://sepay.vn) theo dõi biến động số dư tài khoản ngân hàng. Apps Script hỏi **API chính thức của SePay** (mỗi phút, và ngay khi khách đang mở trang chờ — tối đa 1 lần / 3 giây) để tìm giao dịch **tiền vào** có nội dung chứa mã đơn; cộng dồn tiền, đủ tổng tiền → *Đã thanh toán*, thiếu → trang khách hiện “còn thiếu …”. Không cần webhook hay máy chủ riêng.

1. Đăng ký [my.sepay.vn](https://my.sepay.vn), **kết nối tài khoản ngân hàng nhận tiền** (kết nối trực tiếp: Vietcombank, BIDV, VietinBank, MB, ACB, VPBank, TPBank, Sacombank, MSB, OCB, KienlongBank, Shinhan). Gói **Free: 50 giao dịch/tháng** — xem [bảng giá](https://sepay.vn/bang-gia.html).
2. (Khuyên dùng) **Cấu hình công ty → Cấu trúc mã thanh toán**: tiền tố `NMN`.
3. **Cấu hình công ty → API Access → + Thêm API** → sao chép **API token**.
4. Apps Script → ⚙ **Cài đặt dự án → Thuộc tính tập lệnh (Script properties)** → thêm `SEPAY_TOKEN` = token · `SEPAY_ACCOUNT` = số tài khoản nhận tiền → *Lưu*. (Không cần triển khai lại.)
5. CMS → Cài đặt chung → **Chuyển khoản ngân hàng**: Mã ngân hàng (VietQR), Số tài khoản, Chủ tài khoản → bật **Tự động xác nhận đã thanh toán (SePay)** → Xuất bản.
6. Thử: đặt sản phẩm test 5.000đ (`#san-pham/san-pham-test`), chọn Chuyển khoản, quét QR → trang chuyển *Thanh toán thành công*; Quản lý đơn hàng → **Thanh toán · SePay** thấy giao dịch, bấm *Kiểm tra giao dịch ngay* nếu cần.

Nội dung chuyển khoản là mã đơn **không dấu gạch** (ví dụ `NMN261104K7Q2M`) vì nhiều ngân hàng tự bỏ ký tự đặc biệt; máy chủ nhận cả khi ngân hàng chèn khoảng trắng hay đổi chữ hoa/thường.

## Đường dẫn trên website

| Đường dẫn | Trang |
|---|---|
| `#cua-hang` | Cửa hàng |
| `#san-pham/<đường-dẫn>` | Chi tiết sản phẩm |
| `#thanh-toan` | Đặt hàng |
| `#don-hang/<mã>` | Xác nhận đơn |
| `#tin-tuc` | Tin tức & Sự kiện |
| `#bai/<đường-dẫn>`, `#su-kien/<đường-dẫn>` | Một bài viết / sự kiện |
| `#lien-he` | Liên hệ |

## Khi sửa code (CSS/JS)

Tăng số `?v=…` ở các thẻ `<link>`/`<script>` trong `index.html`, `admin/index.html`, `admin/orders.html` để khách nhận bản mới ngay (không cần khi chỉ sửa nội dung qua CMS / Google Sheet).

## Chạy thử trên máy

Website đọc nội dung bằng `fetch`, nên cần mở qua một máy chủ web (không mở trực tiếp file). Với `config.js` đã có link Apps Script, bản chạy trên máy cũng đọc/ghi Google Sheet thật:

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

HTML, CSS, JavaScript thuần (không cần build) · Google Sheets + Google Apps Script (database, API) · Google Drive (ảnh) · SePay API (đối soát chuyển khoản) · [three.js](https://threejs.org) 0.160 · Google Fonts (Lora, Be Vietnam Pro) · VietQR · GitHub Pages.

> Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.
