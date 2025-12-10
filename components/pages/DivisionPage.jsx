'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { divisionAPI, userAPI } from '@/lib/api';
import { Plus, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

export default function DivisionPage({ user }) {
  const [divisions, setDivisions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  const getUsersByDivision = (divisionId) => {
    return users.filter(u => u.divisionId === divisionId);
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
                    <div className="flex items-center space-x-1 text-sm text-gray-600">
                      <Users className="w-4 h-4" />
                      <span>{members.length}</span>
                    </div>
                  </div>
                  {division.description && (
                    <p className="text-sm text-gray-600 mt-1">{division.description}</p>
                  )}
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
    </div>
  );
}