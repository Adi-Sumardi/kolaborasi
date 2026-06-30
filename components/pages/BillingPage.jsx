'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { billingAPI, clientAPI } from '@/lib/api';
import { toast } from 'sonner';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Receipt, Plus, Pencil, Trash2, CheckCircle2, Clock,
  AlertTriangle, Send, FileText, ImageIcon, Upload, ExternalLink, X
} from 'lucide-react';

const MONTHS = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];

const STATUS_CONFIG = {
  pending: { label: 'Belum Kirim', color: 'bg-gray-100 text-gray-700', icon: Clock },
  sent:    { label: 'Terkirim',    color: 'bg-blue-100 text-blue-700',  icon: Send },
  paid:    { label: 'Lunas',       color: 'bg-green-100 text-green-700',icon: CheckCircle2 },
  overdue: { label: 'Terlambat',   color: 'bg-red-100 text-red-700',    icon: AlertTriangle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

function isOverdue(dueDate, status) {
  if (!dueDate || status === 'paid') return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function getDaysLeft(dueDate) {
  if (!dueDate) return null;
  const diff = new Date(dueDate) - new Date(new Date().toDateString());
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

const currentMonth = new Date().getMonth() + 1;
const currentYear = new Date().getFullYear();

// Upload panel untuk satu billing record
function UploadPanel({ rec, onUploaded }) {
  const pdfRef = useRef();
  const ssRef = useRef();
  const [uploading, setUploading] = useState(null); // 'invoice_pdf' | 'email_screenshot'

  const handleUpload = async (fileType, file) => {
    if (!file) return;
    setUploading(fileType);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('fileType', fileType);
      const res = await billingAPI.uploadFile(rec.id, fd);
      toast.success(fileType === 'invoice_pdf' ? 'PDF invoice diupload' : 'Screenshot email diupload — billing ditandai terkirim');
      onUploaded(res.billingRecord);
    } catch {
      toast.error('Gagal upload file');
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 min-w-[180px]">
      {/* PDF Invoice */}
      <div className="flex items-center gap-1">
        {rec.invoice_pdf_url ? (
          <a
            href={rec.invoice_pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </a>
        ) : (
          <span className="text-xs text-gray-400">Belum ada PDF</span>
        )}
        <button
          className="ml-auto text-gray-400 hover:text-blue-600"
          title="Upload PDF invoice"
          onClick={() => pdfRef.current?.click()}
          disabled={!!uploading}
        >
          {uploading === 'invoice_pdf' ? '...' : <Upload className="w-3.5 h-3.5" />}
        </button>
        <input
          ref={pdfRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={e => handleUpload('invoice_pdf', e.target.files[0])}
        />
      </div>

      {/* SS Email */}
      <div className="flex items-center gap-1">
        {rec.email_screenshot_url ? (
          <a
            href={rec.email_screenshot_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-green-600 hover:underline"
          >
            <ImageIcon className="w-3.5 h-3.5" /> SS Email
          </a>
        ) : (
          <span className="text-xs text-gray-400">Belum ada SS email</span>
        )}
        <button
          className="ml-auto text-gray-400 hover:text-green-600"
          title="Upload screenshot email bukti pengiriman billing"
          onClick={() => ssRef.current?.click()}
          disabled={!!uploading}
        >
          {uploading === 'email_screenshot' ? '...' : <Upload className="w-3.5 h-3.5" />}
        </button>
        <input
          ref={ssRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => handleUpload('email_screenshot', e.target.files[0])}
        />
      </div>
    </div>
  );
}

export default function BillingPage({ user }) {
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterMonth, setFilterMonth] = useState(String(currentMonth));
  const [filterYear, setFilterYear] = useState(String(currentYear));
  const [filterStatus, setFilterStatus] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    clientId: '', periodMonth: String(currentMonth), periodYear: String(currentYear),
    amount: '', invoiceNumber: '', notes: '',
    billingSentDate: '', paymentReceivedDate: '',
  });

  const years = [];
  for (let y = currentYear - 2; y <= currentYear + 1; y++) years.push(y);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterMonth) params.periodMonth = filterMonth;
      if (filterYear) params.periodYear = filterYear;
      if (filterStatus && filterStatus !== 'all') params.status = filterStatus;
      const res = await billingAPI.getAll(params);
      setRecords(res.billingRecords || []);
    } catch {
      toast.error('Gagal memuat data billing');
    } finally {
      setLoading(false);
    }
  }, [filterMonth, filterYear, filterStatus]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    clientAPI.getAll({ limit: 200 }).then(r => setClients(r.clients || [])).catch(() => {});
  }, []);

  // Update satu record di state tanpa reload semua
  const updateRecordInState = (updated) => {
    setRecords(prev => prev.map(r => r.id === updated.id ? { ...r, ...updated } : r));
  };

  const openCreate = () => {
    setEditRecord(null);
    setForm({
      clientId: '', periodMonth: filterMonth || String(currentMonth),
      periodYear: filterYear || String(currentYear),
      amount: '', invoiceNumber: '', notes: '',
      billingSentDate: '', paymentReceivedDate: '',
    });
    setModalOpen(true);
  };

  const openEdit = (rec) => {
    setEditRecord(rec);
    setForm({
      clientId: rec.client_id,
      periodMonth: String(rec.period_month),
      periodYear: String(rec.period_year),
      amount: rec.amount || '',
      invoiceNumber: rec.invoice_number || '',
      notes: rec.notes || '',
      billingSentDate: rec.billing_sent_date ? rec.billing_sent_date.slice(0, 10) : '',
      paymentReceivedDate: rec.payment_received_date ? rec.payment_received_date.slice(0, 10) : '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editRecord && !form.clientId) {
      toast.error('Pilih klien terlebih dahulu');
      return;
    }
    setSaving(true);
    try {
      if (editRecord) {
        await billingAPI.update(editRecord.id, {
          billingSentDate: form.billingSentDate || null,
          paymentReceivedDate: form.paymentReceivedDate || null,
          amount: form.amount || null,
          invoiceNumber: form.invoiceNumber || null,
          notes: form.notes || null,
        });
        toast.success('Billing diperbarui');
      } else {
        await billingAPI.create({
          clientId: form.clientId,
          periodMonth: parseInt(form.periodMonth),
          periodYear: parseInt(form.periodYear),
          amount: form.amount || null,
          invoiceNumber: form.invoiceNumber || null,
          notes: form.notes || null,
        });
        toast.success('Billing dibuat');
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Hapus record billing ini?')) return;
    try {
      await billingAPI.delete(id);
      toast.success('Billing dihapus');
      load();
    } catch {
      toast.error('Gagal menghapus');
    }
  };

  const handleQuickSent = async (rec) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await billingAPI.update(rec.id, { billingSentDate: today });
      toast.success('Billing ditandai terkirim hari ini');
      load();
    } catch {
      toast.error('Gagal update');
    }
  };

  const handleQuickPaid = async (rec) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      await billingAPI.update(rec.id, { paymentReceivedDate: today });
      toast.success('Billing ditandai lunas hari ini');
      load();
    } catch {
      toast.error('Gagal update');
    }
  };

  const stats = {
    total: records.length,
    pending: records.filter(r => r.status === 'pending').length,
    sent: records.filter(r => r.status === 'sent').length,
    paid: records.filter(r => r.status === 'paid').length,
    overdue: records.filter(r => isOverdue(r.billing_due_date, r.status)).length,
  };

  const canDelete = ['super_admin', 'owner'].includes(user?.role);

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Receipt className="w-5 h-5 text-blue-600" /> Billing Klien
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            JT kirim billing ke klien: <strong>tgl 13 bulan berikutnya</strong>
          </p>
        </div>
        <Button onClick={openCreate} className="flex items-center gap-2">
          <Plus className="w-4 h-4" /> Tambah Billing
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'text-gray-700' },
          { label: 'Belum Kirim', value: stats.pending, color: 'text-gray-500' },
          { label: 'Terkirim', value: stats.sent, color: 'text-blue-600' },
          { label: 'Lunas', value: stats.paid, color: 'text-green-600' },
        ].map(s => (
          <Card key={s.label} className="p-3">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {stats.overdue > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>{stats.overdue} billing</strong> sudah melewati JT tgl 13 dan belum terkirim!</span>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-3 flex flex-wrap gap-2">
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
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Semua Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setFilterStatus('all')}>Reset</Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Memuat data...</div>
          ) : records.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">Belum ada billing untuk periode ini</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Klien</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>No. Invoice</TableHead>
                    <TableHead>Maks Kirim (tgl 13)</TableHead>
                    <TableHead>Tgl Kirim</TableHead>
                    <TableHead>JT Bayar</TableHead>
                    <TableHead>Tgl Lunas</TableHead>
                    <TableHead>Nominal</TableHead>
                    <TableHead>Dokumen</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(rec => {
                    const overdue = isOverdue(rec.billing_due_date, rec.status);
                    const daysLeft = getDaysLeft(rec.billing_due_date);
                    return (
                      <TableRow key={rec.id} className={overdue ? 'bg-red-50' : ''}>
                        <TableCell>
                          <div className="font-medium text-sm">{rec.client_name}</div>
                          {rec.pic_name && <div className="text-xs text-gray-400">PIC: {rec.pic_name}</div>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {MONTHS[(rec.period_month || 1) - 1]} {rec.period_year}
                        </TableCell>
                        <TableCell className="text-sm font-mono">{rec.invoice_number || '-'}</TableCell>
                        <TableCell>
                          <div className="text-sm">{fmtDate(rec.billing_due_date)}</div>
                          {rec.status !== 'paid' && rec.status !== 'sent' && daysLeft !== null && (
                            <div className={`text-xs font-medium ${daysLeft < 0 ? 'text-red-600' : daysLeft <= 3 ? 'text-orange-500' : 'text-gray-400'}`}>
                              {daysLeft < 0 ? `${Math.abs(daysLeft)} hr terlambat` : daysLeft === 0 ? 'Hari ini!' : `${daysLeft} hr lagi`}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{fmtDate(rec.billing_sent_date)}</div>
                          {rec.email_screenshot_url && (
                            <a href={rec.email_screenshot_url} target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-xs text-green-600 hover:underline mt-0.5">
                              <ImageIcon className="w-3 h-3" /> lihat SS
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(rec.payment_due_date)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(rec.payment_received_date)}</TableCell>
                        <TableCell className="text-sm">
                          {rec.amount ? `Rp ${Number(rec.amount).toLocaleString('id-ID')}` : '-'}
                        </TableCell>

                        {/* Kolom Dokumen: upload PDF + SS email */}
                        <TableCell>
                          <UploadPanel rec={rec} onUploaded={updateRecordInState} />
                        </TableCell>

                        <TableCell><StatusBadge status={rec.status} /></TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {rec.status === 'pending' && (
                              <Button size="sm" variant="outline"
                                className="text-blue-600 border-blue-200 h-7 px-2 text-xs"
                                onClick={() => handleQuickSent(rec)}
                                title="Tandai terkirim hari ini">
                                <Send className="w-3 h-3 mr-1" /> Kirim
                              </Button>
                            )}
                            {rec.status === 'sent' && (
                              <Button size="sm" variant="outline"
                                className="text-green-600 border-green-200 h-7 px-2 text-xs"
                                onClick={() => handleQuickPaid(rec)}
                                title="Tandai lunas hari ini">
                                <CheckCircle2 className="w-3 h-3 mr-1" /> Lunas
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => openEdit(rec)} className="h-7 w-7 p-0">
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {canDelete && (
                              <Button size="sm" variant="ghost" onClick={() => handleDelete(rec.id)}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal Create/Edit */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editRecord ? 'Edit Billing' : 'Tambah Billing'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editRecord && (
              <div className="space-y-1">
                <Label>Klien *</Label>
                <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Pilih klien..." /></SelectTrigger>
                  <SelectContent className="max-h-52">
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {editRecord && (
              <div className="bg-gray-50 rounded p-3 text-sm">
                <p className="font-medium">{editRecord.client_name}</p>
                <p className="text-gray-500">Periode: {MONTHS[(editRecord.period_month || 1) - 1]} {editRecord.period_year}</p>
                <p className="text-gray-500">JT Kirim: {fmtDate(editRecord.billing_due_date)}</p>
              </div>
            )}

            {!editRecord && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Bulan Periode *</Label>
                  <Select value={form.periodMonth} onValueChange={v => setForm(f => ({ ...f, periodMonth: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i+1} value={String(i+1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Tahun *</Label>
                  <Select value={form.periodYear} onValueChange={v => setForm(f => ({ ...f, periodYear: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>No. Invoice</Label>
                <Input placeholder="INV-001" value={form.invoiceNumber}
                  onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Nominal (Rp)</Label>
                <Input type="number" placeholder="0" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Tgl Dikirim ke Klien</Label>
                <Input type="date" value={form.billingSentDate}
                  onChange={e => setForm(f => ({ ...f, billingSentDate: e.target.value }))} />
                <p className="text-xs text-gray-400">Atau upload SS email — tgl otomatis terisi</p>
              </div>
              <div className="space-y-1">
                <Label>Tgl Pembayaran Diterima</Label>
                <Input type="date" value={form.paymentReceivedDate}
                  onChange={e => setForm(f => ({ ...f, paymentReceivedDate: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>Catatan</Label>
              <Textarea rows={2} placeholder="Catatan tambahan..."
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {!editRecord && form.periodMonth && form.periodYear && (
              <div className="bg-blue-50 border border-blue-100 rounded p-3 text-xs text-blue-700">
                <p className="font-semibold">JT otomatis (bulan berikutnya):</p>
                {(() => {
                  const m = parseInt(form.periodMonth);
                  const y = parseInt(form.periodYear);
                  const nextM = m === 12 ? 1 : m + 1;
                  const nextY = m === 12 ? y + 1 : y;
                  return (
                    <>
                      <p>• <strong>Maks kirim ke klien: tgl 13</strong> → <strong>13 {MONTHS[nextM - 1]} {nextY}</strong></p>
                      <p>• Maks bayar klien: tgl 20 → <strong>20 {MONTHS[nextM - 1]} {nextY}</strong></p>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Batal</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
