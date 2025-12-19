'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { warningLetterAPI, sp2dkAPI, clientAPI } from '@/lib/api';
import {
  Plus, AlertTriangle, FileWarning, Calendar, Building2, Trash2, Edit, Clock,
  AlertCircle, CheckCircle2
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function LettersPage({ user }) {
  const [warningLetters, setWarningLetters] = useState([]);
  const [sp2dkNotices, setSp2dkNotices] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('warning');

  // Warning Letter Modal
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [editingWarning, setEditingWarning] = useState(null);
  const [warningForm, setWarningForm] = useState({
    clientId: '',
    letterDate: '',
    letterNumber: '',
    description: '',
    fineAmount: 0
  });

  // SP2DK Modal
  const [showSp2dkModal, setShowSp2dkModal] = useState(false);
  const [editingSp2dk, setEditingSp2dk] = useState(null);
  const [sp2dkForm, setSp2dkForm] = useState({
    clientId: '',
    letterDate: '',
    letterNumber: '',
    description: ''
  });

  // Delete dialogs
  const [deleteWarningDialog, setDeleteWarningDialog] = useState(null);
  const [deleteSp2dkDialog, setDeleteSp2dkDialog] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [warningRes, sp2dkRes, clientsRes] = await Promise.all([
        warningLetterAPI.getAll(),
        sp2dkAPI.getAll(),
        clientAPI.getAll()
      ]);

      setWarningLetters(warningRes.warningLetters || []);
      setSp2dkNotices(sp2dkRes.sp2dkNotices || []);
      setClients(clientsRes.clients || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  // Warning Letter handlers
  const handleCreateWarning = async (e) => {
    e.preventDefault();
    try {
      if (editingWarning) {
        await warningLetterAPI.update(editingWarning.id, warningForm);
        toast.success('Surat teguran berhasil diupdate!');
      } else {
        await warningLetterAPI.create(warningForm);
        toast.success('Surat teguran berhasil dibuat!');
      }
      setShowWarningModal(false);
      resetWarningForm();
      loadData();
    } catch (error) {
      console.error('Warning letter error:', error);
      toast.error(error.message || 'Gagal menyimpan surat teguran');
    }
  };

  const handleDeleteWarning = async () => {
    try {
      await warningLetterAPI.delete(deleteWarningDialog.id);
      toast.success('Surat teguran berhasil dihapus!');
      setDeleteWarningDialog(null);
      loadData();
    } catch (error) {
      console.error('Delete warning error:', error);
      toast.error('Gagal menghapus surat teguran');
    }
  };

  const openEditWarning = (warning) => {
    setEditingWarning(warning);
    setWarningForm({
      clientId: warning.clientId,
      letterDate: warning.letterDate?.split('T')[0] || '',
      letterNumber: warning.letterNumber || '',
      description: warning.description || '',
      fineAmount: warning.fineAmount || 0
    });
    setShowWarningModal(true);
  };

  const resetWarningForm = () => {
    setEditingWarning(null);
    setWarningForm({
      clientId: '',
      letterDate: '',
      letterNumber: '',
      description: '',
      fineAmount: 0
    });
  };

  // SP2DK handlers
  const handleCreateSp2dk = async (e) => {
    e.preventDefault();
    try {
      if (editingSp2dk) {
        await sp2dkAPI.update(editingSp2dk.id, sp2dkForm);
        toast.success('SP2DK berhasil diupdate!');
      } else {
        await sp2dkAPI.create(sp2dkForm);
        toast.success('SP2DK berhasil dibuat!');
      }
      setShowSp2dkModal(false);
      resetSp2dkForm();
      loadData();
    } catch (error) {
      console.error('SP2DK error:', error);
      toast.error(error.message || 'Gagal menyimpan SP2DK');
    }
  };

  const handleDeleteSp2dk = async () => {
    try {
      await sp2dkAPI.delete(deleteSp2dkDialog.id);
      toast.success('SP2DK berhasil dihapus!');
      setDeleteSp2dkDialog(null);
      loadData();
    } catch (error) {
      console.error('Delete SP2DK error:', error);
      toast.error('Gagal menghapus SP2DK');
    }
  };

  const handleCompleteSp2dk = async (sp2dk) => {
    try {
      await sp2dkAPI.update(sp2dk.id, {
        status: 'completed',
        responseDate: new Date().toISOString().split('T')[0]
      });
      toast.success('SP2DK ditandai selesai!');
      loadData();
    } catch (error) {
      console.error('Complete SP2DK error:', error);
      toast.error('Gagal mengupdate status');
    }
  };

  const openEditSp2dk = (sp2dk) => {
    setEditingSp2dk(sp2dk);
    setSp2dkForm({
      clientId: sp2dk.clientId,
      letterDate: sp2dk.letterDate?.split('T')[0] || '',
      letterNumber: sp2dk.letterNumber || '',
      description: sp2dk.description || ''
    });
    setShowSp2dkModal(true);
  };

  const resetSp2dkForm = () => {
    setEditingSp2dk(null);
    setSp2dkForm({
      clientId: '',
      letterDate: '',
      letterNumber: '',
      description: ''
    });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const canManage = ['super_admin', 'owner', 'pengurus', 'sdm', 'karyawan'].includes(user.role);
  const canDelete = ['super_admin', 'owner'].includes(user.role);

  // Count overdue SP2DK
  const overdueSp2dk = sp2dkNotices.filter(sp => sp.isOverdue && sp.status !== 'completed').length;

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Surat & Notifikasi</h1>
          <p className="text-gray-600 mt-1">Kelola Surat Teguran dan SP2DK</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <div>
                <div className="text-2xl font-bold">{warningLetters.length}</div>
                <p className="text-sm text-gray-600">Surat Teguran</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <FileWarning className="w-5 h-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold">{sp2dkNotices.length}</div>
                <p className="text-sm text-gray-600">SP2DK</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-600">{overdueSp2dk}</div>
                <p className="text-sm text-gray-600">SP2DK Terlambat</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {sp2dkNotices.filter(sp => sp.status === 'completed').length}
                </div>
                <p className="text-sm text-gray-600">SP2DK Selesai</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="warning">Surat Teguran</TabsTrigger>
            <TabsTrigger value="sp2dk">SP2DK</TabsTrigger>
          </TabsList>
          {canManage && (
            <div>
              {activeTab === 'warning' ? (
                <Dialog open={showWarningModal} onOpenChange={(open) => { setShowWarningModal(open); if (!open) resetWarningForm(); }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Tambah Surat Teguran
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingWarning ? 'Edit' : 'Tambah'} Surat Teguran</DialogTitle>
                      <DialogDescription>
                        Catat surat teguran dari DJP untuk klien
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateWarning} className="space-y-4">
                      <div>
                        <Label>Klien *</Label>
                        <Select
                          value={warningForm.clientId}
                          onValueChange={(value) => setWarningForm({ ...warningForm, clientId: value })}
                          disabled={!!editingWarning}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih klien" />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Tanggal Surat *</Label>
                          <Input
                            type="date"
                            value={warningForm.letterDate}
                            onChange={(e) => setWarningForm({ ...warningForm, letterDate: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label>Nomor Surat</Label>
                          <Input
                            value={warningForm.letterNumber}
                            onChange={(e) => setWarningForm({ ...warningForm, letterNumber: e.target.value })}
                            placeholder="S-xxxxx"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Keterangan</Label>
                        <Textarea
                          value={warningForm.description}
                          onChange={(e) => setWarningForm({ ...warningForm, description: e.target.value })}
                          placeholder="Keterangan mengenai surat teguran"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label>Jumlah Denda (Rp)</Label>
                        <Input
                          type="number"
                          value={warningForm.fineAmount}
                          onChange={(e) => setWarningForm({ ...warningForm, fineAmount: parseInt(e.target.value) || 0 })}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => { setShowWarningModal(false); resetWarningForm(); }}>
                          Batal
                        </Button>
                        <Button type="submit" disabled={!warningForm.clientId || !warningForm.letterDate}>
                          Simpan
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              ) : (
                <Dialog open={showSp2dkModal} onOpenChange={(open) => { setShowSp2dkModal(open); if (!open) resetSp2dkForm(); }}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Tambah SP2DK
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingSp2dk ? 'Edit' : 'Tambah'} SP2DK</DialogTitle>
                      <DialogDescription>
                        Catat SP2DK dari DJP untuk klien (deadline 14 hari dari tanggal surat)
                      </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateSp2dk} className="space-y-4">
                      <div>
                        <Label>Klien *</Label>
                        <Select
                          value={sp2dkForm.clientId}
                          onValueChange={(value) => setSp2dkForm({ ...sp2dkForm, clientId: value })}
                          disabled={!!editingSp2dk}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Pilih klien" />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Tanggal Surat *</Label>
                          <Input
                            type="date"
                            value={sp2dkForm.letterDate}
                            onChange={(e) => setSp2dkForm({ ...sp2dkForm, letterDate: e.target.value })}
                            required
                          />
                        </div>
                        <div>
                          <Label>Nomor Surat</Label>
                          <Input
                            value={sp2dkForm.letterNumber}
                            onChange={(e) => setSp2dkForm({ ...sp2dkForm, letterNumber: e.target.value })}
                            placeholder="S-xxxxx"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Keterangan</Label>
                        <Textarea
                          value={sp2dkForm.description}
                          onChange={(e) => setSp2dkForm({ ...sp2dkForm, description: e.target.value })}
                          placeholder="Keterangan mengenai SP2DK"
                          rows={3}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={() => { setShowSp2dkModal(false); resetSp2dkForm(); }}>
                          Batal
                        </Button>
                        <Button type="submit" disabled={!sp2dkForm.clientId || !sp2dkForm.letterDate}>
                          Simpan
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )}
        </div>

        {/* Warning Letters Tab */}
        <TabsContent value="warning">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Surat Teguran</CardTitle>
            </CardHeader>
            <CardContent>
              {warningLetters.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Belum ada surat teguran</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Klien</TableHead>
                        <TableHead>Tanggal Surat</TableHead>
                        <TableHead>No. Surat</TableHead>
                        <TableHead>Keterangan</TableHead>
                        <TableHead>Denda</TableHead>
                        <TableHead>PIC</TableHead>
                        {canManage && <TableHead className="text-right">Aksi</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {warningLetters.map(wl => (
                        <TableRow key={wl.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-gray-400" />
                              <span className="font-medium">{wl.clientName}</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(wl.letterDate)}</TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">{wl.letterNumber || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-gray-600 line-clamp-2">{wl.description || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium text-red-600">{formatCurrency(wl.fineAmount)}</span>
                          </TableCell>
                          <TableCell>{wl.handledByName || '-'}</TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => openEditWarning(wl)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {canDelete && (
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteWarningDialog(wl)}>
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* SP2DK Tab */}
        <TabsContent value="sp2dk">
          <Card>
            <CardHeader>
              <CardTitle>Daftar SP2DK</CardTitle>
            </CardHeader>
            <CardContent>
              {sp2dkNotices.length === 0 ? (
                <div className="text-center py-8 text-gray-500">Belum ada SP2DK</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Klien</TableHead>
                        <TableHead>Tanggal Surat</TableHead>
                        <TableHead>No. Surat</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>PIC</TableHead>
                        {canManage && <TableHead className="text-right">Aksi</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sp2dkNotices.map(sp => (
                        <TableRow key={sp.id} className={sp.isOverdue ? 'bg-red-50' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-gray-400" />
                              <span className="font-medium">{sp.clientName}</span>
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(sp.letterDate)}</TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">{sp.letterNumber || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              <span className={sp.isOverdue ? 'text-red-600 font-medium' : ''}>{formatDate(sp.deadline)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {sp.status === 'completed' ? (
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle2 className="w-3 h-3 mr-1" />Selesai
                              </Badge>
                            ) : sp.isOverdue ? (
                              <Badge className="bg-red-100 text-red-800">
                                <AlertCircle className="w-3 h-3 mr-1" />Terlambat
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <Clock className="w-3 h-3 mr-1" />Pending
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>{sp.handledByName || '-'}</TableCell>
                          {canManage && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {sp.status !== 'completed' && (
                                  <Button size="sm" variant="ghost" onClick={() => handleCompleteSp2dk(sp)} title="Tandai Selesai">
                                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => openEditSp2dk(sp)}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {canDelete && (
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteSp2dkDialog(sp)}>
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Warning Dialog */}
      <AlertDialog open={!!deleteWarningDialog} onOpenChange={() => setDeleteWarningDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Surat Teguran?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus surat teguran untuk <strong>{deleteWarningDialog?.clientName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteWarning} className="bg-red-600 hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete SP2DK Dialog */}
      <AlertDialog open={!!deleteSp2dkDialog} onOpenChange={() => setDeleteSp2dkDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus SP2DK?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus SP2DK untuk <strong>{deleteSp2dkDialog?.clientName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteSp2dk} className="bg-red-600 hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
