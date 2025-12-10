'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { divisionAPI, userAPI } from '@/lib/api';
import { Plus, Users, Edit, Trash2, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export default function DivisionPage({ user }) {
  const [divisions, setDivisions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [divRes, usersRes] = await Promise.all([
        divisionAPI.getAll(),
        userAPI.getAll()
      ]);

      setDivisions(divRes.divisions || []);
      setUsers(usersRes.users || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDivision = async (e) => {
    e.preventDefault();

    try {
      await divisionAPI.create(formData);
      toast.success('Divisi berhasil dibuat!');
      setShowCreateModal(false);
      setFormData({ name: '', description: '' });
      loadData();
    } catch (error) {
      console.error('Failed to create division:', error);
      toast.error(error.message || 'Gagal membuat divisi');
    }
  };

  const handleEditDivision = async (e) => {
    e.preventDefault();

    try {
      await divisionAPI.update(selectedDivision.id, formData);
      toast.success('Divisi berhasil diupdate!');
      setShowEditModal(false);
      setSelectedDivision(null);
      loadData();
    } catch (error) {
      console.error('Failed to update division:', error);
      toast.error(error.message || 'Gagal mengupdate divisi');
    }
  };

  const handleDeleteDivision = async () => {
    try {
      await divisionAPI.delete(selectedDivision.id);
      toast.success('Divisi berhasil dihapus!');
      setShowDeleteDialog(false);
      setSelectedDivision(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete division:', error);
      toast.error(error.message || 'Gagal menghapus divisi');
    }
  };

  const handleAssignUser = async (e) => {
    e.preventDefault();

    if (!selectedUserId) {
      toast.error('Pilih user terlebih dahulu');
      return;
    }

    try {
      await userAPI.updateDivision(selectedUserId, selectedDivision.id);
      toast.success('User berhasil di-assign ke divisi!');
      setShowAssignModal(false);
      setSelectedUserId('');
      setSelectedDivision(null);
      loadData();
    } catch (error) {
      console.error('Failed to assign user:', error);
      toast.error('Gagal assign user');
    }
  };

  const getUsersByDivision = (divisionId) => {
    return users.filter(u => u.divisionId === divisionId);
  };

  const openEditModal = (division) => {
    setSelectedDivision(division);
    setFormData({
      name: division.name,
      description: division.description || ''
    });
    setShowEditModal(true);
  };

  const openDeleteDialog = (division) => {
    setSelectedDivision(division);
    setShowDeleteDialog(true);
  };

  const openAssignModal = (division) => {
    setSelectedDivision(division);
    setSelectedUserId('');
    setShowAssignModal(true);
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen Divisi</h1>
          <p className="text-gray-600 mt-1">Kelola divisi dan anggota tim</p>
        </div>
        {(user.role === 'super_admin' || user.role === 'pengurus') && (
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Divisi
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah Divisi Baru</DialogTitle>
                <DialogDescription>
                  Buat divisi baru untuk organisasi Anda
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateDivision} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nama Divisi *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Contoh: IT, Marketing, HR"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Deskripsi</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Deskripsi singkat tentang divisi ini"
                    rows={3}
                  />
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                    Batal
                  </Button>
                  <Button type="submit">Buat Divisi</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Division Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {divisions.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center text-gray-500">
              Belum ada divisi
            </CardContent>
          </Card>
        ) : (
          divisions.map(division => {
            const members = getUsersByDivision(division.id);
            return (
              <Card key={division.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{division.name}</CardTitle>
                    <div className="flex items-center space-x-1">
                      {(user.role === 'super_admin' || user.role === 'pengurus') && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openAssignModal(division)}
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditModal(division)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openDeleteDialog(division)}
                          >
                            <Trash2 className="w-4 h-4 text-red-600" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {division.description && (
                    <p className="text-sm text-gray-600 mt-1">{division.description}</p>
                  )}
                  <div className="flex items-center space-x-1 text-sm text-gray-600 mt-2">
                    <Users className="w-4 h-4" />
                    <span>{members.length} anggota</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">Anggota:</p>
                    {members.length === 0 ? (
                      <p className="text-sm text-gray-500">Belum ada anggota</p>
                    ) : (
                      <div className="space-y-1">
                        {members.slice(0, 5).map(member => (
                          <div key={member.id} className="flex items-center justify-between text-sm">
                            <span>{member.name}</span>
                            <span className="text-xs text-gray-500">
                              {member.role === 'super_admin' && 'Super Admin'}
                              {member.role === 'pengurus' && 'Pengurus'}
                              {member.role === 'sdm' && 'SDM'}
                              {member.role === 'karyawan' && 'Karyawan'}
                            </span>
                          </div>
                        ))}
                        {members.length > 5 && (
                          <p className="text-xs text-gray-500 mt-1">
                            +{members.length - 5} lainnya
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Users without Division */}
      <Card>
        <CardHeader>
          <CardTitle>Karyawan Tanpa Divisi</CardTitle>
        </CardHeader>
        <CardContent>
          {users.filter(u => !u.divisionId).length === 0 ? (
            <p className="text-center text-gray-500 py-4">Semua karyawan sudah terdaftar dalam divisi</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {users.filter(u => !u.divisionId).map(member => (
                <div key={member.id} className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-gray-600">{member.email}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {member.role === 'super_admin' && 'Super Admin'}
                    {member.role === 'pengurus' && 'Pengurus'}
                    {member.role === 'sdm' && 'SDM'}
                    {member.role === 'karyawan' && 'Karyawan'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Division Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Divisi</DialogTitle>
            <DialogDescription>
              Update informasi divisi
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditDivision} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Nama Divisi *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Deskripsi</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowEditModal(false)}>
                Batal
              </Button>
              <Button type="submit">Update</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign User Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign User ke Divisi</DialogTitle>
            <DialogDescription>
              Pilih user untuk ditambahkan ke divisi {selectedDivision?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignUser} className="space-y-4">
            <div>
              <Label htmlFor="user-select">Pilih User *</Label>
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih user" />
                </SelectTrigger>
                <SelectContent>
                  {users.map(u => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name} ({u.email}) - {u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <AlertDialogTitle>Hapus Divisi?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus divisi <strong>{selectedDivision?.name}</strong>?
              {getUsersByDivision(selectedDivision?.id || '').length > 0 && (
                <span className="block mt-2 text-red-600">
                  ⚠️ Divisi ini memiliki {getUsersByDivision(selectedDivision?.id || '').length} anggota. 
                  Mereka akan menjadi tanpa divisi.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteDivision} 
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
