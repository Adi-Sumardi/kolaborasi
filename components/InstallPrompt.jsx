'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Download } from 'lucide-react';

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone === true;
    
    if (isStandalone) {
      console.log('✅ App already installed');
      return;
    }

    // Check if user dismissed before
    const dismissed = localStorage.getItem('pwa-prompt-dismissed');
    if (dismissed) {
      const dismissedTime = parseInt(dismissed);
      const daysPassed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
      if (daysPassed < 7) {
        console.log('PWA prompt dismissed recently, waiting...');
        return;
      }
    }

    const handler = (e) => {
      console.log('✅ beforeinstallprompt event fired');
      e.preventDefault();
      setDeferredPrompt(e);
      
      // Show prompt after 3 seconds (first visit)
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    window.addEventListener('appinstalled', () => {
      console.log('✅ PWA installed successfully');
      setShowPrompt(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      console.log('No install prompt available');
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('✅ User accepted install');
    } else {
      console.log('❌ User dismissed install');
    }
    
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
    console.log('PWA prompt dismissed');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white shadow-2xl rounded-lg p-4 border border-gray-200 z-50 animate-slide-up">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-600"
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>
      
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
            <Download className="w-6 h-6 text-white" />
          </div>
        </div>
        
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">
            Install Workspace
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Install aplikasi untuk akses lebih cepat dan bisa digunakan offline
          </p>
          
          <div className="flex space-x-2 mt-3">
            <Button onClick={handleInstall} size="sm" className="flex-1">
              Install Sekarang
            </Button>
            <Button onClick={handleDismiss} variant="outline" size="sm">
              Nanti Saja
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
