# QC Otomatis Survei Google Form

Website QC (quality check) otomatis untuk survei Google Form, **tanpa AI/LLM sama sekali**
— murni rule-based / OCR + pengolahan citra klasik. 100% **static site**
(HTML/CSS/JS + library via CDN), **tidak ada backend/server/database**, di-hosting di
GitHub Pages.

Situs punya **dua mode independen**, dipilih dari halaman utama (`index.html`):

- **Mode A** (`mode-a.html`) — cek via **Google Forms API**. Butuh login, hanya bisa
  dipakai pemilik/kolaborator form. Akurat 100% untuk kelengkapan field, status wajib-diisi,
  urutan section, tipe pertanyaan. Tidak bisa cek bold/italic/tampilan visual.
- **Mode B** (`mode-b.html`) — cek via **upload screenshot/PDF** + OCR (Tesseract.js).
  Tidak perlu login/akses ke form asli. *(Fase saat ini: upload → render → OCR → cek
  kelengkapan field. Deteksi bold/italic & PDF beranotasi menyusul di fase berikutnya.)*

Repo: `NikkoNabilValerian/Variansi_Automate_QC`
Rencana GitHub Pages URL: `https://nikkonabilvalerian.github.io/Variansi_Automate_QC/`

---

## 1. Apa yang Bisa & Tidak Bisa Dicek

✅ **Bisa** (100% akurat, dari data terstruktur API):
- Kelengkapan field identitas (NPM, Program Studi, Angkatan, Nama, dll)
- Status wajib-diisi (`required`) tiap field
- Urutan section (Identitas Responden harus sebelum Penutup)
- Tipe pertanyaan (mis. pertanyaan "skala/skor/penilaian" harus grid/scale, bukan free text)
- Duplikasi/typo judul pertanyaan, konten teks vs keyword pedoman

❌ **Tidak bisa** (keterbatasan resmi Google Forms API — API tidak mengekspos data ini):
- Bold / italic / underline pada judul, deskripsi, atau pertanyaan
- Tampilan header (gambar), font & warna tema
- Setting "Collect email addresses" secara pasti (tergantung versi API)

Untuk kebutuhan cek visual, itu di luar cakupan proyek ini (Mode B — file terpisah).

---

## 2. Struktur Folder

```
(root repo)
├── index.html            # Landing page — pemilih Mode A / Mode B
├── mode-a.html            # Halaman Mode A (Forms API) — isi sama seperti index.html versi awal
├── mode-b.html             # Halaman Mode B (upload screenshot/PDF + OCR)
├── rules.json               # Rule Mode A: field_presence & required_check
├── rules-mode-b.json          # Rule Mode B: field_presence (skema sama, terpisah dari Mode A)
├── README.md
├── css/
│   ├── style.css              # Style umum, dipakai bersama Mode A & Mode B
│   ├── landing.css             # Style khusus landing page
│   └── mode-b.css               # Style khusus Mode B (dropzone, preview halaman, dll)
└── js/
    ├── config.js                 # ⚠️ ISI CLIENT_ID DI SINI — dipakai Mode A
    ├── auth.js                    # Login Google Identity Services — Mode A
    ├── formsApi.js                 # Fetch ke forms.googleapis.com — Mode A
    ├── checks.js                    # Rules engine Mode A
    ├── pdfReport.js                  # Generate PDF Mode A (pdf-lib)
    ├── app.js                         # Orkestrasi UI Mode A
    └── modeB/                          # Semua kode Mode B, terisolasi dari Mode A
        ├── configModeB.js                # Konfigurasi Mode B (path rules, bahasa OCR, dll)
        ├── pdfRender.js                    # Wrapper pdf.js: file → canvas per halaman
        ├── ocrEngine.js                     # Wrapper Tesseract.js (OCR Bahasa Indonesia)
        ├── rulesEngine.js                    # Rules engine Mode B (field_presence, fuzzy match)
        └── main.js                            # Orkestrasi UI Mode B
```

Mode A dan Mode B **sepenuhnya terisolasi**: tidak ada file yang di-share kecuali `css/style.css`
(styling generik: card, button, table, alert). Mengedit salah satu mode tidak akan memengaruhi
mode lainnya.

---

## 3. Setup Google Cloud Console (WAJIB sebelum menjalankan)

### 3.1 Buat Project & Aktifkan API
1. Buka [console.cloud.google.com](https://console.cloud.google.com) → **New Project** →
   beri nama, misal `qc-survei-hmdm`.
2. **APIs & Services → Library** → cari **Google Forms API** → klik **Enable**.

### 3.2 OAuth Consent Screen
1. **APIs & Services → OAuth consent screen**.
2. User type: **External**.
3. Isi nama aplikasi, email support (logo opsional).
4. **Scopes** → tambahkan:
   - `https://www.googleapis.com/auth/forms.body.readonly` (paling minim izin — sudah dipakai
     di `js/config.js`, tidak perlu diganti).
5. App masih status **Testing** (belum diverifikasi Google). Tambahkan email calon pengguna
   di **Test users** (maksimal 100 akun tanpa verifikasi). Untuk pemakaian internal organisasi
   ini biasanya cukup.

### 3.3 Buat OAuth Client ID
1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** — isi:
   ```
   https://nikkonabilvalerian.github.io
   ```
   Untuk development lokal, tambahkan juga origin sesuai server lokal Anda, misal:
   ```
   http://localhost:5500
   http://127.0.0.1:5500
   ```
   (Sesuaikan port dengan live server yang Anda pakai.)
4. **Authorized redirect URIs** — kosongkan saja (tidak dipakai, flow-nya token client implicit).
5. Simpan → salin **Client ID** (bentuk `xxxxx.apps.googleusercontent.com`).
   - Client ID **aman** ditaruh publik di kode JS.
   - **JANGAN PERNAH** pakai "Client Secret" di frontend — proyek ini tidak membutuhkannya sama sekali.

### 3.4 Isi Client ID ke Kode
Buka `js/config.js`, ganti baris:
```js
CLIENT_ID: "GANTI_DENGAN_CLIENT_ID_ANDA.apps.googleusercontent.com",
```
dengan Client ID hasil langkah 3.3.

---

## 4. Menjalankan Secara Lokal

Karena Google Identity Services butuh origin `http://` atau `https://` (bukan `file://`),
jalankan lewat static server lokal, misal:

**Opsi A — VS Code Live Server extension**
1. Buka folder `qc-mode-a/` di VS Code.
2. Install extension "Live Server".
3. Klik kanan `index.html` → **Open with Live Server**.
4. Pastikan origin yang muncul (mis. `http://127.0.0.1:5500`) sudah ditambahkan di
   **Authorized JavaScript origins** (langkah 3.3).

**Opsi B — Python**
```bash
cd qc-mode-a
python3 -m http.server 5500
```
Buka `http://localhost:5500` di browser (dan tambahkan origin ini di Google Cloud Console).

---

## 5. Deploy ke GitHub Pages

1. Push seluruh isi folder `qc-mode-a/` ke repo `Variansi_Automate_QC`
   (bisa langsung di root repo, atau di branch/folder sesuai pengaturan Pages Anda).
2. Di repo GitHub → **Settings → Pages** → pilih branch (mis. `main`) dan folder (`/root` atau `/docs`).
3. Setelah aktif, situs akan tersedia di:
   `https://nikkonabilvalerian.github.io/Variansi_Automate_QC/`
4. Pastikan origin ini **sudah** terdaftar di **Authorized JavaScript origins** (langkah 3.3) —
   kalau belum, login Google akan gagal dengan error `origin_mismatch`.

---

## 6. Cara Pakai

Buka situs (`index.html`) → pilih salah satu kartu mode.

### Mode A (`mode-a.html`)
1. Klik **Login dengan Google** → pilih akun yang punya akses Editor/Viewer ke form yang
   mau dicek. (Karena app masih status *Testing*, mungkin muncul warning "Google hasn't
   verified this app" — klik **Advanced → Go to (nama app)** untuk lanjut, ini normal.)
2. Paste **link editor** Google Form (bentuk `https://docs.google.com/forms/d/<FORM_ID>/edit`)
   — bukan link publik hasil publish (`/forms/d/e/.../viewform`).
3. Klik **Cek Form** → sistem fetch struktur form via Forms API, lalu jalankan seluruh rule
   di `rules.json` + cek tambahan (urutan section, tipe pertanyaan skala).
4. Hasil tampil sebagai tabel temuan di halaman.
5. Klik **Download PDF Laporan** untuk mengunduh PDF berisi cover ringkasan + tabel temuan.

### Mode B (`mode-b.html`) — fase saat ini
1. Tidak perlu login. Upload/drag & drop screenshot (PNG/JPG/WEBP) atau PDF tampilan form
   (bisa beberapa file/halaman sekaligus).
2. Klik **Jalankan Pemeriksaan** → sistem merender tiap halaman ke canvas (pdf.js), lalu
   menjalankan OCR Bahasa Indonesia (Tesseract.js) — semua di browser, tidak ada file yang
   terkirim ke server mana pun.
3. Hasil OCR dicek terhadap `rules-mode-b.json` (tipe `field_presence`, dengan toleransi
   typo ringan/fuzzy match) → tabel temuan tampil di halaman.
4. Bisa buka panel "Lihat teks mentah hasil OCR" untuk verifikasi manual kualitas pembacaan.
5. **Belum tersedia di fase ini**: deteksi bold/italic (`style_check`), anotasi kotak merah,
   dan download PDF hasil QC beranotasi — menyusul di iterasi berikutnya.

---

## 7. Menambah/Mengubah Rule

Edit `rules.json`. Dua tipe rule yang didukung:

- `field_presence` — cek keberadaan teks/field berdasarkan `match_keywords` (dicocokkan ke
  judul form, deskripsi form, judul & deskripsi tiap item, case-insensitive, substring match).
- `required_check` — cek apakah field yang cocok dengan `match_keywords` sudah `required: true`
  (atau `expected_required` sesuai yang di-set).

Contoh menambah rule baru untuk field "Email":
```json
{
  "id": "identitas-email",
  "section": "Identitas Responden",
  "type": "field_presence",
  "match_keywords": ["email", "e-mail"],
  "severity": "wajib",
  "pedoman_ref": "Bag. Identitas Responden",
  "message_template": "Field 'Email' tidak ditemukan pada form."
}
```
Tidak perlu ubah kode JS — `checks.js` membaca `rules.json` secara dinamis.

Cek struktural lain (urutan section, tipe pertanyaan skala) ada langsung di kode
(`js/checks.js` — fungsi `checkSectionOrder` dan `checkScaleUsesGrid`) karena logikanya
lebih dari sekadar keyword matching.

---

## 8. Batasan Kuota & Praktis

- Google Forms API punya quota per project (cukup besar untuk pemakaian internal).
- Token OAuth **expired ±1 jam**. Kalau muncul error 401 saat "Cek Form", klik **Login**
  ulang lalu coba lagi — token disimpan hanya di memori JS (tidak di localStorage), demi keamanan.
- Error 403 = akun yang login tidak punya akses Editor/Viewer ke form tersebut.
- Error 404 = Form ID salah, atau link yang dipaste adalah link publik (bukan link editor).

---

## 9. Keamanan

- Tidak ada Client Secret di mana pun dalam kode ini.
- Token akses hanya disimpan di variabel JS (memori tab browser), hilang saat tab ditutup/refresh.
- Scope OAuth yang dipakai (`forms.body.readonly`) hanya izin baca struktur form — tidak bisa
  mengedit/menghapus apa pun di form pengguna.
