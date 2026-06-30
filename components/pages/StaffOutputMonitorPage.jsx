'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { monitoringAPI, userAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  BarChart2, Download, CheckCircle2, Clock, AlertTriangle, Users, FileSpreadsheet
} from 'lucide-react';

const MONTHS = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateShort(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function DateCell({ value, jt }) {
  if (!value && !jt) return <span className="text-gray-400 text-xs">-</span>;
  const done = !!value;
  const jtDate = jt ? new Date(jt) : null;
  const valueDate = value ? new Date(value) : null;
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
  const anyLate = all.some(x => !x.done && x.jt && new Date(x.jt) < today);
  const allDone = all.every(x => x.done);
  if (allDone) return { label: 'Selesai', color: 'bg-green-100 text-green-700' };
  if (anyLate) return { label: 'Terlambat', color: 'bg-red-100 text-red-700' };
  return { label: 'On Progress', color: 'bg-yellow-100 text-yellow-700' };
}

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

export default function StaffOutputMonitorPage({ user }) {
  const [picList, setPicList] = useState([]);
  const [selectedPic, setSelectedPic] = useState('all'); // 'all' = semua PIC
  const [filterMonth, setFilterMonth] = useState(String(currentMonth));
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [data, setData] = useState([]); // array of { picId, picName, clients[] }
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const years = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) years.push(y);

  // Load staff list
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
      // Dynamic import to avoid SSR issues
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Kolaborasi App';
      workbook.created = new Date();

      const monthLabel = `${MONTHS[parseInt(filterMonth) - 1]} ${filterYear}`;

      const buildSheet = (wb, picData, sheetName) => {
        const sheet = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 3 }] });

        // Column widths
        sheet.columns = [
          { key: 'no',           width: 5 },
          { key: 'pic',          width: 18 },
          { key: 'klien',        width: 25 },
          { key: 'grup',         width: 15 },
          { key: 'bulan',        width: 14 },
          { key: 'tgl_lapor',    width: 14 },
          { key: 'jt_lapor',     width: 14 },
          { key: 'tgl_kirim',    width: 14 },
          { key: 'jt_kirim',     width: 14 },
          { key: 'tgl_bayar',    width: 14 },
          { key: 'jt_bayar',     width: 14 },
          { key: 'tgl_report',   width: 14 },
          { key: 'jt_report',    width: 14 },
          { key: 'status',       width: 14 },
          { key: 'invoice',      width: 16 },
          { key: 'catatan',      width: 24 },
        ];

        // Row 1 - Title
        sheet.mergeCells('A1:P1');
        const titleCell = sheet.getCell('A1');
        titleCell.value = `MONITORING OUTPUT STAFF — ${monthLabel.toUpperCase()}`;
        titleCell.font = { bold: true, size: 13, color: { argb: 'FF1E3A5F' } };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
        sheet.getRow(1).height = 28;

        // Row 2 - Sub groups header
        const headers2 = [
          ['A2', 'No', 1], ['B2', 'PIC', 1], ['C2', 'Klien', 1], ['D2', 'Grup PT', 1],
          ['E2', 'Bulan', 1], ['F2', 'Laporan Rekap', 2], ['H2', 'Kirim ke Klien', 2],
          ['J2', 'Pembayaran', 2], ['L2', 'Report Internal', 2],
          ['N2', 'Status', 1], ['O2', 'No. Invoice', 1], ['P2', 'Catatan', 1],
        ];
        // Merge groups
        sheet.mergeCells('F2:G2');
        sheet.mergeCells('H2:I2');
        sheet.mergeCells('J2:K2');
        sheet.mergeCells('L2:M2');

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

        ['A2','B2','C2','D2','E2','N2','O2','P2'].forEach(cell => {
          sheet.mergeCells(`${cell}:${cell.replace('2','3')}`);
          Object.assign(sheet.getCell(cell), singleHeaderStyle);
        });
        sheet.getCell('A2').value = 'No';
        sheet.getCell('B2').value = 'PIC';
        sheet.getCell('C2').value = 'Klien';
        sheet.getCell('D2').value = 'Grup PT';
        sheet.getCell('E2').value = 'Bulan';
        sheet.getCell('N2').value = 'Status';
        sheet.getCell('O2').value = 'No. Invoice';
        sheet.getCell('P2').value = 'Catatan';

        [['F2','Laporan Rekap'],['H2','Kirim ke Klien'],['J2','Pembayaran'],['L2','Report Internal']].forEach(([cell, label]) => {
          Object.assign(sheet.getCell(cell), groupHeaderStyle);
          sheet.getCell(cell).value = label;
        });

        // Row 3 - Sub headers
        const subHeaders = [
          ['F3','Tgl Lapor'], ['G3','JT (5)'],
          ['H3','Tgl Kirim'], ['I3','JT (13)'],
          ['J3','Tgl Bayar'], ['K3','JT (20)'],
          ['L3','Tgl Report'], ['M3','JT Report'],
        ];
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
        subHeaders.forEach(([cell, label]) => {
          Object.assign(sheet.getCell(cell), subHeaderStyle);
          sheet.getCell(cell).value = label;
        });
        sheet.getRow(2).height = 20;
        sheet.getRow(3).height = 18;

        const borderThin = (color = 'FFD1D5DB') => ({ style: 'thin', color: { argb: color } });
        const cellBorder = {
          top: borderThin(), bottom: borderThin(), left: borderThin(), right: borderThin()
        };
        const fmtExcel = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

        let rowNum = 4;
        let no = 1;

        for (const pic of picData) {
          for (const client of pic.clients) {
            const st = rowStatus(client);
            const today = new Date(new Date().toDateString());
            const isLate = (val, jt) => val && jt && new Date(val) > new Date(jt);
            const isOverdueNow = (val, jt) => !val && jt && new Date(jt) < today;

            const row = sheet.getRow(rowNum);
            row.height = 18;
            const vals = [
              no++, pic.picName, client.clientName, client.groupName || '-',
              `${MONTHS[(client.periodMonth || 1) - 1]} ${client.periodYear}`,
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
              cell.alignment = { vertical: 'middle', horizontal: i < 4 ? 'left' : 'center' };
            });

            // Color status
            const statusCell = row.getCell(14);
            if (st.label === 'Selesai') statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
            else if (st.label === 'Terlambat') statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            else statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };

            // Highlight late date cells
            const lateCellStyle = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            const overdueStyle  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } };

            if (isLate(client.tglLapor, client.jtLapor)) row.getCell(6).fill = lateCellStyle;
            if (isOverdueNow(client.tglLapor, client.jtLapor)) row.getCell(6).fill = overdueStyle;
            if (isLate(client.tglKirimKlien, client.jtKirimKlien)) row.getCell(8).fill = lateCellStyle;
            if (isOverdueNow(client.tglKirimKlien, client.jtKirimKlien)) row.getCell(8).fill = overdueStyle;
            if (isLate(client.tglBayar, client.jtBayar)) row.getCell(10).fill = lateCellStyle;
            if (isOverdueNow(client.tglBayar, client.jtBayar)) row.getCell(10).fill = overdueStyle;
            if (isLate(client.tglReport, client.jtReport)) row.getCell(12).fill = lateCellStyle;
            if (isOverdueNow(client.tglReport, client.jtReport)) row.getCell(12).fill = overdueStyle;

            rowNum++;
          }
        }

        // Legend
        rowNum += 2;
        sheet.getCell(`A${rowNum}`).value = 'Keterangan Warna:';
        sheet.getCell(`A${rowNum}`).font = { bold: true, size: 8 };
        rowNum++;
        [
          ['Merah muda', 'FFD1FAE5', 'Selesai / On Time'],
          ['Merah', 'FFFEE2E2', 'Terlambat (sudah lewat JT)'],
          ['Kuning', 'FFFDE68A', 'Belum selesai & mendekati/lewat JT'],
        ].forEach(([, color, desc]) => {
          const cell = sheet.getCell(`A${rowNum}`);
          cell.value = `  ${desc}`;
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
          cell.font = { size: 8 };
          rowNum++;
        });
      };

      if (selectedPic && selectedPic !== 'all') {
        // Single sheet
        const picData = data.filter(d => d.picId === selectedPic);
        const picName = picData[0]?.picName || 'Staff';
        buildSheet(workbook, picData, `${picName.substring(0,20)} - ${MONTHS[parseInt(filterMonth)-1]}`);
      } else {
        // One sheet per PIC + 1 combined sheet
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
      a.download = `monitoring-output-${selectedPic ? data[0]?.picName?.replace(/\s+/g, '_') : 'semua'}-${MONTHS[parseInt(filterMonth)-1]}-${filterYear}.xlsx`;
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
  const totalDone = data.reduce((s, p) => s + p.clients.filter(c => rowStatus(c).label === 'Selesai').length, 0);
  const totalLate = data.reduce((s, p) => s + p.clients.filter(c => rowStatus(c).label === 'Terlambat').length, 0);

  return (
    <div className="p-4 max-w-full space-y-4">
      {/* Header */}
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
        <Card className="p-3">
          <p className="text-xs text-gray-500">Total Klien</p>
          <p className="text-2xl font-bold text-gray-700">{totalClients}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500">Selesai</p>
          <p className="text-2xl font-bold text-green-600">{totalDone}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-gray-500">Terlambat</p>
          <p className="text-2xl font-bold text-red-600">{totalLate}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2 items-center">
          <Select value={selectedPic} onValueChange={setSelectedPic}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Semua PIC/Staff" />
            </SelectTrigger>
            <SelectContent className="max-h-52">
              <SelectItem value="all">Semua PIC</SelectItem>
              {picList.map(u => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Bulan" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => (
                <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterYear} onValueChange={setFilterYear}>
            <SelectTrigger className="w-28">
              <SelectValue placeholder="Tahun" />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* JT reminder bar */}
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

      {/* Data per PIC */}
      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">Memuat data...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          Tidak ada data untuk periode yang dipilih
        </div>
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
                        <TableHead className="text-xs">Grup PT</TableHead>
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
                        return (
                          <TableRow key={client.clientId} className={st.label === 'Terlambat' ? 'bg-red-50/50' : ''}>
                            <TableCell className="text-xs text-gray-400">{idx + 1}</TableCell>
                            <TableCell>
                              <div className="text-xs font-medium">{client.clientName}</div>
                              {client.groupName && (
                                <div className="text-xs text-gray-400">{client.groupName}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">{client.groupName || '-'}</TableCell>
                            <TableCell>
                              <DateCell value={client.tglLapor} jt={client.jtLapor} />
                            </TableCell>
                            <TableCell>
                              <DateCell value={client.tglKirimKlien} jt={client.jtKirimKlien} />
                            </TableCell>
                            <TableCell>
                              <DateCell value={client.tglBayar} jt={client.jtBayar} />
                            </TableCell>
                            <TableCell>
                              <DateCell value={client.tglReport} jt={client.jtReport} />
                            </TableCell>
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
