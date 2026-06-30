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

      // Columns: No | PIC | Klien | Grup | Bulan | Jenis Pajak | TglLapor | JT | TglKirim | JT | TglBayar | JT | TglReport | JT | Status | Invoice | Catatan
      // Total 17 columns: A–Q
      const LAST_COL = 'Q';

      const buildSheet = (wb, picData, sheetName) => {
        const sheet = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 3 }] });

        sheet.columns = [
          { key: 'no',          width: 5 },
          { key: 'pic',         width: 18 },
          { key: 'klien',       width: 25 },
          { key: 'grup',        width: 15 },
          { key: 'bulan',       width: 12 },
          { key: 'pajak',       width: 22 },  // Jenis Pajak (NEW)
          { key: 'tgl_lapor',   width: 13 },
          { key: 'jt_lapor',    width: 13 },
          { key: 'tgl_kirim',   width: 13 },
          { key: 'jt_kirim',    width: 13 },
          { key: 'tgl_bayar',   width: 13 },
          { key: 'jt_bayar',    width: 13 },
          { key: 'tgl_report',  width: 13 },
          { key: 'jt_report',   width: 13 },
          { key: 'status',      width: 14 },
          { key: 'invoice',     width: 16 },
          { key: 'catatan',     width: 24 },
        ];

        // Row 1 - Title
        sheet.mergeCells(`A1:${LAST_COL}1`);
        const titleCell = sheet.getCell('A1');
        titleCell.value = `MONITORING OUTPUT STAFF — ${monthLabel.toUpperCase()}`;
        titleCell.font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
        sheet.getRow(1).height = 28;

        const groupHeaderStyle = {
          font: { bold: true, size: 9, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'middle' },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } },
          border: {
            top: { style: 'thin', color: { argb: 'FF1E40AF' } },
            bottom: { style: 'thin', color: { argb: 'FF1E40AF' } },
            left: { style: 'thin', color: { argb: 'FF1E40AF' } },
            right: { style: 'thin', color: { argb: 'FF1E40AF' } },
          }
        };
        const singleHeaderStyle = {
          ...groupHeaderStyle,
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } },
        };

        // Row 2 - group headers, merge row2+row3 for single columns
        ['A2','B2','C2','D2','E2','F2','O2','P2','Q2'].forEach(cell => {
          sheet.mergeCells(`${cell}:${cell.replace('2', '3')}`);
          Object.assign(sheet.getCell(cell), singleHeaderStyle);
        });
        sheet.getCell('A2').value = 'No';
        sheet.getCell('B2').value = 'PIC';
        sheet.getCell('C2').value = 'Klien';
        sheet.getCell('D2').value = 'Grup PT';
        sheet.getCell('E2').value = 'Bulan';
        sheet.getCell('F2').value = 'Jenis Pajak';
        sheet.getCell('O2').value = 'Status';
        sheet.getCell('P2').value = 'No. Invoice';
        sheet.getCell('Q2').value = 'Catatan';

        // Group headers for date pairs (G-H, I-J, K-L, M-N)
        sheet.mergeCells('G2:H2');
        sheet.mergeCells('I2:J2');
        sheet.mergeCells('K2:L2');
        sheet.mergeCells('M2:N2');
        [['G2','Laporan Rekap'],['I2','Kirim ke Klien'],['K2','Pembayaran'],['M2','Report Internal']].forEach(([cell, label]) => {
          Object.assign(sheet.getCell(cell), groupHeaderStyle);
          sheet.getCell(cell).value = label;
        });

        // Row 3 - sub-headers for date pairs
        const subHeaderStyle = {
          font: { bold: true, size: 8, color: { argb: 'FFFFFFFF' } },
          alignment: { horizontal: 'center', vertical: 'middle' },
          fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } },
          border: {
            top: { style: 'thin', color: { argb: 'FF1E40AF' } },
            bottom: { style: 'medium', color: { argb: 'FF1E40AF' } },
            left: { style: 'thin', color: { argb: 'FF1E40AF' } },
            right: { style: 'thin', color: { argb: 'FF1E40AF' } },
          }
        };
        [['G3','Tgl Lapor'],['H3','JT (5)'],['I3','Tgl Kirim'],['J3','JT (13)'],
         ['K3','Tgl Bayar'],['L3','JT (20)'],['M3','Tgl Report'],['N3','JT Report']].forEach(([cell, label]) => {
          Object.assign(sheet.getCell(cell), subHeaderStyle);
          sheet.getCell(cell).value = label;
        });
        sheet.getRow(2).height = 20;
        sheet.getRow(3).height = 18;

        const borderThin = (color = 'FFD1D5DB') => ({ style: 'thin', color: { argb: color } });
        const cellBorder = { top: borderThin(), bottom: borderThin(), left: borderThin(), right: borderThin() };
        const fmtExcel = (d) => {
          if (!d) return '-';
          const date = d.includes('T') ? new Date(d) : new Date(d + 'T00:00:00');
          return date.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
        };

        let rowNum = 4;
        let no = 1;

        for (const pic of picData) {
          for (const client of pic.clients) {
            const st = rowStatus(client);
            const today = new Date(new Date().toDateString());
            const toDate = (d) => d ? new Date(d.includes('T') ? d : d + 'T00:00:00') : null;
            const isLate = (val, jt) => val && jt && toDate(val) > toDate(jt);
            const isOverdueNow = (val, jt) => !val && jt && toDate(jt) < today;

            const taxLabels = getTaxTypes(client.taskTypes).map(t => TASK_LABELS[t] || t).join(', ') || '-';

            const row = sheet.getRow(rowNum);
            row.height = 18;
            const vals = [
              no++, pic.picName, client.clientName, client.groupName || '-',
              `${MONTHS[(client.periodMonth || 1) - 1]} ${client.periodYear}`,
              taxLabels,
              fmtExcel(client.tglLapor), fmtExcel(client.jtLapor),
              fmtExcel(client.tglKirimKlien), fmtExcel(client.jtKirimKlien),
              fmtExcel(client.tglBayar), fmtExcel(client.jtBayar),
              fmtExcel(client.tglReport), fmtExcel(client.jtReport),
              st.label, client.invoiceNumber || '-', '-',
            ];
            vals.forEach((val, i) => {
              const cell = row.getCell(i + 1);
              cell.value = val;
              cell.border = cellBorder;
              cell.font = { size: 9 };
              cell.alignment = { vertical: 'middle', wrapText: i === 5, horizontal: i < 5 ? 'left' : i === 5 ? 'left' : 'center' };
            });

            // Status color
            const statusCell = row.getCell(15);
            if (st.label === 'Selesai') statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            else if (st.label === 'Terlambat') statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            else statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };

            // Highlight late dates (cols 7,9,11,13 = G,I,K,M)
            const lateFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            const overdueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };
            if (isLate(client.tglLapor, client.jtLapor)) row.getCell(7).fill = lateFill;
            if (isOverdueNow(client.tglLapor, client.jtLapor)) row.getCell(7).fill = overdueFill;
            if (isLate(client.tglKirimKlien, client.jtKirimKlien)) row.getCell(9).fill = lateFill;
            if (isOverdueNow(client.tglKirimKlien, client.jtKirimKlien)) row.getCell(9).fill = overdueFill;
            if (isLate(client.tglBayar, client.jtBayar)) row.getCell(11).fill = lateFill;
            if (isOverdueNow(client.tglBayar, client.jtBayar)) row.getCell(11).fill = overdueFill;
            if (isLate(client.tglReport, client.jtReport)) row.getCell(13).fill = lateFill;
            if (isOverdueNow(client.tglReport, client.jtReport)) row.getCell(13).fill = overdueFill;

            rowNum++;
          }
        }

        // Legend
        rowNum += 2;
        sheet.getCell(`A${rowNum}`).value = 'Keterangan Warna:';
        sheet.getCell(`A${rowNum}`).font = { bold: true, size: 8 };
        rowNum++;
        [
          ['FFD1FAE5', 'Selesai / On Time'],
          ['FFFEE2E2', 'Terlambat (sudah lewat JT)'],
          ['FFFDE68A', 'Belum selesai & mendekati/lewat JT'],
        ].forEach(([color, desc]) => {
          const cell = sheet.getCell(`A${rowNum}`);
          cell.value = `  ${desc}`;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
          cell.font = { size: 8 };
          rowNum++;
        });
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
      a.download = `monitoring-output-${selectedPic !== 'all' ? data[0]?.picName?.replace(/\s+/g, '_') : 'semua'}-${MONTHS[parseInt(filterMonth)-1]}-${filterYear}.xlsx`;
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
          { label: 'JT Bayar Klien', value: 'Tgl 20 bln berikutnya', color: 'bg-orange-50 border-orange-200 text-orange-700' },
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
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="text-xs w-6">No</TableHead>
                        <TableHead className="text-xs">Klien</TableHead>
                        <TableHead className="text-xs">Jenis Pajak</TableHead>
                        <TableHead className="text-xs text-center">Tgl Lapor<br/><span className="text-gray-400 font-normal">JT: tgl 5</span></TableHead>
                        <TableHead className="text-xs text-center">Tgl Kirim Klien<br/><span className="text-gray-400 font-normal">JT: tgl 13</span></TableHead>
                        <TableHead className="text-xs text-center">Tgl Bayar<br/><span className="text-gray-400 font-normal">JT: tgl 20</span></TableHead>
                        <TableHead className="text-xs text-center">Tgl Report<br/><span className="text-gray-400 font-normal">JT: rekap</span></TableHead>
                        <TableHead className="text-xs text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pic.clients.map((client, idx) => {
                        const st = rowStatus(client);
                        const taxTypes = getTaxTypes(client.taskTypes);
                        return (
                          <TableRow key={client.clientId} className={st.label === 'Terlambat' ? 'bg-red-50/50' : ''}>
                            <TableCell className="text-xs text-gray-400">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="text-xs font-medium">{client.clientName}</div>
                              {client.groupName && <div className="text-xs text-gray-400">{client.groupName}</div>}
                            </TableCell>
                            <TableCell>
                              {taxTypes.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {taxTypes.map(t => (
                                    <span key={t} className="inline-block bg-blue-50 text-blue-700 border border-blue-100 rounded px-1.5 py-0.5 text-xs">
                                      {TASK_LABELS[t] || t}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400">-</span>
                              )}
                            </TableCell>
                            <TableCell><DateCell value={client.tglLapor} jt={client.jtLapor} /></TableCell>
                            <TableCell><DateCell value={client.tglKirimKlien} jt={client.jtKirimKlien} /></TableCell>
                            <TableCell><DateCell value={client.tglBayar} jt={client.jtBayar} /></TableCell>
                            <TableCell><DateCell value={client.tglReport} jt={client.jtReport} /></TableCell>
                            <TableCell>
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${st.color}`}>
                                {st.label}
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
