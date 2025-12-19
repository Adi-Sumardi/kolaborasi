# Desain Sistem Tenggat Waktu Per Jenis Tugas Pajak

## Overview

Sistem ini menambahkan tenggat waktu otomatis per jenis tugas pajak pada setiap jobdesk. Setiap lampiran/submission yang dikumpulkan akan dicek apakah tepat waktu atau terlambat, dan mempengaruhi perhitungan KPI.

---

## 1. Aturan Tenggat Waktu

### Grup A: Tenggat Tanggal 20 Bulan Berikutnya
| Jenis Tugas | ID | Deadline | Potongan Telat |
|-------------|-----|----------|----------------|
| PPh 21 | `pph_21` | Tgl 20 bulan berikutnya | -5 poin |
| PPh Unifikasi | `pph_unifikasi` | Tgl 20 bulan berikutnya | -5 poin |
| PPh 25 Angsuran | `pph_25` | Tgl 20 bulan berikutnya | -5 poin |
| PPh Badan | `pph_badan` | Tgl 20 bulan berikutnya | -5 poin |
| PPh 0,5% | `pph_05` | Tgl 20 bulan berikutnya | -5 poin |

### Grup B: Tenggat Akhir Bulan + 7 Hari
| Jenis Tugas | ID | Deadline | Potongan Telat |
|-------------|-----|----------|----------------|
| PPN | `ppn` | Tgl (akhir bulan + 7) bulan berikutnya | -5 poin |

**Contoh Perhitungan:**
- Jobdesk periode **November 2024**
- PPh 21, PPh Unifikasi, PPh 25, PPh Badan, PPh 0,5%: deadline **20 Desember 2024**
- PPN: deadline **7 Januari 2025** (akhir November = 30, +7 hari = 7 Desember masuk ke Januari)

Koreksi perhitungan PPN:
- November 2024 punya 30 hari
- Bulan berikutnya = Desember 2024
- Tanggal 28 + 7 = 35, jika > hari terakhir bulan, maka masuk bulan berikutnya
- Sebenarnya: akhir bulan Desember + 7 hari = **7 Januari 2025** ❌

Perhitungan yang benar berdasarkan request user:
- "Tenggat waktu tgl 28 + 7 hari bulan berikutnya"
- Periode November 2024 → Bulan berikutnya = Desember 2024
- Tanggal 28 Desember 2024 + 7 hari = **4 Januari 2025**

---

## 2. Database Schema Updates

### Tabel Baru: `task_type_submissions`
Menyimpan status submission per jenis tugas dengan tracking waktu.

```sql
CREATE TABLE IF NOT EXISTS task_type_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE CASCADE,
  task_type VARCHAR(50) NOT NULL,  -- pph_21, pph_unifikasi, pph_25, ppn, pph_badan, pph_05
  deadline DATE NOT NULL,           -- auto-calculated based on period_month/year
  submitted_at TIMESTAMP WITH TIME ZONE,
  submitted_by UUID REFERENCES users(id),
  is_late BOOLEAN DEFAULT false,
  late_days INTEGER DEFAULT 0,
  deduction_points INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',  -- pending, submitted, late
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(jobdesk_id, task_type)
);

CREATE INDEX idx_task_type_submissions_jobdesk ON task_type_submissions(jobdesk_id);
CREATE INDEX idx_task_type_submissions_deadline ON task_type_submissions(deadline);
CREATE INDEX idx_task_type_submissions_status ON task_type_submissions(status);
```

### Alternatif: Update Existing Table
Tambah kolom pada `jobdesk_submissions`:

```sql
ALTER TABLE jobdesk_submissions ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE jobdesk_submissions ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false;
ALTER TABLE jobdesk_submissions ADD COLUMN IF NOT EXISTS late_days INTEGER DEFAULT 0;
```

**Rekomendasi:** Gunakan alternatif (update existing table) karena lebih sederhana.

---

## 3. Fungsi Helper: Kalkulasi Deadline

```javascript
// lib/taxDeadlines.js

/**
 * Menghitung deadline berdasarkan jenis tugas dan periode
 * @param {string} taskType - ID jenis tugas (pph_21, ppn, etc)
 * @param {number} periodMonth - Bulan periode (1-12)
 * @param {number} periodYear - Tahun periode
 * @returns {Date} - Tanggal deadline
 */
export function calculateTaskDeadline(taskType, periodMonth, periodYear) {
  // Bulan berikutnya
  let nextMonth = periodMonth + 1;
  let nextYear = periodYear;

  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear++;
  }

  if (taskType === 'ppn') {
    // PPN: Tanggal 28 + 7 hari di bulan berikutnya
    // Mulai dari tanggal 28 bulan berikutnya, tambah 7 hari
    const startDate = new Date(nextYear, nextMonth - 1, 28);
    startDate.setDate(startDate.getDate() + 7);
    return startDate;
  } else {
    // PPh 21, PPh Unifikasi, PPh 25, PPh Badan, PPh 0,5%: Tanggal 20 bulan berikutnya
    return new Date(nextYear, nextMonth - 1, 20);
  }
}

/**
 * Cek apakah submission terlambat
 * @param {Date} submittedAt - Waktu submission
 * @param {Date} deadline - Deadline
 * @returns {{ isLate: boolean, lateDays: number, deduction: number }}
 */
export function checkLateness(submittedAt, deadline) {
  const subDate = new Date(submittedAt);
  const deadlineDate = new Date(deadline);

  // Set ke akhir hari untuk deadline (23:59:59)
  deadlineDate.setHours(23, 59, 59, 999);

  if (subDate <= deadlineDate) {
    return { isLate: false, lateDays: 0, deduction: 0 };
  }

  // Hitung selisih hari
  const diffTime = subDate.getTime() - deadlineDate.getTime();
  const lateDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    isLate: true,
    lateDays,
    deduction: 5  // Potongan 5 poin per jenis tugas yang telat
  };
}

/**
 * Get deadline info untuk semua task types dalam satu jobdesk
 */
export function getJobdeskDeadlines(taskTypes, periodMonth, periodYear) {
  return taskTypes.map(taskType => ({
    taskType,
    deadline: calculateTaskDeadline(taskType, periodMonth, periodYear),
    label: getTaskTypeLabel(taskType)
  }));
}

const TASK_TYPE_LABELS = {
  pph_21: 'PPh 21',
  pph_unifikasi: 'PPh Unifikasi',
  pph_25: 'PPh 25 Angsuran',
  ppn: 'PPN',
  pph_badan: 'PPh Badan',
  pph_05: 'PPh 0,5%'
};

export function getTaskTypeLabel(taskType) {
  return TASK_TYPE_LABELS[taskType] || taskType;
}
```

---

## 4. Update Alur Submission

### A. Saat Membuat Submission
1. Ambil `period_month` dan `period_year` dari jobdesk
2. Hitung deadline berdasarkan `task_type`
3. Bandingkan waktu submission dengan deadline
4. Set `is_late`, `late_days`, dan `deadline` pada submission
5. Simpan ke database

### B. API Flow
```
POST /api/jobdesks/{id}/submissions
Body: { taskType, content, ... }

1. Get jobdesk (period_month, period_year)
2. Calculate deadline = calculateTaskDeadline(taskType, period_month, period_year)
3. Check lateness = checkLateness(now, deadline)
4. Insert submission with:
   - deadline
   - is_late
   - late_days
```

---

## 5. Integrasi dengan KPI

### Update Perhitungan KPI di `handleGetKpiV2`

```javascript
// Untuk setiap jobdesk yang selesai:
// 1. Ambil semua submissions
// 2. Cek masing-masing task_type apakah telat
// 3. Hitung total potongan

const submissionsResult = await query(`
  SELECT DISTINCT task_type, is_late, late_days
  FROM jobdesk_submissions
  WHERE jobdesk_id = $1 AND is_late = true
`, [jobdeskId]);

// Setiap task_type yang telat = -5 poin
const taskTypeDeduction = submissionsResult.rows.length * 5;
```

### Formula KPI Baru

```
Base Point per Jobdesk = 100
Potongan Keterlambatan Jobdesk = -5 (jika selesai setelah due_date jobdesk)
Potongan Per Task Type Telat = -5 × jumlah_task_type_telat
Potongan Surat Teguran = -5 per surat
Potongan SP2DK = -5 per surat

Final Point = 100 - potongan_keterlambatan - potongan_task_type - potongan_surat_teguran - potongan_sp2dk
```

**Contoh:**
- Jobdesk dengan 3 task types (PPh 21, PPh Unifikasi, PPN)
- PPh 21 dikumpulkan tepat waktu
- PPh Unifikasi dikumpulkan terlambat 2 hari
- PPN dikumpulkan terlambat 5 hari
- Tidak ada surat teguran/SP2DK

```
Final Point = 100 - 0 - (2 × 5) - 0 - 0 = 90
```

---

## 6. UI Updates

### A. JobdeskPage - Tampilan Deadline per Task Type

Di modal "Lihat Detail" > Tab "Hasil Kerja", tampilkan deadline untuk setiap task type:

```jsx
{/* Task Type Header with Deadline */}
<div className="p-3 flex items-center justify-between">
  <div className="flex items-center gap-2">
    <Badge>{taskType.label}</Badge>
    <span className="text-xs text-gray-500">
      Deadline: {formatDate(deadline)}
    </span>
    {isOverdue && (
      <Badge className="bg-red-100 text-red-800">Terlambat</Badge>
    )}
  </div>
</div>
```

### B. Submission List - Status Keterlambatan

```jsx
{submission.isLate && (
  <Badge className="bg-orange-100 text-orange-800">
    Terlambat {submission.lateDays} hari (-5 poin)
  </Badge>
)}
```

### C. KPI Table - Rincian Potongan Task Type

Tambah kolom baru di tabel KPI:

| Klien | Jobdesk | Task Type Telat | Potongan Task | Skor Akhir |
|-------|---------|-----------------|---------------|------------|
| PT ABC | Laporan Nov | PPh Unifikasi, PPN | -10 | 85 |

---

## 7. Implementasi Bertahap

### Phase 1: Database & Helper (30 menit)
1. Tambah kolom di `jobdesk_submissions`: `deadline`, `is_late`, `late_days`
2. Buat `lib/taxDeadlines.js`

### Phase 2: API Updates (45 menit)
1. Update `handleCreateJobdeskSubmission` untuk auto-calculate deadline
2. Update `handleUploadSubmissionFile` untuk include deadline logic
3. Update `handleGetKpiV2` untuk include task type deductions

### Phase 3: UI Updates (60 menit)
1. Update JobdeskPage - tampilkan deadline per task type
2. Update JobdeskPage - tampilkan status keterlambatan submission
3. Update KPIPageV2 - tampilkan rincian potongan task type

---

## 8. Contoh Query KPI dengan Task Type Deduction

```sql
-- Get task type lateness per jobdesk
WITH task_lateness AS (
  SELECT
    js.jobdesk_id,
    COUNT(DISTINCT js.task_type) FILTER (WHERE js.is_late = true) as late_task_count,
    SUM(CASE WHEN js.is_late THEN 5 ELSE 0 END) as task_deduction
  FROM jobdesk_submissions js
  GROUP BY js.jobdesk_id
)
SELECT
  j.id,
  j.title,
  100 as base_point,
  COALESCE(tl.task_deduction, 0) as task_type_deduction,
  100 - COALESCE(tl.task_deduction, 0) as final_point
FROM jobdesks j
LEFT JOIN task_lateness tl ON j.id = tl.jobdesk_id
WHERE j.status = 'completed';
```

---

## 9. Catatan Penting

1. **Deadline hanya berlaku jika jobdesk punya period_month dan period_year**
   - Jika tidak ada periode, deadline tidak di-enforce

2. **Submission pertama untuk task_type yang menentukan keterlambatan**
   - Jika ada multiple submissions untuk satu task_type, yang pertama yang dihitung

3. **Potongan per task_type, bukan per submission**
   - Contoh: 3 file untuk PPh 21 yang semuanya telat = tetap -5, bukan -15

4. **Grace period**
   - Deadline dihitung sampai akhir hari (23:59:59)
   - Submission tanggal 20 pukul 23:59 masih tepat waktu

---

## Approval Checklist

- [ ] Setuju dengan aturan deadline (PPh: tgl 20, PPN: tgl 28+7)?
- [ ] Setuju potongan -5 poin per task type yang telat?
- [ ] Perlu fitur override deadline manual untuk kasus khusus?
- [ ] Perlu notifikasi mendekati deadline?
