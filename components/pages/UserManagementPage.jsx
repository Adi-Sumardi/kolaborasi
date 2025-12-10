'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { userAPI, divisionAPI } from '@/lib/api';
import { Plus, Edit, Trash2, Power, PowerOff } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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

export default function UserManagementPage({ user }) {
  const [users, setUsers] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'karyawan',
    divisionId: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes, divRes] = await Promise.all([
        userAPI.getAll(),
        divisionAPI.getAll()
      ]);

      setUsers(usersRes.users || []);
      setDivisions(divRes.divisions || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      toast.error('Gagal memuat data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();

    if (!formData.password || formData.password.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    try {
      await userAPI.create(formData);
      toast.success('User berhasil ditambahkan!');
      setShowCreateModal(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: 'karyawan',
        divisionId: ''
      });
      loadData();
    } catch (error) {
      console.error('Failed to create user:', error);
      toast.error(error.message || 'Gagal menambahkan user');
    }
  };

  const handleEditUser = async (e) => {
    e.preventDefault();

    try {
      const updateData = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        divisionId: formData.divisionId || null
      };

      await userAPI.update(selectedUser.id, updateData);
      toast.success('User berhasil diupdate!');
      setShowEditModal(false);
      setSelectedUser(null);
      loadData();
    } catch (error) {
      console.error('Failed to update user:', error);
      toast.error(error.message || 'Gagal mengupdate user');
    }
  };

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      await userAPI.updateStatus(userId, !currentStatus);
      toast.success(`User berhasil ${!currentStatus ? 'diaktifkan' : 'dinonaktifkan'}!`);
      loadData();
    } catch (error) {
      console.error('Failed to toggle status:', error);
      toast.error('Gagal mengubah status user');
    }
  };

  const handleDeleteUser = async () => {
    try {
      await userAPI.delete(selectedUser.id);
      toast.success('User berhasil dihapus!');
      setShowDeleteDialog(false);
      setSelectedUser(null);
      loadData();
    } catch (error) {
      console.error('Failed to delete user:', error);
      toast.error('Gagal menghapus user');
    }
  };

  const openEditModal = (userToEdit) => {
    setSelectedUser(userToEdit);
    setFormData({
      name: userToEdit.name,
      email: userToEdit.email,
      password: '',
      role: userToEdit.role,
      divisionId: userToEdit.divisionId || ''
    });
    setShowEditModal(true);
  };

  const openDeleteDialog = (userToDelete) => {
    setSelectedUser(userToDelete);
    setShowDeleteDialog(true);
  };

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'super_admin': return 'bg-purple-100 text-purple-800';
      case 'pengurus': return 'bg-blue-100 text-blue-800';
      case 'sdm': return 'bg-green-100 text-green-800';
      case 'karyawan': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'super_admin': return 'Super Admin';
      case 'pengurus': return 'Pengurus';
      case 'sdm': return 'SDM';
      case 'karyawan': return 'Karyawan';
      default: return role;
    }
  };

  const getDivisionName = (divisionId) => {
    const division = divisions.find(d => d.id === divisionId);
    return division ? division.name : '-';
  };

  if (loading) {
    return <div className="text-center py-8">Memuat data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manajemen User</h1>
          <p className="text-gray-600 mt-1">Kelola user, role, dan status akun</p>
        </div>
        {(user.role === 'super_admin' || user.role === 'pengurus') && (
          <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah User Baru</DialogTitle>
                <DialogDescription>
                  Buat akun user baru untuk sistem
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <Label htmlFor="name">Nama Lengkap *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="password">Password *</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="role">Role *</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {user.role === 'super_admin' && (
                        <SelectItem value="super_admin">Super Admin</SelectItem>
                      )}
                      <SelectItem value="pengurus">Pengurus</SelectItem>
                      <SelectItem value="sdm">SDM</SelectItem>
                      <SelectItem value="karyawan">Karyawan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="division">Divisi</Label>
                  <Select
                    value={formData.divisionId || 'none'}
                    onValueChange={(value) => setFormData({ ...formData, divisionId: value === 'none' ? '' : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih divisi (opsional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tidak ada divisi</SelectItem>
                      {divisions.map(div => (
                        <SelectItem key={div.id} value={div.id}>
                          {div.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                    Batal
                  </Button>
                  <Button type="submit">Tambah User</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-sm text-gray-600">Total User</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {users.filter(u => u.isActive !== false).length}
            </div>
            <p className="text-sm text-gray-600">User Aktif</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">
              {users.filter(u => u.isActive === false).length}
            </div>
            <p className="text-sm text-gray-600">User Nonaktif</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
              {users.filter(u => u.role === 'karyawan').length}
            </div>
            <p className="text-sm text-gray-600">Karyawan</p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Daftar User</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Divisi</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-4">
                      Tidak ada user
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(u.role)}>
                          {getRoleLabel(u.role)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getDivisionName(u.divisionId)}</TableCell>
                      <TableCell>
                        {u.isActive !== false ? (
                          <Badge className="bg-green-100 text-green-800">Aktif</Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800">Nonaktif</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          {(user.role === 'super_admin' || user.role === 'pengurus') && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditModal(u)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant={u.isActive !== false ? 'outline' : 'default'}
                                onClick={() => handleToggleStatus(u.id, u.isActive !== false)}
                              >
                                {u.isActive !== false ? (
                                  <PowerOff className="w-4 h-4" />
                                ) : (
                                  <Power className="w-4 h-4" />
                                )}
                              </Button>
                            </>
                          )}
                          {user.role === 'super_admin' && u.id !== user.id && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openDeleteDialog(u)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update informasi user
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditUser} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Nama Lengkap *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-email">Email *</Label>
              <Input
                id="edit-email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="edit-role">Role *</Label>
              <Select
                value={formData.role}
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {user.role === 'super_admin' && (
                    <SelectItem value="super_admin">Super Admin</SelectItem>
                  )}
                  <SelectItem value="pengurus">Pengurus</SelectItem>
                  <SelectItem value="sdm">SDM</SelectItem>
                  <SelectItem value="karyawan">Karyawan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-division">Divisi</Label>
              <Select
                value={formData.divisionId || 'none'}
                onValueChange={(value) => setFormData({ ...formData, divisionId: value === 'none' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih divisi" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tidak ada divisi</SelectItem>
                  {divisions.map(div => (
                    <SelectItem key={div.id} value={div.id}>
                      {div.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus User?</AlertDialogTitle>
            <AlertDialogDescription>
              Apakah Anda yakin ingin menghapus user <strong>{selectedUser?.name}</strong>? 
              Tindakan ini akan menonaktifkan akun tersebut.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
