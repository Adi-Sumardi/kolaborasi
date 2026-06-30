'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { monitoringAPI, userAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  BarChart2, FileSpreadsheet, CheckCircle2, Clock, AlertTriangle, Users
} from 'lucide-react';

const MONTHS = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

const TASK_LABELS = {
  pph_21:         'PPh 21',
  pph_unifikasi:  'PPh Unifikasi',
  pph_25:         'PPh 25',
  ppn:            'PPN',
  pph_badan:      'PPh Badan',
  pph_05:         'PPh 0,5%',
  rekap_laporan:  'Rekap Laporan',
  laporan_tahunan:'Laporan Tahunan',
  billing_klien:  'Billing ke Klien',
};

// Task types yang muncul sebagai "Jenis Pajak" (exclude rekap & billing yang sudah punya kolom sendiri)
const TAX_TASK_TYPES = ['pph_21','pph_unifikasi','pph_25','ppn','pph_badan','pph_05','laporan_tahunan'];

// Kolom pajak untuk tabel & Excel (urutan sesuai screenshot)
// jtBayarType: '15' = tgl 15 bln berikut, 'akhir_bulan' = akhir bln berikut
const TAX_COLS = [
  { key: 'pph_21',        label: 'PPh 21',         jtBayarType: '15' },
  { key: 'pph_unifikasi', label: 'PPh Unifikasi',  jtBayarType: '15' },
  { key: 'pph_05',        label: 'PPh Final UMKM', jtBayarType: '15' },
  { key: 'pph_25',        label: 'PPh 25',         jtBayarType: '15' },
  { key: 'ppn',           label: 'PPN',            jtBayarType: 'akhir_bulan' },
];

function getJtBayar(jtBayarType, periodMonth, periodYear) {
  if (!periodMonth || !periodYear) return null;
  let nextMonth = parseInt(periodMonth) + 1;
  let nextYear = parseInt(periodYear);
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }
  if (jtBayarType === 'akhir_bulan') {
    return new Date(nextYear, nextMonth, 0); // day-0 trick = akhir bulan nextMonth
  }
  return new Date(nextYear, nextMonth - 1, parseInt(jtBayarType));
}

function jtBayarLabel(jtBayarType) {
  return jtBayarType === 'akhir_bulan' ? 'JT: akhir bln' : `JT: tgl ${jtBayarType}`;
}

function getTaxTypes(taskTypes) {
  if (!taskTypes || !taskTypes.length) return [];
  return taskTypes.filter(t => TAX_TASK_TYPES.includes(t));
}

function fmtDateShort(d) {
  if (!d) return '-';
  const date = d.includes('T') ? new Date(d) : new Date(d + 'T00:00:00');
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function DateCell({ value, jt }) {
  if (!value && !jt) return <span className="text-gray-400 text-xs">-</span>;
  const done = !!value;
  const jtDate = jt ? new Date(jt.includes('T') ? jt : jt + 'T00:00:00') : null;
  const valueDate = value ? new Date(value.includes('T') ? value : value + 'T00:00:00') : null;
  const today = new Date(new Date().toDateString());
  const isLate = done && jtDate && valueDate > jtDate;
  const isOverdueNow = !done && jtDate && jtDate < today;
  const daysLeft = !done && jtDate ? Math.ceil((jtDate - today) / (1000 * 60 * 60 * 24)) : null;

  return (
    <div className="text-xs space-y-0.5">
      <div className={`font-medium ${isLate ? 'text-red-600' : done ? 'text-green-600' : 'text-gray-400'}`}>
        {done ? (
          <span className="flex items-center gap-1">
            {isLate ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            {fmtDateShort(value)}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-gray-400">
            <Clock className="w-3 h-3" /> Belum
          </span>
        )}
      </div>
      {jt && (
        <div className={`${isOverdueNow ? 'text-red-500 font-semibold' : daysLeft !== null && daysLeft <= 3 ? 'text-orange-500' : 'text-gray-400'}`}>
          JT: {fmtDateShort(jt)}
          {!done && daysLeft !== null && (
            <span className="ml-1">
              {daysLeft < 0 ? `(${Math.abs(daysLeft)}hr lewat)` : daysLeft === 0 ? '(hari ini)' : `(${daysLeft}hr)`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function rowStatus(row) {
  const all = [
    { done: !!row.tglLapor, jt: row.jtLapor },
    { done: !!row.tglKirimKlien, jt: row.jtKirimKlien },
    { done: !!row.tglBayar, jt: row.jtBayar },
    { done: !!row.tglReport, jt: row.jtReport },
  ];
  const today = new Date(new Date().toDateString());
  const anyLate = all.some(x => !x.done && x.jt && new Date(x.jt.includes('T') ? x.jt : x.jt + 'T00:00:00') < today);
  const allDone = all.every(x => x.done);
  if (allDone) return { label: 'Selesai', color: 'bg-green-100 text-green-700' };
  if (anyLate) return { label: 'Terlambat', color: 'bg-red-100 text-red-700' };
  return { label: 'On Progress', color: 'bg-yellow-100 text-yellow-700' };
}

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

export default function StaffOutputMonitorPage({ user }) {
  const [picList, setPicList] = useState([]);
  const [selectedPic, setSelectedPic] = useState('all');
  const [filterMonth, setFilterMonth] = useState(String(currentMonth));
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const years = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) years.push(y);

  useEffect(() => {
    userAPI.getList().then(r => {
      const staff = (r.users || []).filter(u => !['super_admin', 'owner'].includes(u.role));
      setPicList(staff);
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!filterMonth || !filterYear) return;
    setLoading(true);
    try {
      const params = { periodMonth: filterMonth, periodYear: filterYear };
      if (selectedPic && selectedPic !== 'all') params.picUserId = selectedPic;
      const res = await monitoringAPI.getStaffOutput(params);
      setData(res.data || []);
    } catch {
      toast.error('Gagal memuat data monitoring');
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear, selectedPic]);

  useEffect(() => { load(); }, [load]);

  const handleExportExcel = async () => {
    if (data.length === 0) { toast.error('Tidak ada data untuk diekspor'); return; }
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Kolaborasi App';
      workbook.created = new Date();

      const monthLabel = `${MONTHS[parseInt(filterMonth) - 1]} ${filterYear}`;

      // TAX_COLS is defined at module level
      // Sub-kolom per jenis pajak: 4 kolom
      const SUB = ['Billing dikirim ke klien', 'Tanggal Bayar', 'Tanggal Lapor', 'Nilai KB/LB'];

      // Layout: A-F (6 fixed) + 5 tax × 4 sub = 20 + 2 Report Internal = 28 cols total
      // A B C D E F | G H I J | K L M N | O P Q R | S T U V | W X Y Z | AA AB
      const numToCol = (n) => {
        let s = '';
        while (n > 0) {
          s = String.fromCharCode(64 + (n % 26 || 26)) + s;
          n = Math.floor((n - 1) / 26);
        }
        return s;
      };

      const FIXED = 6;
      const TAX_SUBCOLS = 4;
      const REPORT_COLS = 2;
      const TOTAL_COLS = FIXED + TAX_COLS.length * TAX_SUBCOLS + REPORT_COLS; // 28

      const colLetter = (idx) => numToCol(idx); // 1-based

      const buildSheet = (wb, picData, sheetName) => {
        const sheet = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', xSplit: 6, ySplit: 3 }] });

        // Set column widths
        sheet.getColumn(1).width = 5;   // No
        sheet.getColumn(2).width = 16;  // Nama PIC
        sheet.getColumn(3).width = 22;  // Nama Klien
        sheet.getColumn(4).width = 14;  // Group
        sheet.getColumn(5).width = 11;  // Bulan/Masa
        sheet.getColumn(6).width = 28;  // Jenis Kewajiban
        for (let t = 0; t < TAX_COLS.length; t++) {
          for (let s = 0; s < TAX_SUBCOLS; s++) {
            const colIdx = FIXED + t * TAX_SUBCOLS + s + 1;
            sheet.getColumn(colIdx).width = s === 3 ? 12 : 14; // Nilai KB/LB lebih sempit
          }
        }
        sheet.getColumn(FIXED + TAX_COLS.length * TAX_SUBCOLS + 1).width = 14; // Tanggal Submit
        sheet.getColumn(FIXED + TAX_COLS.length * TAX_SUBCOLS + 2).width = 14; // Tanggal JT

        // --- Row 1: Title ---
        sheet.mergeCells(`A1:${colLetter(TOTAL_COLS)}1`);
        Object.assign(sheet.getCell('A1'), {
          value: `MONITORING OUTPUT STAFF — ${monthLabel.toUpperCase()}`,
          font: { bold: true, size: 13, color: { argb: 'FF1E3A5F' } },
          alignment: { horizontal: 'center', vertical: 'middle' },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } },
        });
        sheet.getRow(1).height = 28;

        const mkBorder = (color = 'FF1E40AF') => ({
          top: { style: 'thin', color: { argb: color } },
          bottom: { style: 'thin', color: { argb: color } },
          left: { style: 'thin', color: { argb: color } },
          right: { style: 'thin', color: { argb: color } },
        });

        const singleHdr = {
          font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } },
          border: mkBorder(),
        };
        const groupHdr = {
          ...singleHdr,
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } },
        };
        const subHdr = {
          font: { bold: true, size: 8, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } },
          border: mkBorder(),
        };
        const reportHdr = {
          ...groupHdr,
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } },
        };

        // --- Row 2-3: Fixed column headers (merge row 2+3) ---
        const fixedLabels = ['No', 'Nama PIC', 'Nama Klien', 'Group', 'Bulan/\nMasa', 'Jenis\nKewajiban'];
        fixedLabels.forEach((label, i) => {
          const col = colLetter(i + 1);
          sheet.mergeCells(`${col}2:${col}3`);
          Object.assign(sheet.getCell(`${col}2`), { ...singleHdr, value: label });
        });

        // --- Row 2: Tax group headers (merge 4 sub-cols each) ---
        TAX_COLS.forEach((tax, t) => {
          const startCol = FIXED + t * TAX_SUBCOLS + 1;
          const endCol = startCol + TAX_SUBCOLS - 1;
          sheet.mergeCells(`${colLetter(startCol)}2:${colLetter(endCol)}2`);
          Object.assign(sheet.getCell(`${colLetter(startCol)}2`), { ...groupHdr, value: tax.label });
        });

        // --- Row 2: Report Internal header (merge 2 cols) ---
        const riStart = FIXED + TAX_COLS.length * TAX_SUBCOLS + 1;
        sheet.mergeCells(`${colLetter(riStart)}2:${colLetter(riStart + 1)}2`);
        Object.assign(sheet.getCell(`${colLetter(riStart)}2`), { ...reportHdr, value: 'Report Internal' });

        // --- Row 3: Sub-headers per tax type ---
        TAX_COLS.forEach((tax, t) => {
          SUB.forEach((subLabel, s) => {
            const colIdx = FIXED + t * TAX_SUBCOLS + s + 1;
            // Sub-col 2 (Tanggal Bayar): tampilkan JT sesuai jenis pajak
            const label = s === 1
              ? `Tanggal Bayar\n(${tax.jtBayarType === 'akhir_bulan' ? 'JT: akhir bln' : `JT: tgl ${tax.jtBayarType}`})`
              : subLabel;
            Object.assign(sheet.getCell(`${colLetter(colIdx)}3`), { ...subHdr, value: label });
          });
        });
        // Report Internal sub-headers
        Object.assign(sheet.getCell(`${colLetter(riStart)}3`), { ...subHdr, value: 'Tanggal Submit' });
        Object.assign(sheet.getCell(`${colLetter(riStart + 1)}3`), { ...subHdr, value: 'Tanggal JT' });

        sheet.getRow(2).height = 22;
        sheet.getRow(3).height = 18;

        // --- Data rows ---
        const borderCell = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        };
        const fmtD = (d) => {
          if (!d) return '';
          const date = typeof d === 'string' ? new Date(d.includes('T') ? d : d + 'T00:00:00') : new Date(d);
          return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };
        const toDate = (d) => d ? new Date(typeof d === 'string' && !d.includes('T') ? d + 'T00:00:00' : d) : null;
        const lateFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        const overdueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
        const doneFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDF4' } };
        const today = new Date(new Date().toDateString());

        let rowNum = 4;
        let no = 1;

        for (const pic of picData) {
          for (const client of pic.clients) {
            const subs = client.submissionsByType || {};
            const taskSet = new Set(client.taskTypes || []);

            // Jenis Kewajiban: daftar pajak yang diceklist
            const kewajibanList = TAX_COLS
              .filter(t => taskSet.has(t.key))
              .map(t => t.label)
              .join(', ') || 'Sesuai yang diceklist PIC';

            const row = sheet.getRow(rowNum);
            row.height = 18;

            // Fixed cols (1-6)
            const fixedVals = [
              no++, pic.picName, client.clientName, client.groupName || '-',
              `${MONTHS[(client.periodMonth || 1) - 1]}-${String(client.periodYear).slice(2)}`,
              kewajibanList,
            ];
            fixedVals.forEach((val, i) => {
              const cell = row.getCell(i + 1);
              cell.value = val;
              cell.border = borderCell;
              cell.font = { size: 9 };
              cell.alignment = { vertical: 'middle', horizontal: i < 2 ? 'center' : 'left', wrapText: i === 5 };
            });

            // Tax type cols
            TAX_COLS.forEach((tax, t) => {
              const startCol = FIXED + t * TAX_SUBCOLS + 1;
              const hasTax = taskSet.has(tax.key);
              const sub = subs[tax.key];
              const tglLapor = sub?.tglLapor || null;
              const isLate = sub?.isLate || false;
              const jtBayarDate = getJtBayar(tax.jtBayarType, client.periodMonth, client.periodYear);

              const tglKirim    = hasTax ? fmtD(client.tglKirimKlien) : '';
              const tglBayar    = hasTax ? fmtD(client.tglBayar) : '';
              const tglLaporFmt = hasTax ? fmtD(tglLapor) : '';
              const nilaiKBLB   = '';

              const vals = [tglKirim, tglBayar, tglLaporFmt, nilaiKBLB];
              vals.forEach((val, s) => {
                const colIdx = startCol + s;
                const cell = row.getCell(colIdx);
                cell.value = val;
                cell.border = borderCell;
                cell.font = { size: 9 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };

                if (!hasTax) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
                } else if (s === 1) {
                  // Tanggal Bayar: JT per jenis pajak
                  if (client.tglBayar) {
                    const bayarDate = toDate(client.tglBayar);
                    cell.fill = (jtBayarDate && bayarDate > jtBayarDate) ? lateFill : doneFill;
                  } else if (jtBayarDate && jtBayarDate < today) {
                    cell.fill = overdueFill;
                  }
                } else if (s === 2 && tglLapor) {
                  cell.fill = isLate ? lateFill : doneFill;
                } else if (s === 0 && client.tglKirimKlien) {
                  const jtDate = toDate(client.jtKirimKlien);
                  const sentDate = toDate(client.tglKirimKlien);
                  cell.fill = (jtDate && sentDate > jtDate) ? lateFill : doneFill;
                } else if (s === 0 && !client.tglKirimKlien && hasTax) {
                  const jtDate = toDate(client.jtKirimKlien);
                  if (jtDate && jtDate < today) cell.fill = overdueFill;
                }
              });
            });

            // Report Internal cols
            const tglSubmit = fmtD(client.tglLapor);
            const tglJT = client.jtReport ? fmtD(client.jtReport) : '';
            [tglSubmit, tglJT].forEach((val, s) => {
              const cell = row.getCell(riStart + s);
              cell.value = val;
              cell.border = borderCell;
              cell.font = { size: 9 };
              cell.alignment = { horizontal: 'center', vertical: 'middle' };
              if (s === 0 && tglSubmit) {
                const jtDate = toDate(client.jtReport);
                const lapDate = toDate(client.tglLapor);
                cell.fill = (jtDate && lapDate && lapDate > jtDate) ? lateFill : doneFill;
              } else if (s === 0 && !tglSubmit) {
                const jtDate = toDate(client.jtReport);
                if (jtDate && jtDate < today) cell.fill = overdueFill;
              }
            });

            rowNum++;
          }
        }

        // Legend
        rowNum += 2;
        sheet.getCell(`A${rowNum}`).value = 'Keterangan:';
        sheet.getCell(`A${rowNum}`).font = { bold: true, size: 8 };
        rowNum++;
        [
          ['FFF0FDF4', 'Sudah dikerjakan / On Time'],
          ['FFFEE2E2', 'Terlambat dari JT'],
          ['FFFDE68A', 'Belum dikerjakan & sudah lewat/mendekati JT'],
          ['FFF3F4F6', 'Jenis pajak tidak berlaku untuk klien ini'],
        ].forEach(([color, desc]) => {
          const cell = sheet.getCell(`A${rowNum}`);
          cell.value = `  ${desc}`;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
          cell.font = { size: 8 };
          rowNum++;
        });

        // Footnote: tanggal & waktu ekspor
        rowNum += 2;
        const exportedAt = new Date().toLocaleString('id-ID', {
          day: '2-digit', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
        const noteCell = sheet.getCell(`A${rowNum}`);
        noteCell.value = `* Data diekspor pada: ${exportedAt} WIB`;
        noteCell.font = { italic: true, size: 8, color: { argb: 'FF6B7280' } };
        rowNum++;
        const noteJT = sheet.getCell(`A${rowNum}`);
        noteJT.value = '* JT Bayar: PPh 21/Unifikasi/UMKM/PPh 25 = tgl 15 bln berikutnya | PPN = akhir bln berikutnya';
        noteJT.font = { italic: true, size: 8, color: { argb: 'FF6B7280' } };
      };

      if (selectedPic && selectedPic !== 'all') {
        const picData = data.filter(d => d.picId === selectedPic);
        const picName = picData[0]?.picName || 'Staff';
        buildSheet(workbook, picData, `${picName.substring(0, 20)} - ${MONTHS[parseInt(filterMonth)-1]}`);
      } else {
        buildSheet(workbook, data, `Semua Staff - ${MONTHS[parseInt(filterMonth)-1]}`);
        for (const pic of data) {
          buildSheet(workbook, [pic], pic.picName.substring(0, 25));
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `monitoring-output-${selectedPic !== 'all' ? (data[0]?.picName?.replace(/\s+/g, '_') || 'staff') : 'semua'}-${MONTHS[parseInt(filterMonth)-1]}-${filterYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('File Excel berhasil diunduh');
    } catch (err) {
      console.error(err);
      toast.error('Gagal export Excel');
    } finally {
      setExporting(false);
    }
  };

  const totalClients = data.reduce((s, p) => s + p.clients.length, 0);
  const totalDone    = data.reduce((s, p) => s + p.clients.filter(c => rowStatus(c).label === 'Selesai').length, 0);
  const totalLate    = data.reduce((s, p) => s + p.clients.filter(c => rowStatus(c).label === 'Terlambat').length, 0);

  return (
    <div className="p-4 max-w-full space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-blue-600" /> Monitoring Output Staff
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Rekap hasil kerja seluruh staff per klien per periode</p>
        </div>
        <Button
          onClick={handleExportExcel}
          disabled={exporting || loading || data.length === 0}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
        >
          <FileSpreadsheet className="w-4 h-4" />
          {exporting ? 'Mengekspor...' : 'Export Excel'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3"><p className="text-xs text-gray-500">Total Klien</p><p className="text-2xl font-bold text-gray-700">{totalClients}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Selesai</p><p className="text-2xl font-bold text-green-600">{totalDone}</p></Card>
        <Card className="p-3"><p className="text-xs text-gray-500">Terlambat</p><p className="text-2xl font-bold text-red-600">{totalLate}</p></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <Select value={selectedPic} onValueChange={setSelectedPic}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Semua PIC/Staff" /></SelectTrigger>
            <SelectContent className="max-h-52">
              <SelectItem value="all">Semua PIC</SelectItem>
              {picList.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Bulan" /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-28"><SelectValue placeholder="Tahun" /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* JT reminder */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        {[
          { label: 'JT Laporan Rekap', value: 'Tgl 5 bln berikutnya', color: 'bg-purple-50 border-purple-200 text-purple-700' },
          { label: 'JT Kirim ke Klien', value: 'Tgl 13 bln berikutnya', color: 'bg-blue-50 border-blue-200 text-blue-700' },
          { label: 'JT Bayar (PPh)', value: 'Tgl 15 bln berikutnya', color: 'bg-orange-50 border-orange-200 text-orange-700' },
          { label: 'JT Bayar (PPN)', value: 'Akhir bln berikutnya', color: 'bg-amber-50 border-amber-200 text-amber-700' },
          { label: 'JT Report Internal', value: 'Sesuai deadline rekap', color: 'bg-gray-50 border-gray-200 text-gray-700' },
        ].map(item => (
          <div key={item.label} className={`border rounded p-2 ${item.color}`}>
            <p className="font-semibold">{item.label}</p>
            <p>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Data */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Memuat data...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">Tidak ada data untuk periode yang dipilih</div>
      ) : (
        <div className="space-y-4">
          {data.map(pic => (
            <Card key={pic.picId}>
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-sm">{pic.picName}</span>
                <span className="text-xs text-gray-400">— {pic.clients.length} klien</span>
                <span className="ml-auto text-xs text-green-600 font-medium">
                  {pic.clients.filter(c => rowStatus(c).label === 'Selesai').length}/{pic.clients.length} selesai
                </span>
              </div>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      {/* Row 1: group headers */}
                      <tr>
                        <th rowSpan={2} className="border bg-slate-800 text-white px-2 py-1 text-center w-6">No</th>
                        <th rowSpan={2} className="border bg-slate-800 text-white px-2 py-1 text-left min-w-[120px]">Nama Klien</th>
                        <th rowSpan={2} className="border bg-slate-800 text-white px-2 py-1 text-left min-w-[100px]">Grup</th>
                        <th rowSpan={2} className="border bg-slate-800 text-white px-2 py-1 text-left min-w-[140px]">Jenis Kewajiban</th>
                        {TAX_COLS.map(tax => (
                          <th key={tax.key} colSpan={3} className="border bg-blue-600 text-white px-2 py-1 text-center">
                            {tax.label}
                          </th>
                        ))}
                        <th colSpan={2} className="border bg-violet-700 text-white px-2 py-1 text-center">Report Internal</th>
                        <th rowSpan={2} className="border bg-slate-800 text-white px-2 py-1 text-center">Status</th>
                      </tr>
                      {/* Row 2: sub-headers */}
                      <tr>
                        {TAX_COLS.map(tax => (
                          <>
                            <th key={tax.key+'-kirim'} className="border bg-blue-500 text-white px-1 py-1 text-center min-w-[90px]">Tgl Kirim<br/><span className="font-normal opacity-80">JT: tgl 13</span></th>
                            <th key={tax.key+'-bayar'} className="border bg-blue-500 text-white px-1 py-1 text-center min-w-[90px]">Tgl Bayar<br/><span className="font-normal opacity-80">{jtBayarLabel(tax.jtBayarType)}</span></th>
                            <th key={tax.key+'-lapor'} className="border bg-blue-500 text-white px-1 py-1 text-center min-w-[90px]">Tgl Lapor<br/><span className="font-normal opacity-80">JT: tgl 5</span></th>
                          </>
                        ))}
                        <th className="border bg-violet-600 text-white px-1 py-1 text-center min-w-[90px]">Tgl Submit</th>
                        <th className="border bg-violet-600 text-white px-1 py-1 text-center min-w-[90px]">JT Report</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pic.clients.map((client, idx) => {
                        const st = rowStatus(client);
                        const taskSet = new Set(client.taskTypes || []);
                        const subs = client.submissionsByType || {};
                        const kewajibanList = TAX_COLS
                          .filter(t => taskSet.has(t.key))
                          .map(t => t.label).join(', ') || '-';

                        return (
                          <tr key={client.clientId} className={st.label === 'Terlambat' ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                            <td className="border px-1 py-1 text-center text-gray-400">{idx + 1}</td>
                            <td className="border px-2 py-1">
                              <div className="font-medium">{client.clientName}</div>
                            </td>
                            <td className="border px-2 py-1 text-gray-500">{client.groupName || '-'}</td>
                            <td className="border px-2 py-1 text-gray-600">{kewajibanList}</td>

                            {TAX_COLS.map(tax => {
                              const hasTax = taskSet.has(tax.key);
                              const sub = subs[tax.key];
                              const tglLapor = sub?.tglLapor || null;
                              const grey = 'bg-gray-100 text-gray-300';
                              const jtBayarDate = getJtBayar(tax.jtBayarType, client.periodMonth, client.periodYear);
                              const jtBayarStr = jtBayarDate ? jtBayarDate.toISOString().slice(0, 10) : null;

                              return (
                                <>
                                  <td key={tax.key+'-k'} className={`border px-1 py-1 text-center ${!hasTax ? grey : ''}`}>
                                    {hasTax ? <DateCell value={client.tglKirimKlien} jt={client.jtKirimKlien} /> : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td key={tax.key+'-b'} className={`border px-1 py-1 text-center ${!hasTax ? grey : ''}`}>
                                    {hasTax ? <DateCell value={client.tglBayar} jt={jtBayarStr} /> : <span className="text-gray-300">—</span>}
                                  </td>
                                  <td key={tax.key+'-l'} className={`border px-1 py-1 text-center ${!hasTax ? grey : ''}`}>
                                    {hasTax
                                      ? <DateCell value={tglLapor} jt={client.jtLapor} />
                                      : <span className="text-gray-300">—</span>
                                    }
                                  </td>
                                </>
                              );
                            })}

                            <td className="border px-1 py-1 text-center">
                              <DateCell value={client.tglLapor} jt={client.jtReport} />
                            </td>
                            <td className="border px-1 py-1 text-center text-gray-500">
                              {client.jtReport ? fmtDateShort(client.jtReport) : '-'}
                            </td>
                            <td className="border px-2 py-1 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                {st.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
