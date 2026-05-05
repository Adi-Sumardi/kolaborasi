'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { authAPI, userAPI } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Shield, QrCode, Bell, Smartphone, User, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import NotificationSettings from '@/components/NotificationSettings';

export default function SettingsPage({ user }) {
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(user.twoFactorEnabled);
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(user.name || '');
  const [savingName, setSavingName] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleUpdateName = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Nama tidak boleh kosong');
      return;
    }
    try {
      setSavingName(true);
      await userAPI.updateOwnProfile(user.id, name.trim());
      toast.success('Nama berhasil diperbarui');
    } catch (error) {
      console.error('Failed to update name:', error);
      toast.error(error.message || 'Gagal memperbarui nama');
    } finally {
      setSavingName(false);
    }
  };

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.includes('@')) {
      toast.error('Format email tidak valid');
      return;
    }
    if (!emailPassword) {
      toast.error('Password saat ini diperlukan');
      return;
    }
    try {
      setSavingEmail(true);
      await userAPI.updateOwnEmail(user.id, emailPassword, newEmail);
      toast.success('Email berhasil diperbarui. Halaman akan dimuat ulang.');
      setNewEmail('');
      setEmailPassword('');
      setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
      console.error('Failed to update email:', error);
      toast.error(error.message || 'Gagal memperbarui email');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error('Password baru minimal 6 karakter');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Konfirmasi password tidak cocok');
      return;
    }
    try {
      setSavingPassword(true);
      await userAPI.changeOwnPassword(user.id, currentPassword, newPassword);
      toast.success('Password berhasil diubah');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Failed to change password:', error);
      toast.error(error.message || 'Gagal mengubah password');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleEnable2FA = async () => {
    try {
      setLoading(true);
      const res = await authAPI.get2FAQRCode();
      setQrCode(res.qrCode);
      setSecret(res.secret);
      setShowQRModal(true);
    } catch (error) {
      console.error('Failed to get QR code:', error);
      toast.error('Gagal mendapatkan QR code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndEnable = async (e) => {
    e.preventDefault();

    try {
      setLoading(true);
      await authAPI.enable2FA(verificationCode);
      setTwoFactorEnabled(true);
      setShowQRModal(false);
      setVerificationCode('');
      toast.success('2FA berhasil diaktifkan!');
    } catch (error) {
      console.error('Failed to enable 2FA:', error);
      toast.error(error.message || 'Gagal mengaktifkan 2FA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Pengaturan</h1>
        <p className="text-gray-600 mt-1">Kelola akun dan keamanan Anda</p>
      </div>

      <Tabs defaultValue="account" className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="account" className="flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Akun & Keamanan
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Smartphone className="w-4 h-4" />
            PWA & Notifikasi
          </TabsTrigger>
        </TabsList>

        <TabsContent value="account" className="space-y-6">
          {/* Profile Info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Informasi Profil</CardTitle>
                  <CardDescription>Perbarui nama tampilan akun Anda</CardDescription>
                </div>
                <User className="w-8 h-8 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateName} className="space-y-4">
                <div>
                  <Label htmlFor="profile-name">Nama</Label>
                  <Input
                    id="profile-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Email Saat Ini</Label>
                  <Input value={user.email} disabled className="bg-gray-50" />
                </div>
                <div>
                  <Label>Role</Label>
                  <Input
                    value={
                      user.role === 'super_admin' ? 'Super Admin' :
                      user.role === 'pengurus' ? 'Pengurus' :
                      user.role === 'sdm' ? 'SDM' :
                      user.role === 'karyawan' ? 'Karyawan' : user.role
                    }
                    disabled
                  />
                </div>
                {user.division && (
                  <div>
                    <Label>Divisi</Label>
                    <Input value={user.division.name} disabled />
                  </div>
                )}
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingName || name.trim() === (user.name || '').trim()}>
                    {savingName ? 'Menyimpan...' : 'Simpan Perubahan'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Email */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Ubah Email</CardTitle>
                  <CardDescription>Perbarui alamat email akun Anda</CardDescription>
                </div>
                <User className="w-8 h-8 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdateEmail} className="space-y-4">
                <div>
                  <Label htmlFor="new-email">Email Baru</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                    placeholder="contoh@email.com"
                  />
                </div>
                <div>
                  <Label htmlFor="email-password">Password Saat Ini</Label>
                  <Input
                    id="email-password"
                    type="password"
                    value={emailPassword}
                    onChange={(e) => setEmailPassword(e.target.value)}
                    required
                    placeholder="Diperlukan untuk verifikasi"
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingEmail || !newEmail || !emailPassword}>
                    {savingEmail ? 'Menyimpan...' : 'Ubah Email'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Ubah Password</CardTitle>
                  <CardDescription>Gunakan password yang kuat dan tidak digunakan di tempat lain</CardDescription>
                </div>
                <Lock className="w-8 h-8 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <Label htmlFor="current-password">Password Saat Ini</Label>
                  <Input
                    id="current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="new-password">Password Baru</Label>
                  <Input
                    id="new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">Minimal 6 karakter</p>
                </div>
                <div>
                  <Label htmlFor="confirm-password">Konfirmasi Password Baru</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={6}
                    required
                  />
                </div>
                <div className="flex justify-end">
                  <Button type="submit" disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}>
                    {savingPassword ? 'Menyimpan...' : 'Ubah Password'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Security Settings */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Two-Factor Authentication (2FA)</CardTitle>
                  <CardDescription>
                    Tambahkan lapisan keamanan ekstra dengan autentikasi dua faktor
                  </CardDescription>
                </div>
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {twoFactorEnabled ? (
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                  <div>
                    <p className="font-medium text-green-900">2FA Aktif</p>
                    <p className="text-sm text-green-700">Akun Anda dilindungi dengan 2FA</p>
                  </div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <p className="font-medium text-yellow-900">2FA Tidak Aktif</p>
                    <p className="text-sm text-yellow-700">Aktifkan 2FA untuk keamanan lebih baik</p>
                  </div>
                  <Button onClick={handleEnable2FA} disabled={loading}>
                    <QrCode className="w-4 h-4 mr-2" />
                    Aktifkan 2FA
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>
      </Tabs>

      {/* 2FA Setup Modal */}
      <Dialog open={showQRModal} onOpenChange={setShowQRModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setup Two-Factor Authentication</DialogTitle>
            <DialogDescription>
              Scan QR code dengan aplikasi authenticator Anda
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* QR Code */}
            {qrCode && (
              <div className="flex flex-col items-center space-y-4">
                <img src={qrCode} alt="QR Code" className="w-64 h-64" />
                <div className="text-center">
                  <p className="text-sm text-gray-600 mb-2">Atau masukkan kode ini secara manual:</p>
                  <code className="px-3 py-2 bg-gray-100 rounded text-sm font-mono break-all">
                    {secret}
                  </code>
                </div>
              </div>
            )}

            {/* Verification */}
            <form onSubmit={handleVerifyAndEnable} className="space-y-4">
              <div>
                <Label htmlFor="code">Kode Verifikasi</Label>
                <Input
                  id="code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="Masukkan 6 digit kode"
                  maxLength={6}
                  required
                />
                <p className="text-sm text-gray-500 mt-1">
                  Masukkan kode 6 digit dari aplikasi authenticator Anda
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setShowQRModal(false);
                    setVerificationCode('');
                  }}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={loading}>
                  Verifikasi & Aktifkan
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}