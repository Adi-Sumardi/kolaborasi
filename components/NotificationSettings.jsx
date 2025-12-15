'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, BellOff, Smartphone, Download, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { 
  subscribeToPushNotifications, 
  unsubscribeFromPushNotifications, 
  isPushSubscribed,
  isStandalone,
  precachePages
} from '@/lib/pwa-utils';
import { getQueueCount, processQueue } from '@/lib/offline-queue';
import { getStorageEstimate } from '@/lib/offline-db';

export default function NotificationSettings() {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [storageInfo, setStorageInfo] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Check push notification support and status
    const checkPushStatus = async () => {
      const supported = 'PushManager' in window && 'Notification' in window;
      setPushSupported(supported);
      
      if (supported) {
        const subscribed = await isPushSubscribed();
        setPushEnabled(subscribed);
      }
    };

    // Check if installed as PWA
    setIsInstalled(isStandalone());

    // Check online status
    setIsOnline(navigator.onLine);
    
    // Get queue count
    const updateQueueCount = async () => {
      const count = await getQueueCount();
      setQueueCount(count);
    };

    // Get storage estimate
    const updateStorage = async () => {
      const estimate = await getStorageEstimate();
      setStorageInfo(estimate);
    };

    checkPushStatus();
    updateQueueCount();
    updateStorage();

    // Listen for online/offline events
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for queue updates
    const handleQueueProcessed = () => updateQueueCount();
    window.addEventListener('offlineQueueProcessed', handleQueueProcessed);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offlineQueueProcessed', handleQueueProcessed);
    };
  }, []);

  const handleTogglePush = async () => {
    setLoading(true);
    try {
      if (pushEnabled) {
        await unsubscribeFromPushNotifications();
        setPushEnabled(false);
      } else {
        const subscription = await subscribeToPushNotifications();
        setPushEnabled(!!subscription);
      }
    } catch (error) {
      console.error('Toggle push notification error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncNow = async () => {
    if (queueCount === 0) return;
    
    setSyncing(true);
    try {
      const results = await processQueue();
      const count = await getQueueCount();
      setQueueCount(count);
      
      if (results.success > 0) {
        alert(`Berhasil sinkronisasi ${results.success} aksi offline.`);
      }
    } catch (error) {
      console.error('Sync error:', error);
    } finally {
      setSyncing(false);
    }
  };

  const handlePrecache = async () => {
    setLoading(true);
    try {
      await precachePages();
      alert('Halaman berhasil di-cache untuk akses offline.');
    } catch (error) {
      console.error('Precache error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* PWA Install Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Status Aplikasi
          </CardTitle>
          <CardDescription>
            Status instalasi dan koneksi aplikasi
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Download className={`w-4 h-4 ${isInstalled ? 'text-green-500' : 'text-gray-400'}`} />
              <span className="text-sm">Terinstall sebagai PWA</span>
            </div>
            <span className={`text-sm font-medium ${isInstalled ? 'text-green-500' : 'text-gray-500'}`}>
              {isInstalled ? 'Ya' : 'Tidak'}
            </span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOnline ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-500" />
              )}
              <span className="text-sm">Status Koneksi</span>
            </div>
            <span className={`text-sm font-medium ${isOnline ? 'text-green-500' : 'text-red-500'}`}>
              {isOnline ? 'Online' : 'Offline'}
            </span>
          </div>

          {storageInfo && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Penyimpanan Offline</span>
              <span className="text-sm text-gray-500">
                {(storageInfo.usage / 1024 / 1024).toFixed(2)} MB ({storageInfo.usagePercentage}%)
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {pushEnabled ? (
              <Bell className="w-5 h-5 text-blue-500" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400" />
            )}
            Notifikasi Push
          </CardTitle>
          <CardDescription>
            Terima notifikasi saat ada update jobdesk atau pesan baru
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pushSupported ? (
            <div className="flex items-center justify-between">
              <Label htmlFor="push-toggle" className="text-sm">
                Aktifkan notifikasi push
              </Label>
              <Switch
                id="push-toggle"
                checked={pushEnabled}
                onCheckedChange={handleTogglePush}
                disabled={loading}
              />
            </div>
          ) : (
            <p className="text-sm text-amber-600">
              Browser Anda tidak mendukung notifikasi push. Gunakan browser modern seperti Chrome, Firefox, atau Edge.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Offline Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${syncing ? 'animate-spin' : ''}`} />
            Antrian Offline
          </CardTitle>
          <CardDescription>
            Aksi yang dilakukan saat offline akan disinkronkan saat online
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm">Aksi menunggu sinkronisasi</span>
            <span className={`text-sm font-medium ${queueCount > 0 ? 'text-amber-500' : 'text-green-500'}`}>
              {queueCount}
            </span>
          </div>
          
          {queueCount > 0 && isOnline && (
            <Button 
              onClick={handleSyncNow} 
              disabled={syncing}
              variant="outline"
              size="sm"
              className="w-full"
            >
              {syncing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Menyinkronkan...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sinkronkan Sekarang
                </>
              )}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Offline Data */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Data Offline
          </CardTitle>
          <CardDescription>
            Pre-cache halaman untuk akses lebih cepat saat offline
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handlePrecache} 
            disabled={loading}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" />
            Cache Halaman Utama
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
