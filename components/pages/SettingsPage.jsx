'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { authAPI } from '@/lib/api';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Shield, QrCode, Bell, Smartphone } from 'lucide-react';
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

      {/* Profile Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi Profil</CardTitle>
          <CardDescription>Detail akun Anda</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Nama</Label>
            <Input value={user.name} disabled />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user.email} disabled />
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

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informasi Aplikasi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600">
            <p><strong>Versi:</strong> 1.0.0</p>
            <p><strong>Platform:</strong> Dashboard Ruang Kerja Kolaborasi</p>
            <p><strong>Stack:</strong> Next.js + MongoDB + Socket.io</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}