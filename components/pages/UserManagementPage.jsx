'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { userAPI, divisionAPI } from '@/lib/api';
import { Plus, Edit, Trash2, Power, PowerOff, Key, Circle, Clock, RefreshCw } from 'lucide-react';
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
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'karyawan',
    divisionId: ''
  });
  const [passwordData, setPasswordData] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    loadData();
    // Auto-refresh setiap 30 detik untuk update status online
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
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

  const openPasswordModal = (userToUpdate) => {
    setSelectedUser(userToUpdate);
    setPasswordData({ newPassword: '', confirmPassword: '' });
    setShowPasswordModal(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword.length < 6) {
      toast.error('Password minimal 6 karakter');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Password tidak cocok');
      return;
    }

    try {
      await userAPI.changePassword(selectedUser.id, passwordData.newPassword);
      toast.success('Password berhasil diubah!');
      setShowPasswordModal(false);
      setSelectedUser(null);
      setPasswordData({ newPassword: '', confirmPassword: '' });
    } catch (error) {
      console.error('Failed to change password:', error);
      toast.error(error.message || 'Gagal mengubah password');
    }
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

  const formatLastLogin = (lastLogin) => {
    if (!lastLogin) return 'Belum pernah login';

    const date = new Date(lastLogin);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Baru saja';
    if (diffMins < 60) return `${diffMins} menit lalu`;
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays < 7) return `${diffDays} hari lalu`;

    return date.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Hitung user online (login dalam 15 menit terakhir)
  const onlineUsers = users.filter(u => u.isOnline === true);
  const offlineUsers = users.filter(u => u.isOnline !== true && u.isActive !== false);

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-sm text-gray-600">Total User</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Circle className="w-3 h-3 fill-green-500 text-green-500 animate-pulse" />
              <span className="text-2xl font-bold text-green-600">{onlineUsers.length}</span>
            </div>
            <p className="text-sm text-green-700">Sedang Online</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">
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
            <div className="text-2xl font-bold text-purple-600">
              {users.filter(u => u.role === 'karyawan').length}
            </div>
            <p className="text-sm text-gray-600">Karyawan</p>
          </CardContent>
        </Card>
      </div>

      {/* Online Users Section */}
      {onlineUsers.length > 0 && (
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-green-700">
              <Circle className="w-3 h-3 fill-green-500 text-green-500 animate-pulse" />
              User Sedang Online ({onlineUsers.length})
              <Button
                variant="ghost"
                size="sm"
                onClick={loadData}
                className="ml-auto"
                title="Refresh"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {onlineUsers.map(u => (
                <div key={u.id} className="flex items-center gap-2 bg-green-100 px-3 py-2 rounded-lg">
                  <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                  <div>
                    <p className="font-medium text-sm text-green-900">{u.name}</p>
                    <p className="text-xs text-green-700">{getRoleLabel(u.role)}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
                  <TableHead className="hidden sm:table-cell">Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden md:table-cell">Divisi</TableHead>
                  <TableHead>Online</TableHead>
                  <TableHead className="hidden lg:table-cell">Last Login</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-500 py-4">
                      Tidak ada user
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map(u => (
                    <TableRow key={u.id} className={u.isOnline ? 'bg-green-50/50' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {u.isOnline && (
                            <Circle className="w-2 h-2 fill-green-500 text-green-500 flex-shrink-0" />
                          )}
                          {u.name}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{u.email}</TableCell>
                      <TableCell>
                        <Badge className={getRoleBadgeColor(u.role)}>
                          {getRoleLabel(u.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{getDivisionName(u.divisionId)}</TableCell>
                      <TableCell>
                        {u.isOnline ? (
                          <Badge className="bg-green-100 text-green-800">
                            <Circle className="w-2 h-2 fill-green-500 mr-1" />
                            Online
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-gray-500">
                            Offline
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Clock className="w-3 h-3" />
                          {formatLastLogin(u.lastLogin)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {u.isActive !== false ? (
                          <Badge className="bg-blue-100 text-blue-800">Aktif</Badge>
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
                                title="Edit User"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              {user.role === 'super_admin' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openPasswordModal(u)}
                                  title="Ganti Password"
                                >
                                  <Key className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant={u.isActive !== false ? 'outline' : 'default'}
                                onClick={() => handleToggleStatus(u.id, u.isActive !== false)}
                                title={u.isActive !== false ? 'Nonaktifkan' : 'Aktifkan'}
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

      {/* Change Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle>Ganti Password</DialogTitle>
            <DialogDescription>
              Ubah password untuk user <strong>{selectedUser?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <Label htmlFor="new-password">Password Baru *</Label>
              <Input
                id="new-password"
                type="password"
                value={passwordData.newPassword}
                onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                placeholder="Minimal 6 karakter"
                required
              />
            </div>
            <div>
              <Label htmlFor="confirm-password">Konfirmasi Password *</Label>
              <Input
                id="confirm-password"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder="Ketik ulang password"
                required
              />
            </div>
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setShowPasswordModal(false)}>
                Batal
              </Button>
              <Button type="submit">Ganti Password</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
