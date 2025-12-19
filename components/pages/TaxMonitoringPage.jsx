'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { taxPeriodAPI, clientAPI } from '@/lib/api';
import {
  Plus, Calendar, AlertCircle, CheckCircle2, Clock, Filter, RefreshCw,
  ChevronLeft, ChevronRight, Building2, FileText, CreditCard, BookOpen, ShieldX
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function TaxMonitoringPage({ user }) {
  const [taxPeriods, setTaxPeriods] = useState([]);
  const [clients, setClients] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [filterClient, setFilterClient] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [createForm, setCreateForm] = useState({
    clientId: '',
    periodMonth: new Date().getMonth() + 1,
    periodYear: new Date().getFullYear()
  });

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [periodsRes, clientsRes, statsRes] = await Promise.all([
        taxPeriodAPI.getAll({ month: selectedMonth, year: selectedYear }),
        clientAPI.getAll(),
        taxPeriodAPI.getStats({ month: selectedMonth, year: selectedYear })
      ]);

      setTaxPeriods(periodsRes.taxPeriods || []);
      setClients(clientsRes.clients || []);
      setStats(statsRes.stats || null);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePeriods = async () => {
    setGenerating(true);
    try {
      const result = await taxPeriodAPI.generateBulk({
        periodMonth: selectedMonth,
        periodYear: selectedYear
      });
      toast.success(result.message);
      setShowGenerateModal(false);
      loadData();
    } catch (error) {
      console.error('Failed to generate periods:', error);
      toast.error(error.message || 'Gagal generate periode pajak');
    } finally {
      setGenerating(false);
    }
  };

  const handleCreatePeriod = async (e) => {
    e.preventDefault();
    try {
      await taxPeriodAPI.create(createForm);
      toast.success('Periode pajak berhasil dibuat!');
      setShowCreateModal(false);
      setCreateForm({
        clientId: '',
        periodMonth: selectedMonth,
        periodYear: selectedYear
      });
      loadData();
    } catch (error) {
      console.error('Failed to create period:', error);
      toast.error(error.message || 'Gagal membuat periode pajak');
    }
  };

  const handleUpdateStatus = async (periodId, field, newStatus) => {
    try {
      await taxPeriodAPI.updateStatus(periodId, field, newStatus);
      toast.success('Status berhasil diupdate!');
      loadData();
    } catch (error) {
      console.error('Failed to update status:', error);
      toast.error('Gagal update status');
    }
  };

  const goToPrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const getStatusBadge = (status, isOverdue) => {
    if (status === 'completed') {
      return <Badge className="bg-green-100 text-green-800"><CheckCircle2 className="w-3 h-3 mr-1" />Selesai</Badge>;
    }
    if (status === 'excepted') {
      return <Badge className="bg-purple-100 text-purple-800"><ShieldX className="w-3 h-3 mr-1" />Dikecualikan</Badge>;
    }
    if (isOverdue) {
      return <Badge className="bg-red-100 text-red-800"><AlertCircle className="w-3 h-3 mr-1" />Terlambat</Badge>;
    }
    if (status === 'in_progress') {
      return <Badge className="bg-blue-100 text-blue-800"><Clock className="w-3 h-3 mr-1" />Proses</Badge>;
    }
    return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const canManage = ['super_admin', 'owner', 'pengurus', 'sdm'].includes(user.role);
  const canUpdateStatus = ['super_admin', 'owner', 'pengurus', 'sdm', 'karyawan'].includes(user.role);

  // Filter periods
  const filteredPeriods = taxPeriods.filter(tp => {
    if (filterClient !== 'all' && tp.clientId !== filterClient) return false;
    if (filterStatus === 'overdue') {
      return tp.pphPaymentOverdue || tp.pphFilingOverdue || tp.ppnPaymentOverdue || tp.ppnFilingOverdue || tp.bookkeepingEmployeeOverdue;
    }
    if (filterStatus === 'completed') {
      return tp.pphPaymentStatus === 'completed' && tp.pphFilingStatus === 'completed' && tp.bookkeepingStatus === 'completed';
    }
    return true;
  });

  // Calculate stats percentages
  const getProgressPercentage = (completed, total) => {
    if (!total) return 0;
    return Math.round((completed / total) * 100);
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Monitoring Pajak</h1>
          <p className="text-gray-600 mt-1">Pantau kepatuhan pajak semua klien</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Dialog open={showGenerateModal} onOpenChange={setShowGenerateModal}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generate Otomatis
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Periode Pajak</DialogTitle>
                    <DialogDescription>
                      Buat periode pajak untuk semua klien aktif untuk bulan {MONTHS[selectedMonth - 1]} {selectedYear}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="py-4">
                    <p className="text-sm text-gray-600">
                      Deadline akan di-generate otomatis berdasarkan aturan perpajakan:
                    </p>
                    <ul className="text-sm text-gray-600 mt-2 space-y-1 list-disc list-inside">
                      <li>PPh Bayar: Tanggal 15 bulan berikutnya</li>
                      <li>PPh Lapor: Tanggal 20 bulan berikutnya</li>
                      <li>PPN (PKP): Akhir bulan berikutnya</li>
                      <li>Pembukuan: Tanggal 25 & 30 bulan berikutnya</li>
                    </ul>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowGenerateModal(false)}>Batal</Button>
                    <Button onClick={handleGeneratePeriods} disabled={generating}>
                      {generating ? 'Generating...' : 'Generate'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Tambah Manual
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Tambah Periode Pajak</DialogTitle>
                    <DialogDescription>
                      Buat periode pajak baru untuk klien tertentu
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreatePeriod} className="space-y-4">
                    <div>
                      <Label>Klien *</Label>
                      <Select
                        value={createForm.clientId}
                        onValueChange={(value) => setCreateForm({ ...createForm, clientId: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih klien" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map(c => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name} {c.isPkp && '(PKP)'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Bulan</Label>
                        <Select
                          value={createForm.periodMonth.toString()}
                          onValueChange={(value) => setCreateForm({ ...createForm, periodMonth: parseInt(value) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {MONTHS.map((m, i) => (
                              <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Tahun</Label>
                        <Select
                          value={createForm.periodYear.toString()}
                          onValueChange={(value) => setCreateForm({ ...createForm, periodYear: parseInt(value) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {[2023, 2024, 2025, 2026].map(y => (
                              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>Batal</Button>
                      <Button type="submit" disabled={!createForm.clientId}>Buat</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Period Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-center gap-4">
            <Button variant="ghost" size="icon" onClick={goToPrevMonth}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="text-xl font-semibold min-w-[200px] text-center">
              {MONTHS[selectedMonth - 1]} {selectedYear}
            </div>
            <Button variant="ghost" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium">PPh Bayar</span>
              </div>
              <Progress value={getProgressPercentage(stats.pphPayment.completed, stats.totalPeriods)} className="h-2 mb-2" />
              <div className="flex justify-between text-xs text-gray-600">
                <span>{stats.pphPayment.completed}/{stats.totalPeriods} selesai</span>
                {stats.pphPayment.overdue > 0 && (
                  <span className="text-red-600">{stats.pphPayment.overdue} terlambat</span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">PPh Lapor</span>
              </div>
              <Progress value={getProgressPercentage(stats.pphFiling.completed, stats.totalPeriods)} className="h-2 mb-2" />
              <div className="flex justify-between text-xs text-gray-600">
                <span>{stats.pphFiling.completed}/{stats.totalPeriods} selesai</span>
                {stats.pphFiling.overdue > 0 && (
                  <span className="text-red-600">{stats.pphFiling.overdue} terlambat</span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium">PPN Bayar</span>
              </div>
              <Progress value={getProgressPercentage(stats.ppnPayment.completed, stats.totalPeriods)} className="h-2 mb-2" />
              <div className="flex justify-between text-xs text-gray-600">
                <span>{stats.ppnPayment.completed}/{stats.totalPeriods}</span>
                {stats.ppnPayment.overdue > 0 && (
                  <span className="text-red-600">{stats.ppnPayment.overdue} terlambat</span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-4 h-4 text-orange-600" />
                <span className="text-sm font-medium">PPN Lapor</span>
              </div>
              <Progress value={getProgressPercentage(stats.ppnFiling.completed, stats.totalPeriods)} className="h-2 mb-2" />
              <div className="flex justify-between text-xs text-gray-600">
                <span>{stats.ppnFiling.completed}/{stats.totalPeriods}</span>
                {stats.ppnFiling.overdue > 0 && (
                  <span className="text-red-600">{stats.ppnFiling.overdue} terlambat</span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-cyan-600" />
                <span className="text-sm font-medium">Pembukuan</span>
              </div>
              <Progress value={getProgressPercentage(stats.bookkeeping.completed, stats.totalPeriods)} className="h-2 mb-2" />
              <div className="flex justify-between text-xs text-gray-600">
                <span>{stats.bookkeeping.completed}/{stats.totalPeriods} selesai</span>
                {stats.bookkeeping.overdue > 0 && (
                  <span className="text-red-600">{stats.bookkeeping.overdue} terlambat</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-gray-500">Filter Klien</Label>
              <Select value={filterClient} onValueChange={setFilterClient}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Klien</SelectItem>
                  {clients.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500">Filter Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="overdue">Terlambat</SelectItem>
                  <SelectItem value="completed">Selesai</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" className="w-full" onClick={loadData}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax Periods Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar Periode Pajak ({filteredPeriods.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredPeriods.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              Tidak ada data periode pajak untuk bulan ini.
              {canManage && ' Klik "Generate Otomatis" untuk membuat periode pajak.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Klien</TableHead>
                    <TableHead className="text-center">PPh Bayar</TableHead>
                    <TableHead className="text-center">PPh Lapor</TableHead>
                    <TableHead className="text-center">PPN Bayar</TableHead>
                    <TableHead className="text-center">PPN Lapor</TableHead>
                    <TableHead className="text-center">Pembukuan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPeriods.map(tp => (
                    <TableRow key={tp.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          <div>
                            <div className="font-medium">{tp.clientName}</div>
                            <div className="text-xs text-gray-500">
                              {tp.isPkp && <Badge variant="outline" className="mr-1 text-xs">PKP</Badge>}
                              {tp.isUmkm && <Badge variant="outline" className="text-xs">UMKM</Badge>}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="space-y-1">
                          {getStatusBadge(tp.pphPaymentStatus, tp.pphPaymentOverdue)}
                          <div className="text-xs text-gray-500">{formatDate(tp.pphPaymentDeadline)}</div>
                          {tp.pphPaymentStatus !== 'completed' && tp.pphPaymentStatus !== 'excepted' && (
                            <div className="flex justify-center gap-1">
                              {canUpdateStatus && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-6"
                                  onClick={() => handleUpdateStatus(tp.id, 'pph_payment_status', 'completed')}
                                >
                                  Selesai
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="space-y-1">
                          {getStatusBadge(tp.pphFilingStatus, tp.pphFilingOverdue)}
                          <div className="text-xs text-gray-500">{formatDate(tp.pphFilingDeadline)}</div>
                          {tp.pphFilingStatus !== 'completed' && tp.pphFilingStatus !== 'excepted' && canUpdateStatus && (
                            <div className="flex justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-6"
                                onClick={() => handleUpdateStatus(tp.id, 'pph_filing_status', 'completed')}
                              >
                                Selesai
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        {tp.ppnPaymentDeadline ? (
                          <div className="space-y-1">
                            {getStatusBadge(tp.ppnPaymentStatus, tp.ppnPaymentOverdue)}
                            <div className="text-xs text-gray-500">{formatDate(tp.ppnPaymentDeadline)}</div>
                            {tp.ppnPaymentStatus !== 'completed' && tp.ppnPaymentStatus !== 'excepted' && canUpdateStatus && (
                              <div className="flex justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-6"
                                  onClick={() => handleUpdateStatus(tp.id, 'ppn_payment_status', 'completed')}
                                >
                                  Selesai
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {tp.ppnFilingDeadline ? (
                          <div className="space-y-1">
                            {getStatusBadge(tp.ppnFilingStatus, tp.ppnFilingOverdue)}
                            <div className="text-xs text-gray-500">{formatDate(tp.ppnFilingDeadline)}</div>
                            {tp.ppnFilingStatus !== 'completed' && tp.ppnFilingStatus !== 'excepted' && canUpdateStatus && (
                              <div className="flex justify-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-6"
                                  onClick={() => handleUpdateStatus(tp.id, 'ppn_filing_status', 'completed')}
                                >
                                  Selesai
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="space-y-1">
                          {getStatusBadge(tp.bookkeepingStatus, tp.bookkeepingEmployeeOverdue)}
                          <div className="text-xs text-gray-500">{formatDate(tp.bookkeepingEmployeeDeadline)}</div>
                          {tp.bookkeepingStatus !== 'completed' && tp.bookkeepingStatus !== 'excepted' && canUpdateStatus && (
                            <div className="flex justify-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-6"
                                onClick={() => handleUpdateStatus(tp.id, 'bookkeeping_status', 'completed')}
                              >
                                Selesai
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
