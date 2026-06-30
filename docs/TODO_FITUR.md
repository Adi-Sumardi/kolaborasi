# TODO Fitur Mendatang

## 🔔 Notifikasi (Belum Diimplementasi)

### Status Saat Ini
**Sudah ada:**
- `jobdesk_assigned` — Jobdesk baru ditugaskan ke karyawan
- `jobdesk_assigned` (update) — Karyawan baru ditambahkan ke jobdesk existing
- `attachment_added` — Karyawan menambah lampiran di jobdesk (notif ke pengurus)
- ✅ `jobdesk_completed` — Karyawan menyelesaikan jobdesk (notif ke admin/owner/pengurus)
- ✅ `submission_late` — Pengumpulan terlambat (notif ke karyawan + admin)

**Infrastruktur siap:**
- Tabel `notifications` ✓
- Real-time Socket.io (`sendNotification`) ✓
- Web Push dengan VAPID (`lib/push-notifications.js`) ✓
- Service Worker handler push ✓

### Yang Perlu Ditambahkan

1. ~~**Notifikasi Jobdesk Selesai**~~ ✅ DONE
   - Trigger saat karyawan ubah status jadi `completed`
   - Penerima: admin/owner/pengurus terkait
   - Lokasi: `handleUpdateJobdeskStatus` di route.js

2. ~~**Reminder Deadline Jobdesk**~~ ✅ DONE
   - `node-cron` runs daily 08:00 WIB (`lib/scheduler.js`)
   - Trigger H-3, H-1, hari-H untuk due_date dan tiap task type
   - Skip task type yang sudah disubmit
   - Idempotent (check 2 hari terakhir untuk hindari duplicate)
   - Type: `deadline_reminder`

3. ~~**Notifikasi Deadline Terlewat**~~ ✅ DONE
   - Sistem sudah deteksi `is_late` di submission, tinggal kirim notif
   - Penerima: karyawan yang assigned + pengurus

4. ~~**Notifikasi Rekap Laporan Deadline**~~ ✅ DONE
   - Reminder khusus karena deadline custom
   - Sama dengan #2 tapi field `rekap_laporan_deadline`

5. ~~**Notifikasi Perubahan Penilaian/KPI**~~ ✅ DONE
   - Saat poin/grade KPI karyawan berubah (oleh Admin saat penyesuaian poin)
   - Penerima: karyawan yang bersangkutan

6. ~~**Notifikasi To-Do**~~ ✅ DONE
   - Reminder due date to-do H-3, H-1, dan hari-H
   - Otomatis dicek oleh scheduler harian

---

## ✅ DONE — Rekap Hasil Jobdesk (Dashboard Admin)

### Konsep
Halaman baru di dashboard admin/owner untuk merekap hasil kerja karyawan.

### Fitur Halaman List
- Tabel/grid daftar karyawan dengan ringkasan jobdesk
- **Filter by nama karyawan** (search/dropdown)
- Filter tambahan opsional:
  - Periode (bulan/tahun)
  - Status (selesai/in-progress/late)
  - Klien
- Klik baris karyawan → buka halaman detail

### Fitur Halaman Detail Karyawan
- Header: info karyawan (nama, role, divisi)
- Daftar **klien yang di-handle** karyawan tersebut (dari jobdesk yang assigned)
  - Group jobdesk by client
- Per jobdesk: tampilkan task types dan submissions
- **Lampiran/file submission:**
  - Preview inline (untuk PDF, image)
  - Tombol download
  - Info: nama file, ukuran, tanggal submit, taskType
- Statistik singkat: total jobdesk, on-time vs late, jumlah lampiran

### Yang Dibutuhkan (Backend)
- Endpoint baru: `GET /api/rekap/karyawan` — list dengan filter
- Endpoint baru: `GET /api/rekap/karyawan/:userId` — detail per karyawan
- Endpoint preview file (kalau belum ada)

### Yang Dibutuhkan (Frontend)
- Komponen baru: `RekapJobdeskPage.jsx`
- Komponen detail: `RekapKaryawanDetail.jsx`
- Modal/preview untuk file
- Akses role: `super_admin`, `owner`, `pengurus`

### Akses Menu
- Tambah ke sidebar di `DashboardApp.jsx`
- Role: admin/owner/pengurus only

---

---

## ✅ DONE — Komentar Admin untuk Jobdesk Selesai

### Konsep
Saat karyawan menyelesaikan jobdesk (status `completed`), admin/owner/pengurus
bisa memberi komentar/review:
- **Komentar di level Jobdesk** (komentar umum untuk seluruh jobdesk)
- **Komentar di level Task Type** (komentar spesifik per jenis tugas, misal komentar
  hanya untuk PPh 21, atau khusus Rekap Laporan)

### Yang Dibutuhkan (Backend)
- Tabel baru: `jobdesk_comments`
  ```sql
  CREATE TABLE jobdesk_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE CASCADE,
    task_type VARCHAR(50), -- NULL = komentar umum jobdesk, non-null = per task type
    comment TEXT NOT NULL,
    commented_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );
  ```
- Endpoint:
  - `POST /api/jobdesks/:id/comments` — body: `{ comment, taskType? }`
  - `GET /api/jobdesks/:id/comments` — list semua komentar
  - `PUT /api/jobdesks/:id/comments/:commentId` — edit (only by author)
  - `DELETE /api/jobdesks/:id/comments/:commentId` — delete (only by author/super_admin)
- Validasi: hanya admin/owner/pengurus bisa add komentar
- Trigger notif ke karyawan saat ada komentar baru (`comment_added`)

### Yang Dibutuhkan (Frontend)
- Di modal Detail Jobdesk:
  - Section komentar di tab Detail (komentar level jobdesk)
  - Section komentar di tiap task type card di tab Hasil Kerja
- Form input komentar (textarea + tombol Kirim)
- List komentar dengan info penulis + timestamp
- Tombol edit/delete untuk komentar sendiri
- Karyawan: read-only (hanya bisa lihat komentar admin)
- Admin: bisa add/edit/delete komentar

### Catatan
- Karyawan yang assigned ke jobdesk dapat notifikasi saat ada komentar baru
- Komentar muncul setelah jobdesk `completed`, atau bisa juga kapan saja (perlu konfirmasi)

---

## ✅ DONE — Filter Group PT di Rincian Klien KPI

### Konsep
Di halaman KPI, bagian **Rincian Klien yang Ditangani** untuk setiap karyawan
harus bisa difilter berdasarkan **group PT**.

### Yang Dibutuhkan
- Pastikan tabel `clients` punya field `group_name` (atau relasi ke groups)
  - Cek migrasi: kalau belum ada, tambah `ALTER TABLE clients ADD COLUMN group_name VARCHAR(255);`
- Backend: endpoint KPI/rincian klien menerima query param `?group=...`
- Frontend (`KPIPageV2.jsx`):
  - Tambah dropdown filter "Group PT" di section Rincian Klien
  - Populate dropdown dari list group unik milik klien yang di-handle karyawan
  - Filter list klien sesuai group yang dipilih
  - Default: "Semua Group"

### Catatan
- Cek dulu apakah field `group_name` sudah ada di tabel clients (di create client form
  ada `groupName` di newClientData — kemungkinan sudah ada kolomnya)
- Filter ini per-karyawan (di card/section masing-masing karyawan), bukan global

---

---

## ✅ DONE — Pagination, Indexing & Filter di Menu Jobdesk

### Konsep
Halaman Jobdesk saat ini memuat semua jobdesk sekaligus. Untuk skala produksi
butuh pagination, indexing DB, dan filter data.

### Yang Dibutuhkan (Backend)
- Endpoint `GET /api/jobdesks` sudah punya `LIMIT`/`OFFSET` — pastikan UI
  pakai
- Tambah filter query params:
  - `status` (pending/in_progress/completed)
  - `clientId`
  - `assignedTo` (user id)
  - `search` (title/description ILIKE)
  - `periodMonth`, `periodYear`
  - `taskType`
- Indexing migrasi:
  - `CREATE INDEX IF NOT EXISTS idx_jobdesks_status ON jobdesks(status);`
  - `CREATE INDEX IF NOT EXISTS idx_jobdesks_client ON jobdesks(client_id);`
  - `CREATE INDEX IF NOT EXISTS idx_jobdesks_period ON jobdesks(period_year, period_month);`
  - `CREATE INDEX IF NOT EXISTS idx_jobdesks_created_at ON jobdesks(created_at DESC);`
  - `CREATE INDEX IF NOT EXISTS idx_assignments_user ON jobdesk_assignments(user_id);`
  - `CREATE INDEX IF NOT EXISTS idx_assignments_jobdesk ON jobdesk_assignments(jobdesk_id);`

### Yang Dibutuhkan (Frontend)
- `JobdeskPage.jsx`:
  - Pagination control (Page 1/N, Prev/Next, page size selector)
  - Filter bar: search input, dropdown status, dropdown klien, dropdown
    karyawan, dropdown periode (bulan/tahun), dropdown task type
  - Reset filter button
- Update `jobdeskAPI.getAll` untuk terima query params

### Catatan
- Perhatikan permission: karyawan hanya lihat jobdesk yang assigned ke dia
- Filter karyawan hanya tampil untuk admin

---

## ✅ DONE — Update/Ganti Email di Menu Pengaturan

### Konsep
Saat ini di Settings, field email karyawan disabled (read-only). Karyawan
harus bisa update emailnya sendiri.

### Yang Dibutuhkan (Backend)
- `handleUpdateUser` sudah support email, tapi self-update dibatasi hanya
  name
- Allow self-update email dengan syarat:
  - Verifikasi password current sebelum ubah
  - Validasi format email
  - Check uniqueness (sudah ada di handler)
  - Optional: kirim email konfirmasi/verifikasi ke email baru sebelum apply
- API helper baru: `userAPI.updateOwnEmail(currentPassword, newEmail)` atau
  perluas `updateOwnProfile` untuk include email + password

### Yang Dibutuhkan (Frontend)
- `SettingsPage.jsx`:
  - Field email jadi editable (atau ada tombol "Ubah Email")
  - Form: current password + new email + confirm new email
  - Toast confirmation
- Logout user setelah email berubah (token mungkin contain email)?
  Atau refresh user data di context

### Catatan
- Pertimbangkan UX: ubah email itu sensitif, mungkin perlu modal khusus
- Pastikan token JWT tetap valid setelah email berubah (cek apa tokennya
  pakai email atau userId saja)

---

## ✅ DONE — Modal Pengingat Task & Deadline saat Login Pertama Karyawan

### Konsep
Ganti modal sekarang yang muncul setelah login karyawan ("Selamat Pagi,
{nama} 👋 Bagaimana perasaanmu hari ini?") dengan modal pengingat task &
deadline.

### Modal Baru
Saat karyawan pertama kali login per hari (atau saat session pertama),
tampilkan ringkasan:
- Greeting "Selamat Pagi/Siang/Sore, {nama} 👋"
- **Daftar task hari ini & yang akan datang:**
  - Jobdesk yang status `in_progress` atau `pending` yang assigned ke dia
  - Per task type yang belum disubmit, urutkan by deadline
  - Sorting: deadline paling dekat dulu
  - Visual:
    - 🔴 Merah: deadline hari ini / sudah lewat
    - 🟡 Kuning: deadline H-3 ke H-1
    - 🟢 Hijau: deadline > H-3
- Tombol "Mulai Bekerja" / "Lihat Semua Jobdesk"

### Yang Dibutuhkan
- Cari komponen modal sekarang (kemungkinan `WelcomeWorkModal` yang udah
  ada di socket events)
- Backend: bisa pakai existing `GET /api/jobdesks` dengan filter
  status != completed, atau buat endpoint khusus yang return upcoming
  deadlines per user
- Frontend:
  - Komponen `MorningReminderModal.jsx`
  - Logic deteksi "first login of the day" (cek `lastLoginAt` di
    localStorage atau session)
  - Hapus/ganti modal mood yang lama
- Helper: hitung deadline per task type pakai logic yang sama di
  `lib/scheduler.js` atau di JobdeskPage

### Catatan
- Pertahankan optional mood selector kalau user tetap mau ada (di
  bawah daftar task)
- Modal hanya muncul sekali per hari (cek tanggal terakhir muncul di
  localStorage)

---

## 🚀 Permintaan Fitur Baru (Update)

1. ~~**Pindah Komentar Admin:** Komentar admin dipindah ke menu Rekap Hasil Jobdesk di detail karyawannya, bukan di menu Jobdesknya.~~ ✅ DONE
2. ~~**Hapus Input Tenggat Waktu:** Di form create jobdesk hapus input tenggat waktu karena sudah tidak relevan.~~ ✅ DONE
3. ~~**Automasi Tanggal Laporan Rekap:** Tanggal Laporan Rekap menjadi otomatis tanggalnya seperti task type, yaitu 1 bulan + 5 (tanggal 5 di bulan berikutnya), mengikuti pola seperti deadline task type.~~ ✅ DONE
4. ~~**History File Lampiran (Dashboard Karyawan):** History file lampiran pada section Portfolio & Lampiran berdasarkan PT di dashboard karyawan masih belum muncul. Tambahkan pagination dan filter.~~ ✅ DONE
5. ~~**Filter Data Hasil Jobdesk:** Tambahkan filter pada Data Hasil Jobdesk agar bisa per bulan, dan pastikan tampilan data sesuai dengan bulan lapor.~~ ✅ DONE
6. ~~**Download KPI Individual:** Pada saat download KPI Individual, tambahkan daftar client PT yang di-handle oleh karyawan.~~ ✅ DONE
7. ~~**Input Jobdesk Otomatis:** Input Jobdesk dan client masih perbulan harus bisa custom biar otomatis tidak create perbulan atau desainkan dulu seperti apa biar karyawan create data jobdesk itu tidak setiap bulan padahal kan clientnya sama.~~ ✅ DONE
8. ~~**Revisi Poin KPI:** Bisa croschek pengurangan poin dan revisi point task type oleh admin. Contohnya bila ada yg sakit dan kemungkinan lainnya dan ada notes atau catatan tambahan oleh karyawan ketika mereka melampirkan file di hasil kerjanya.~~ ✅ DONE
9. ~~**Detail Client di Dashboard KPI:** Menu KPI di dashboard superadmin bisa klik detail karyawan dan didalamnya ada tabel data client client yang di handle dan ini nyambung dengan croschek pengurangan poin dan revisi point task type oleh admin.~~ ✅ DONE
---

## Catatan Implementasi

- Saat implement notifikasi reminder, jangan lupa konfigurasi VAPID keys di production
- Pertimbangkan throttling notif supaya tidak spam (max X notif/hari/user)
- Untuk preview file: gunakan iframe untuk PDF, `<img>` untuk gambar
- Untuk download: gunakan `<a download>` atau API endpoint dengan header `Content-Disposition: attachment`
