# NMN Regene & PURE NMN 12,000mg+

Website giới thiệu **PURE NMN 12,000mg+** và **NMN Regene**: trang chủ có hiệu ứng 3D khi cuộn, **Cửa hàng – giỏ hàng – đặt hàng**, **Tin tức & Sự kiện**, và **trang quản trị nội dung (CMS)** để thay ảnh, sửa chữ, thêm sản phẩm/bài viết mà không cần sửa code.

- Website: **https://<mã-dự-án>.web.app/** (Firebase Hosting — xem mục *Firebase* bên dưới) · bản cũ: https://lequyducmanh.github.io/nmn-website/
- Quản trị nội dung: **/admin/** · Quản lý đơn hàng: **/admin/orders.html**

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
admin/                  Trang quản trị nội dung (index.html, admin.js) + quản lý đơn hàng (orders.html, orders.js)
functions/              Cloud Functions: /api/orders, /api/contact, /api/status, /api/sepay
firebase.json           Cấu hình Firebase Hosting (+ chuyển /api/** tới Cloud Functions)
firestore.rules         Quy tắc bảo mật Firestore
.github/workflows/      Tự động triển khai lên Firebase mỗi lần đẩy code / xuất bản CMS
tools/                  Công cụ phụ (dữ liệu địa chỉ, Apps Script dự phòng)
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

## Trang Liên hệ

`#lien-he`: nút gọi hotline, Zalo, email, chỉ đường; biểu mẫu gửi lời nhắn (có ô đồng ý liên hệ lại); thông tin doanh nghiệp; bản đồ Google Maps; câu hỏi thường gặp. Sửa tất cả trong CMS → **Trang Liên hệ**.

## Địa chỉ giao hàng (đơn vị hành chính mới)

Ô địa chỉ ở trang Đặt hàng dùng **2 cấp mới** — Tỉnh/Thành phố → Phường/Xã/Đặc khu (không còn quận/huyện):

- `assets/data/vn-units.json`: 34 tỉnh/thành, 3.321 phường/xã/đặc khu — bộ dữ liệu [vietnamese-provinces-database](https://github.com/ThangLeQuoc/vietnamese-provinces-database) v5.2.0 (theo Nghị quyết 388/NQ-UBTVQH16, cập nhật 20/09/2026), giấy phép MIT.
- `assets/data/vn-old-wards.json`: tra địa chỉ cũ → mới (khách gõ “Phường 12 Gò Vấp” → “Phường An Hội Tây, TP Hồ Chí Minh”) — từ [vietnam-address-database](https://github.com/quangtam/vietnam-address-database), giấy phép MIT. Chỉ tải khi khách bấm tra cứu.
- Tìm không dấu, gõ tắt (`hcm`, `hn`, `sg`…), gõ tên tỉnh cũ (“Bình Dương” → TP Hồ Chí Minh).
- Khách có thể lưu thông tin nhận hàng trên máy của mình để lần sau đặt nhanh hơn.

Khi có thay đổi địa giới mới: chạy `tools/build-vn-address.py` (hướng dẫn ở đầu tệp) rồi tăng `VER` trong `assets/js/vn-address.js`.

## Firebase (database + hosting + xác nhận thanh toán realtime)

Website chạy trên **Firebase Hosting**; đơn hàng, lời nhắn, giao dịch lưu ở **Cloud Firestore**; **Cloud Functions** (Singapore) nhận đơn, tính lại tiền theo bảng giá, nhận webhook **SePay**. Trang của khách nghe trực tiếp trạng thái thanh toán → hiện *“Thanh toán thành công”* ngay khi tiền vào.

```
Khách đặt hàng ──POST /api/orders──▶ Cloud Function ──▶ Firestore orders/{mã}, status/{mã CK}
Khách quét QR, chuyển khoản ─▶ Ngân hàng ─▶ SePay ──POST /api/sepay (API Key)──▶ Cloud Function ──▶ status = paid
Trang của khách ◀── nghe status/{mã CK} (realtime) ──┘          Quản lý đơn hàng ◀── nghe orders (realtime)
```

### Cài đặt lần đầu (chủ cửa hàng làm, ~20 phút)

1. **Tạo dự án**: [console.firebase.google.com](https://console.firebase.google.com) → *Add project* (ví dụ `nmn-clastive`). Ghi lại **Project ID**.
2. **Nâng lên gói Blaze** (⚙ → *Usage and billing* → *Modify plan*). Cần cho Cloud Functions; cửa hàng nhỏ thường nằm trong hạn mức miễn phí. Nên đặt *Budget alert* (ví dụ 50.000đ).
3. **Firestore Database** → *Create database* → vị trí **asia-southeast1 (Singapore)** → *Production mode*.
4. **Authentication** → *Get started* → *Sign-in method* → bật **Google**.
5. **Thêm quản trị viên**: Firestore → *Start collection* `admins` → *Document ID* = **email Google của bạn** (ví dụ `ten.cua.ban@gmail.com`) → thêm trường `role` = `owner` → *Save*. Thêm người khác: tạo thêm tài liệu với email của họ.
6. **Tài khoản dịch vụ cho GitHub** ([Google Cloud Console → IAM → Service accounts](https://console.cloud.google.com/iam-admin/serviceaccounts), chọn đúng dự án) → *Create service account* `github-deploy` → cấp các vai trò:
   *Firebase Admin* · *Cloud Functions Admin* · *Cloud Run Admin* · *Service Account User* · *Artifact Registry Administrator* · *Service Usage Admin*
   → mở tài khoản vừa tạo → *Keys* → *Add key* → *JSON* → tải tệp về.
7. **GitHub** → repo `nmn-website` → *Settings* → *Secrets and variables* → *Actions*:
   - tab *Secrets* → *New repository secret*: `FIREBASE_SERVICE_ACCOUNT` = **toàn bộ nội dung tệp JSON** vừa tải (sau đó xoá tệp trên máy).
   - tab *Variables* → *New repository variable*: `FIREBASE_PROJECT_ID` = Project ID ở bước 1.
8. **Triển khai lần đầu**: GitHub → *Actions* → *Deploy Firebase* → *Run workflow* (để tích “Triển khai lại cả Cloud Functions”). Chờ dấu ✓ xanh (~3–5 phút). Website có tại `https://<Project ID>.web.app`.
9. **SePay**: mở `https://<Project ID>.web.app/admin/orders.html` → đăng nhập Google → **Thanh toán · SePay** → *Tạo khoá mới* → nhập số tài khoản → *Lưu*. Rồi trong [my.sepay.vn](https://my.sepay.vn): kết nối tài khoản ngân hàng, **Tích hợp WebHooks → Thêm webhook**: sự kiện *Có tiền vào*, URL = URL webhook trong trang, chứng thực **API Key** = khoá vừa tạo.
10. **CMS** → Cài đặt chung → Chuyển khoản: bật **Tự động xác nhận đã thanh toán (SePay)** → Xuất bản. Thử với sản phẩm test 5.000đ (`#san-pham/san-pham-test`).

Sau đó: mỗi lần **Xuất bản trong CMS** hoặc đẩy code lên `main`, GitHub tự triển khai lại (1–2 phút; Cloud Functions chỉ triển khai lại khi thư mục `functions/` thay đổi). Tên miền riêng: Firebase → Hosting → *Add custom domain*.

### Dữ liệu & bảo mật

| Firestore | Nội dung | Ai đọc được |
|---|---|---|
| `orders/{mã đơn}` | Đơn đầy đủ (khách, địa chỉ, sản phẩm, thanh toán, trạng thái xử lý) | Quản trị viên |
| `status/{mã CK}` | Chỉ trạng thái thanh toán + tổng tiền (không có thông tin khách) | Ai biết đúng mã |
| `payments/{id}` | Giao dịch từ SePay (chống trùng theo id) | Quản trị viên |
| `contacts/{id}` | Lời nhắn trang Liên hệ | Quản trị viên |
| `config/sepay` | Khoá webhook, số tài khoản | Quản trị viên |
| `admins/{email}` | Danh sách quản trị viên | Chỉ sửa trong Console |

- Khách **không ghi trực tiếp** vào database; mọi thứ đi qua Cloud Functions (kiểm tra dữ liệu, **tính lại tiền theo bảng giá**, giới hạn 15 đơn / 10 phút / IP).
- Webhook SePay bắt buộc đúng **API Key**; chỉ tính **tiền vào** đúng **số tài khoản**; giao dịch gửi lại không bị cộng 2 lần.
- Quản lý đơn hàng: xem đơn realtime, lọc/tìm, đổi trạng thái (Mới → Đã xác nhận → Đang giao → Hoàn tất / Huỷ), ghi chú nội bộ, *Đánh dấu đã thanh toán* thủ công, tải CSV, xử lý lời nhắn.

Khi chưa cài Firebase (ví dụ bản GitHub Pages), website vẫn chạy như cũ: đơn gửi qua Zalo hoặc Google Apps Script (mục dưới).

## Cửa hàng & nhận đơn

- Giỏ hàng lưu trên trình duyệt của khách. Khi đặt hàng, website tạo **mã đơn** và trang xác nhận.
- **Trang Đặt hàng:** khách sửa số lượng / xoá ngay trong phần Đơn hàng. Mục **“Thêm vào đơn”** gợi ý sản phẩm khách chưa chọn (mặc định hiện 2, còn lại sau nút *Xem thêm*); bấm vào thẻ hoặc tên sản phẩm mở **cửa sổ xem nhanh** (công dụng, số ĐKSP/XNQC, thành phần, cách dùng, lưu ý) để khách đọc và thêm vào đơn ngay. Bật/tắt, số sản phẩm hiển thị, tiêu đề: CMS → Cài đặt chung; chọn sản phẩm được gợi ý: CMS → Sản phẩm → “Gợi ý ở mục Thêm vào đơn”.
- **Mặc định:** khách gửi đơn qua **Zalo** (nội dung đơn được chép sẵn) hoặc gọi hotline.
- **Nhận đơn tự động vào Google Sheets:** làm theo mục dưới, rồi dán link vào CMS → Cài đặt chung → *Link nhận đơn tự động*.

### (Dự phòng) Nhận đơn vào Google Sheets — khi không dùng Firebase

1. Tạo Google Sheet mới → **Tiện ích mở rộng → Apps Script**. Xoá mã mẫu, dán **toàn bộ** tệp [`tools/google-apps-script.gs`](tools/google-apps-script.gs) → **Lưu**.
2. **Project Settings (⚙) → Script properties → Add**: `SITE_URL` = `https://lequyducmanh.github.io/nmn-website/` (để máy chủ **tính lại tổng tiền theo bảng giá**, không tin số tiền trình duyệt gửi lên).
3. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: *Thực thi với tư cách* **Tôi**, *Người có quyền truy cập* **Bất kỳ ai** → **Triển khai**.
4. Sao chép **URL ứng dụng web** (`https://script.google.com/macros/s/…/exec`) → dán vào CMS → Cài đặt chung → *Link nhận đơn tự động*, và CMS → Trang Liên hệ → *Link nhận lời nhắn tự động*.

Trang tính tự tạo: **Đơn hàng** (có cột *Nội dung CK, Đã nhận, Trạng thái thanh toán, Kiểm tra*), **Thanh toán** (giao dịch ngân hàng), **Liên hệ**.

> Đã dùng đoạn mã cũ? Dán mã mới đè lên rồi **Triển khai → Quản lý triển khai → ✎ Sửa → Phiên bản: Phiên bản mới → Triển khai** (link giữ nguyên). Cột mới được thêm tự động.

### (Dự phòng) Xác nhận chuyển khoản qua Apps Script + SePay

Khách chọn **Chuyển khoản · VietQR** → trang xác nhận đơn hiện mã QR (điền sẵn số tiền + nội dung `NMN…`) → khách quét bằng app ngân hàng → **trang tự chuyển sang “Đã nhận thanh toán” sau vài giây**, trang tính *Đơn hàng* cập nhật *Đã thanh toán*.

Cách hoạt động: [SePay](https://sepay.vn) theo dõi biến động số dư tài khoản ngân hàng của bạn. Apps Script hỏi **API chính thức của SePay** để tìm giao dịch có nội dung trùng mã đơn và **đủ số tiền** (tổng tiền do máy chủ tính lại) — chỉ tiền thật vào tài khoản mới được tính; chuyển thiếu hiện “còn thiếu …”. Không cần webhook, không cần máy chủ riêng.

1. Đăng ký [my.sepay.vn](https://my.sepay.vn), **kết nối tài khoản ngân hàng nhận tiền** (cá nhân hoặc doanh nghiệp; kết nối API trực tiếp: Vietcombank, BIDV, VietinBank, MB, ACB, VPBank, TPBank, Sacombank, MSB, OCB, KienlongBank, Shinhan). Gói **Free: 50 giao dịch/tháng**; gói Startup từ 120.000đ/tháng — xem [bảng giá](https://sepay.vn/bang-gia.html).
2. (Khuyên dùng) **Cấu hình công ty → Cấu trúc mã thanh toán**: tiền tố `NMN`.
3. **Cấu hình công ty → API Access → + Thêm API** → sao chép **API token**. Token có toàn quyền tài khoản SePay: **chỉ dán vào Script properties**, không dán vào website hay CMS.
4. Apps Script → **Script properties**, thêm: `SEPAY_TOKEN` = token vừa tạo · `SEPAY_ACCOUNT` = số tài khoản nhận tiền.
5. Apps Script → **Triggers (⏰) → Add trigger**: hàm `syncPayments` · *Time-driven* · *Minutes timer* · *Every minute* (cập nhật trang tính cả khi khách đã đóng trang).
6. **Triển khai phiên bản mới** (bước “Đã dùng đoạn mã cũ?” ở trên).
7. CMS → Cài đặt chung → **Chuyển khoản ngân hàng**: nhập Mã ngân hàng (VietQR), Số tài khoản, Chủ tài khoản → bật **Tự động xác nhận đã thanh toán (SePay)** → Xuất bản.
8. Thử: đặt 1 đơn, chọn Chuyển khoản, quét QR chuyển tiền thật (hoặc dùng [chế độ thử nghiệm của SePay](https://developer.sepay.vn/en/sepay-webhooks)) → trang đơn hàng chuyển sang *Đã nhận thanh toán*.

Nội dung chuyển khoản là mã đơn **không dấu gạch** (ví dụ `NMN261027K7Q2M`) vì nhiều ngân hàng tự bỏ ký tự đặc biệt.

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

HTML, CSS, JavaScript thuần (không cần build) · Firebase (Hosting, Firestore, Cloud Functions, Authentication) · [three.js](https://threejs.org) 0.160 · Google Fonts (Noto Serif Display, Be Vietnam Pro) · GitHub Git Data API (CMS) · VietQR (mã QR chuyển khoản) · GitHub Pages.

> Thực phẩm này không phải là thuốc, không có tác dụng thay thế thuốc chữa bệnh.
