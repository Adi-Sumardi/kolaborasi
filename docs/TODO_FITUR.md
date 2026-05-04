# TODO Fitur Mendatang

## 🔔 Notifikasi (Belum Diimplementasi)

### Status Saat Ini
**Sudah ada:**
- `jobdesk_assigned` — Jobdesk baru ditugaskan ke karyawan
- `jobdesk_assigned` (update) — Karyawan baru ditambahkan ke jobdesk existing
- `attachment_added` — Karyawan menambah lampiran di jobdesk (notif ke pengurus)

**Infrastruktur siap:**
- Tabel `notifications` ✓
- Real-time Socket.io (`sendNotification`) ✓
- Web Push dengan VAPID (`lib/push-notifications.js`) ✓
- Service Worker handler push ✓

### Yang Perlu Ditambahkan

1. **Notifikasi Jobdesk Selesai**
   - Trigger saat karyawan ubah status jadi `completed`
   - Penerima: admin/owner/pengurus terkait
   - Lokasi: `handleUpdateJobdeskStatus` di route.js

2. **Reminder Deadline Jobdesk**
   - Butuh scheduler/cron (belum ada di app)
   - Trigger H-3, H-1, dan di hari deadline
   - Untuk task type biasa: deadline = tanggal 5 bulan berikutnya
   - Untuk `rekap_laporan`: pakai `rekap_laporan_deadline` dari jobdesk
   - Bisa pakai `node-cron` atau scheduled job di server.js

3. **Notifikasi Deadline Terlewat**
   - Sistem sudah deteksi `is_late` di submission, tinggal kirim notif
   - Penerima: karyawan yang assigned + pengurus

4. **Notifikasi Rekap Laporan Deadline**
   - Reminder khusus karena deadline custom
   - Sama dengan #2 tapi field `rekap_laporan_deadline`

5. **Notifikasi Perubahan Penilaian/KPI**
   - Saat poin/grade KPI karyawan berubah
   - Penerima: karyawan yang bersangkutan

6. **Notifikasi To-Do**
   - Reminder due date to-do
   - Notif saat to-do di-assign (kalau ada fitur shared todo)

---

## 📊 Rekap Hasil Jobdesk (Dashboard Admin)

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

## 📈 Filter Group PT di Rincian Klien KPI

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

## Catatan Implementasi

- Saat implement notifikasi reminder, jangan lupa konfigurasi VAPID keys di production
- Pertimbangkan throttling notif supaya tidak spam (max X notif/hari/user)
- Untuk preview file: gunakan iframe untuk PDF, `<img>` untuk gambar
- Untuk download: gunakan `<a download>` atau API endpoint dengan header `Content-Disposition: attachment`
