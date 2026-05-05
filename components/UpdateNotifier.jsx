'use client';

import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';

export function UpdateNotifier() {
  const [initialStartTime, setInitialStartTime] = useState(null);
  const toastIdRef = useRef(null);

  useEffect(() => {
    // Initial fetch to get the current server start time
    const fetchInitialTime = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const data = await res.json();
          if (data.serverStartTime) {
            setInitialStartTime(data.serverStartTime);
          }
        }
      } catch (error) {
        console.error('Failed to fetch initial health status:', error);
      }
    };

    fetchInitialTime();
  }, []);

  useEffect(() => {
    if (!initialStartTime) return;

    // Poll every 60 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/health', {
          // Add cache: 'no-store' to ensure we get fresh data
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        
        if (res.ok) {
          const data = await res.json();
          // If server start time has changed, there was an update/restart
          if (data.serverStartTime && data.serverStartTime !== initialStartTime) {
            // Show toast only if not already shown
            if (!toastIdRef.current) {
              toastIdRef.current = toast.info(
                <div className="flex flex-col gap-2">
                  <p className="font-semibold text-sm">Pembaruan Sistem Tersedia! 🚀</p>
                  <p className="text-xs">Ada fitur baru atau perbaikan dari server. Silakan muat ulang halaman untuk menerapkan pembaruan.</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="mt-2 bg-blue-600 text-white py-1.5 px-3 rounded text-xs font-medium hover:bg-blue-700 transition-colors w-full"
                  >
                    Muat Ulang Sekarang
                  </button>
                </div>,
                {
                  duration: Infinity, // Don't auto-dismiss
                  position: 'bottom-right',
                  onDismiss: () => {
                    toastIdRef.current = null;
                  }
                }
              );
            }
          }
        }
      } catch (error) {
        console.error('Failed to poll health status:', error);
      }
    }, 60000); // 1 minute

    return () => clearInterval(interval);
  }, [initialStartTime]);

  return null;
}
