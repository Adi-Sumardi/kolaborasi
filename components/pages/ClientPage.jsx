'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { clientAPI, userAPI } from '@/lib/api';
import { Plus, Building2, Edit, Trash2, UserPlus, Users, Search, Filter, Star, X, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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

export default function ClientPage({ user }) {
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [isPrimaryAssignment, setIsPrimaryAssignment] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPkp, setFilterPkp] = useState('all');
  const [filterUmkm, setFilterUmkm] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'card'

  const [formData, setFormData] = useState({
    name: '',
    npwp: '',
    address: '',
    contactPerson: '',
    phone: '',
    email: '',
    isPkp: false,
    isUmkm: false,
    clientType: 'badan',
    isActive: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const canManageUsers = ['super_admin', 'owner', 'pengurus', 'sdm'].includes(user.role);

  const loadData = async () => {
    try {
      const promises = [clientAPI.getAll()];

      // Only fetch users if current user has permission
      if (canManageUsers) {
        promises.push(userAPI.getAll());
      }

      const results = await Promise.all(promises);

      setClients(results[0].clients || []);
      if (canManageUsers && results[1]) {
        setUsers(results[1].users || []);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();

    try {
      await clientAPI.create(formData);
      toast.success('Klien berhasil dibuat!');
      setShowCreateModal(false);
      resetForm();
      loadData();
    } catch (error) {
      console.error('Failed to create client:', error);
      toast.error(error.message || 'Gagal membuat klien');
    }
  };

  const handleEditClient = async (e) => {
    e.preventDefault();

    try {
      await clientAPI.update(selectedClient.id, formData);
      toast.success('Klien berhasil diupdate!');
      setShowEditModal(false);
      setSelectedClient(null);
      loadData();
    } catch (error) {
      console.error('Failed to update client:', error);
      toast.error(error.message || 'Gagal mengupdate klien');
    }
  };

  const handleDeleteClient = async () => {
    try {
      await clientAPI.delete(selectedClient.id);
      toast.success('Klien berhasil dihapus!');
      setShowDeleteDialog(false);
      setSelectedClient(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete client:', error);
      toast.error(error.message || 'Gagal menghapus klien');
    }
  };

  const handleAssignEmployee = async (e) => {
    e.preventDefault();

    if (!selectedUserId) {
      toast.error('Pilih karyawan terlebih dahulu');
      return;
    }

    try {
      await clientAPI.assignEmployee(selectedClient.id, selectedUserId, isPrimaryAssignment);
      toast.success('Karyawan berhasil di-assign ke klien!');
      setShowAssignModal(false);
      setSelectedUserId('');
      setIsPrimaryAssignment(false);
      loadData();
    } catch (error) {
      console.error('Failed to assign employee:', error);
      toast.error(error.message || 'Gagal assign karyawan');
    }
  };

  const handleUnassignEmployee = async (clientId, userId) => {
    try {
      await clientAPI.unassignEmployee(clientId, userId);
      toast.success('Karyawan berhasil dihapus dari klien!');
      loadData();
    } catch (error) {
      console.error('Failed to unassign employee:', error);
      toast.error('Gagal menghapus assignment');
    }
  };

  const handleSetPrimary = async (clientId, userId) => {
    try {
      await clientAPI.updateAssignment(clientId, userId, true);
      toast.success('Karyawan ditetapkan sebagai PIC utama!');
      loadData();
    } catch (error) {
      console.error('Failed to set primary:', error);
      toast.error('Gagal menetapkan PIC utama');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      npwp: '',
      address: '',
      contactPerson: '',
      phone: '',
      email: '',
      isPkp: false,
      isUmkm: false,
      clientType: 'badan',
      isActive: true
    });
  };

  const openEditModal = (client) => {
    setSelectedClient(client);
    setFormData({
      name: client.name,
      npwp: client.npwp || '',
      address: client.address || '',
      contactPerson: client.contactPerson || '',
      phone: client.phone || '',
      email: client.email || '',
      isPkp: client.isPkp || false,
      isUmkm: client.isUmkm || false,
      clientType: client.clientType || 'badan',
      isActive: client.isActive
    });
    setShowEditModal(true);
  };

  const openDeleteDialog = (client) => {
    setSelectedClient(client);
    setShowDeleteDialog(true);
  };

  const openAssignModal = (client) => {
    setSelectedClient(client);
    setSelectedUserId('');
    setIsPrimaryAssignment(false);
    setShowAssignModal(true);
  };

  const openDetailModal = (client) => {
    setSelectedClient(client);
    setShowDetailModal(true);
  };

  // Filter clients
  const filteredClients = clients.filter(client => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.npwp && client.npwp.includes(searchTerm)) ||
      (client.contactPerson && client.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesPkp = filterPkp === 'all' ||
      (filterPkp === 'pkp' && client.isPkp) ||
      (filterPkp === 'non-pkp' && !client.isPkp);

    const matchesUmkm = filterUmkm === 'all' ||
      (filterUmkm === 'umkm' && client.isUmkm) ||
      (filterUmkm === 'non-umkm' && !client.isUmkm);

    const matchesType = filterType === 'all' || client.clientType === filterType;

    return matchesSearch && matchesPkp && matchesUmkm && matchesType;
  });

  // Get users not assigned to this client
  const getAvailableUsers = (client) => {
    if (!client) return users;
    const assignedUserIds = client.assignments?.map(a => a.userId) || [];
    return users.filter(u => !assignedUserIds.includes(u.id));
  };

  const canManageClients = ['super_admin', 'owner', 'pengurus'].includes(user.role);
  const canAssignEmployees = ['super_admin', 'owner', 'pengurus', 'sdm'].includes(user.role);
  const canDeleteClients = ['super_admin', 'owner'].includes(user.role);

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen Klien</h1>
          <p className="text-gray-600 mt-1">Kelola data klien konsultan pajak</p>
        </div>
        {canManageClients && (
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Klien
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tambah Klien Baru</DialogTitle>
                <DialogDescription>
                  Tambahkan data klien baru ke sistem
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateClient} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <Label htmlFor="name">Nama Klien *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="PT. Contoh Indonesia"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="npwp">NPWP</Label>
                    <Input
                      id="npwp"
                      value={formData.npwp}
                      onChange={(e) => setFormData({ ...formData, npwp: e.target.value })}
                      placeholder="00.000.000.0-000.000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="clientType">Jenis Klien</Label>
                    <Select
                      value={formData.clientType}
                      onValueChange={(value) => setFormData({ ...formData, clientType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="badan">Badan</SelectItem>
                        <SelectItem value="orang_pribadi">Orang Pribadi</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="address">Alamat</Label>
                    <Textarea
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      placeholder="Alamat lengkap klien"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="contactPerson">Contact Person</Label>
                    <Input
                      id="contactPerson"
                      value={formData.contactPerson}
                      onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                      placeholder="Nama kontak"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Telepon</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="08xxxxxxxxxx"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      placeholder="email@klien.com"
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isPkp"
                      checked={formData.isPkp}
                      onCheckedChange={(checked) => setFormData({ ...formData, isPkp: checked })}
                    />
                    <Label htmlFor="isPkp" className="cursor-pointer">
                      PKP (Pengusaha Kena Pajak)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isUmkm"
                      checked={formData.isUmkm}
                      onCheckedChange={(checked) => setFormData({ ...formData, isUmkm: checked })}
                    />
                    <Label htmlFor="isUmkm" className="cursor-pointer">
                      UMKM (PPh 0.5%)
                    </Label>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                    Batal
                  </Button>
                  <Button type="submit">Simpan Klien</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Cari nama, NPWP, atau kontak..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Select value={filterPkp} onValueChange={setFilterPkp}>
                <SelectTrigger>
                  <SelectValue placeholder="Status PKP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua PKP</SelectItem>
                  <SelectItem value="pkp">PKP</SelectItem>
                  <SelectItem value="non-pkp">Non-PKP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={filterUmkm} onValueChange={setFilterUmkm}>
                <SelectTrigger>
                  <SelectValue placeholder="Status UMKM" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua UMKM</SelectItem>
                  <SelectItem value="umkm">UMKM</SelectItem>
                  <SelectItem value="non-umkm">Non-UMKM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Jenis Klien" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Jenis</SelectItem>
                  <SelectItem value="badan">Badan</SelectItem>
                  <SelectItem value="orang_pribadi">Orang Pribadi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{clients.length}</div>
            <p className="text-sm text-gray-600">Total Klien</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{clients.filter(c => c.isPkp).length}</div>
            <p className="text-sm text-gray-600">PKP</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-600">{clients.filter(c => c.isUmkm).length}</div>
            <p className="text-sm text-gray-600">UMKM</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600">{clients.filter(c => c.clientType === 'badan').length}</div>
            <p className="text-sm text-gray-600">Badan Usaha</p>
          </CardContent>
        </Card>
      </div>

      {/* Client Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Daftar Klien ({filteredClients.length})</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {filteredClients.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {searchTerm || filterPkp !== 'all' || filterUmkm !== 'all' || filterType !== 'all'
                ? 'Tidak ada klien yang sesuai filter'
                : 'Belum ada klien'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama Klien</TableHead>
                    <TableHead>NPWP</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>PIC</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map(client => {
                    const primaryPic = client.assignments?.find(a => a.isPrimary);
                    const otherPics = client.assignments?.filter(a => !a.isPrimary) || [];

                    return (
                      <TableRow key={client.id} className="cursor-pointer hover:bg-gray-50" onClick={() => openDetailModal(client)}>
                        <TableCell>
                          <div className="font-medium">{client.name}</div>
                          {client.contactPerson && (
                            <div className="text-sm text-gray-500">{client.contactPerson}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-sm">{client.npwp || '-'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {client.clientType === 'badan' ? 'Badan' : 'OP'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {client.isPkp && (
                              <Badge className="bg-green-100 text-green-800">PKP</Badge>
                            )}
                            {client.isUmkm && (
                              <Badge className="bg-orange-100 text-orange-800">UMKM</Badge>
                            )}
                            {!client.isPkp && !client.isUmkm && (
                              <Badge variant="secondary">Regular</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {primaryPic ? (
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                              <span className="text-sm">{primaryPic.userName}</span>
                              {otherPics.length > 0 && (
                                <span className="text-xs text-gray-500">+{otherPics.length}</span>
                              )}
                            </div>
                          ) : client.assignments?.length > 0 ? (
                            <span className="text-sm text-gray-600">{client.assignments[0].userName}</span>
                          ) : (
                            <span className="text-sm text-gray-400">Belum ada</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {canAssignEmployees && (
                              <Button size="sm" variant="ghost" onClick={() => openAssignModal(client)} title="Assign Karyawan">
                                <UserPlus className="w-4 h-4" />
                              </Button>
                            )}
                            {canManageClients && (
                              <Button size="sm" variant="ghost" onClick={() => openEditModal(client)} title="Edit">
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {canDeleteClients && (
                              <Button size="sm" variant="ghost" onClick={() => openDeleteDialog(client)} title="Hapus">
                                <Trash2 className="w-4 h-4 text-red-600" />
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

      {/* Client Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {selectedClient?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-6">
              {/* Client Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">NPWP</Label>
                  <p className="font-mono">{selectedClient.npwp || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Jenis Klien</Label>
                  <p>{selectedClient.clientType === 'badan' ? 'Badan Usaha' : 'Orang Pribadi'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Contact Person</Label>
                  <p>{selectedClient.contactPerson || '-'}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Telepon</Label>
                  <p>{selectedClient.phone || '-'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-gray-500">Email</Label>
                  <p>{selectedClient.email || '-'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-gray-500">Alamat</Label>
                  <p>{selectedClient.address || '-'}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-gray-500">Status Pajak</Label>
                  <div className="flex gap-2 mt-1">
                    {selectedClient.isPkp && <Badge className="bg-green-100 text-green-800">PKP</Badge>}
                    {selectedClient.isUmkm && <Badge className="bg-orange-100 text-orange-800">UMKM (PPh 0.5%)</Badge>}
                    {!selectedClient.isPkp && <Badge variant="secondary">Non-PKP</Badge>}
                    {!selectedClient.isUmkm && <Badge variant="secondary">Non-UMKM (PPh 25%)</Badge>}
                  </div>
                </div>
              </div>

              {/* Assigned Employees */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-gray-500">Karyawan yang Ditugaskan</Label>
                  {canAssignEmployees && (
                    <Button size="sm" variant="outline" onClick={() => { setShowDetailModal(false); openAssignModal(selectedClient); }}>
                      <UserPlus className="w-4 h-4 mr-1" />
                      Tambah
                    </Button>
                  )}
                </div>
                {selectedClient.assignments?.length > 0 ? (
                  <div className="space-y-2">
                    {selectedClient.assignments.map(assignment => (
                      <div key={assignment.userId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          {assignment.isPrimary && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                          <div>
                            <p className="font-medium">{assignment.userName}</p>
                            <p className="text-sm text-gray-500">{assignment.userEmail}</p>
                          </div>
                        </div>
                        {canAssignEmployees && (
                          <div className="flex items-center gap-1">
                            {!assignment.isPrimary && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSetPrimary(selectedClient.id, assignment.userId)}
                                title="Jadikan PIC Utama"
                              >
                                <Star className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUnassignEmployee(selectedClient.id, assignment.userId)}
                              title="Hapus dari klien"
                            >
                              <X className="w-4 h-4 text-red-600" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">Belum ada karyawan yang ditugaskan</p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Client Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Klien</DialogTitle>
            <DialogDescription>
              Update informasi klien
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditClient} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="edit-name">Nama Klien *</Label>
                <Input
                  id="edit-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label htmlFor="edit-npwp">NPWP</Label>
                <Input
                  id="edit-npwp"
                  value={formData.npwp}
                  onChange={(e) => setFormData({ ...formData, npwp: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-clientType">Jenis Klien</Label>
                <Select
                  value={formData.clientType}
                  onValueChange={(value) => setFormData({ ...formData, clientType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="badan">Badan</SelectItem>
                    <SelectItem value="orang_pribadi">Orang Pribadi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="edit-address">Alamat</Label>
                <Textarea
                  id="edit-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  rows={2}
                />
              </div>
              <div>
                <Label htmlFor="edit-contactPerson">Contact Person</Label>
                <Input
                  id="edit-contactPerson"
                  value={formData.contactPerson}
                  onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-phone">Telepon</Label>
                <Input
                  id="edit-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-isPkp"
                  checked={formData.isPkp}
                  onCheckedChange={(checked) => setFormData({ ...formData, isPkp: checked })}
                />
                <Label htmlFor="edit-isPkp" className="cursor-pointer">
                  PKP (Pengusaha Kena Pajak)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-isUmkm"
                  checked={formData.isUmkm}
                  onCheckedChange={(checked) => setFormData({ ...formData, isUmkm: checked })}
                />
                <Label htmlFor="edit-isUmkm" className="cursor-pointer">
                  UMKM (PPh 0.5%)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="edit-isActive"
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
                />
                <Label htmlFor="edit-isActive" className="cursor-pointer">
                  Klien Aktif
                </Label>
              </div>
            </div>
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Batal
              </Button>
              <Button type="submit">Update</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Employee Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Karyawan ke Klien</DialogTitle>
            <DialogDescription>
              Pilih karyawan untuk ditugaskan ke {selectedClient?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignEmployee} className="space-y-4">
            <div>
              <Label htmlFor="user-select">Pilih Karyawan *</Label>
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih karyawan" />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableUsers(selectedClient).map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="isPrimary"
                checked={isPrimaryAssignment}
                onCheckedChange={(checked) => setIsPrimaryAssignment(checked)}
              />
              <Label htmlFor="isPrimary" className="cursor-pointer">
                Jadikan sebagai PIC Utama
              </Label>
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowAssignModal(false)}>
                Batal
              </Button>
              <Button type="submit">Assign</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Klien?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus klien <strong>{selectedClient?.name}</strong>?
              <br />
              <span className="text-red-600 block mt-2">
                Semua data terkait (periode pajak, surat teguran, SP2DK) juga akan dihapus.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteClient}
              className="bg-red-600 hover:bg-red-700"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
