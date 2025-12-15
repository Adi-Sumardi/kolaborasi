'use client';

import { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, Cloud, CloudOff } from 'lucide-react';
import { processQueue, getQueueCount } from '@/lib/offline-queue';

export default function OnlineStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [showStatus, setShowStatus] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const updateQueueCount = async () => {
      const count = await getQueueCount();
      setQueueCount(count);
    };

    const handleOnline = async () => {
      console.log('✅ Back online!');
      setIsOnline(true);
      setShowStatus(true);
      
      // Auto-sync offline queue
      await updateQueueCount();
      if (queueCount > 0) {
        setSyncing(true);
        try {
          await processQueue();
          await updateQueueCount();
        } finally {
          setSyncing(false);
        }
      }
      
      setTimeout(() => setShowStatus(false), 3000);
    };

    const handleOffline = () => {
      console.log('❌ Gone offline!');
      setIsOnline(false);
      setShowStatus(true);
    };

    // Initial state
    setIsOnline(navigator.onLine);
    updateQueueCount();

    // Event listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for queue updates
    const handleQueueProcessed = () => updateQueueCount();
    window.addEventListener('offlineQueueProcessed', handleQueueProcessed);

    // Update queue count periodically
    const interval = setInterval(updateQueueCount, 30000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offlineQueueProcessed', handleQueueProcessed);
      clearInterval(interval);
    };
  }, [queueCount]);

  // Always show if offline or has pending queue items
  if (!showStatus && isOnline && queueCount === 0) return null;

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-50 flex items-center space-x-2 transition-all ${
      isOnline ? (queueCount > 0 ? 'bg-amber-500' : 'bg-green-500') : 'bg-red-500'
    } text-white`}>
      {syncing ? (
        <>
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm font-medium">Menyinkronkan...</span>
        </>
      ) : isOnline ? (
        queueCount > 0 ? (
          <>
            <Cloud className="w-4 h-4" />
            <span className="text-sm font-medium">{queueCount} aksi menunggu sync</span>
          </>
        ) : (
          <>
            <Wifi className="w-4 h-4" />
            <span className="text-sm font-medium">Kembali Online</span>
          </>
        )
      ) : (
        <>
          <WifiOff className="w-4 h-4" />
          <span className="text-sm font-medium">Mode Offline</span>
        </>
      )}
    </div>
  );
}
