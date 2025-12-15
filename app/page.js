'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { authAPI, getToken, setToken, setUser, getUser } from '@/lib/api';
import { toast } from 'sonner';
import { Loader2, Users, BarChart3, MessageSquare, CheckSquare } from 'lucide-react';
import DashboardApp from '@/components/DashboardApp';
import InstallPrompt from '@/components/InstallPrompt';
import OnlineStatus from '@/components/OnlineStatus';
import { registerServiceWorker } from '@/lib/pwa-utils';

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loginForm, setLoginForm] = useState({ email: '', password: '', rememberMe: false });
  const [need2FA, setNeed2FA] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    // Register Service Worker for PWA
    registerServiceWorker();
    
    // Check if already logged in
    const token = getToken();
    const user = getUser();
    if (token && user) {
      setIsLoggedIn(true);
    }
    setLoading(false);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);

    try {
      const response = await authAPI.login({
        email: loginForm.email,
        password: loginForm.password,
        twoFactorCode: need2FA ? twoFactorCode : undefined,
        rememberMe: loginForm.rememberMe
      });

      if (response.require2FA) {
        setNeed2FA(true);
        toast.info('Masukkan kode 2FA dari aplikasi authenticator Anda');
      } else {
        setToken(response.token);
        setUser(response.user);
        setIsLoggedIn(true);
        toast.success('Login berhasil!');
      }
    } catch (error) {
      toast.error(error.message || 'Login gagal');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isLoggedIn) {
    return (
      <>
        <DashboardApp setIsLoggedIn={setIsLoggedIn} />
        <OnlineStatus />
        <InstallPrompt />
      </>
    );
  }

  return (
    <>
      <OnlineStatus />
      <InstallPrompt />
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid md:grid-cols-2 gap-8 items-center">
        {/* Left Side - Branding */}
        <div className="space-y-6 text-center md:text-left">
          <div className="space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900">
              Dashboard Ruang Kerja
              <span className="block text-blue-600">Kolaborasi</span>
            </h1>
            <p className="text-lg text-gray-600">
              Platform kolaborasi modern untuk meningkatkan produktivitas tim Anda
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-6">
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <Users className="w-8 h-8 text-blue-600 mb-2" />
              <h3 className="font-semibold text-gray-900">Manajemen Tim</h3>
              <p className="text-sm text-gray-600">Kelola divisi & anggota</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <BarChart3 className="w-8 h-8 text-green-600 mb-2" />
              <h3 className="font-semibold text-gray-900">KPI Tracking</h3>
              <p className="text-sm text-gray-600">Monitor performa</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <MessageSquare className="w-8 h-8 text-purple-600 mb-2" />
              <h3 className="font-semibold text-gray-900">Group Chat</h3>
              <p className="text-sm text-gray-600">Komunikasi real-time</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm">
              <CheckSquare className="w-8 h-8 text-orange-600 mb-2" />
              <h3 className="font-semibold text-gray-900">Jobdesk</h3>
              <p className="text-sm text-gray-600">Kelola tugas harian</p>
            </div>
          </div>
        </div>

        {/* Right Side - Login Form */}
        <Card className="w-full shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Login</CardTitle>
            <CardDescription>
              Masuk untuk mengakses dashboard Anda
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="nama@perusahaan.com"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  required
                  disabled={need2FA}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  required
                  disabled={need2FA}
                />
              </div>

              {need2FA && (
                <div className="space-y-2">
                  <Label htmlFor="2fa">Kode 2FA</Label>
                  <Input
                    id="2fa"
                    type="text"
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value)}
                    maxLength={6}
                    required
                  />
                  <p className="text-xs text-gray-500">
                    Masukkan kode dari aplikasi authenticator Anda
                  </p>
                </div>
              )}

              {!need2FA && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="remember"
                    checked={loginForm.rememberMe}
                    onCheckedChange={(checked) => setLoginForm({ ...loginForm, rememberMe: checked })}
                  />
                  <Label htmlFor="remember" className="text-sm cursor-pointer">
                    Ingat saya (30 hari)
                  </Label>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isLoggingIn}>
                {isLoggingIn ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  'Login'
                )}
              </Button>

              {need2FA && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setNeed2FA(false);
                    setTwoFactorCode('');
                  }}
                >
                  Kembali
                </Button>
              )}
            </form>

            <div className="mt-6 text-center text-sm text-gray-600">
              <p>Aplikasi ini dilindungi dengan 2FA (Two-Factor Authentication)</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}