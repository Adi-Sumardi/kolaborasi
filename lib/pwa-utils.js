// PWA Utility Functions - Enhanced with Push Notifications and IndexedDB

import { saveOfflineData, getOfflineData, STORES } from './offline-db';
import { processQueue, getQueueCount } from './offline-queue';

// ============================================
// SERVICE WORKER REGISTRATION
// ============================================

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.log('[PWA] Service Worker not supported');
    return Promise.resolve(null);
  }

  return navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      console.log('✅ Service Worker registered:', registration.scope);
      
      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000); // Every hour
      
      // Listen for update events
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        console.log('🔄 New Service Worker found, installing...');
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('✅ New Service Worker installed, ready to activate');
            // Dispatch custom event for UI to handle
            window.dispatchEvent(new CustomEvent('swUpdate', { detail: { registration } }));
          }
        });
      });
      
      // Listen for messages from service worker
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
      
      return registration;
    })
    .catch((error) => {
      console.error('❌ Service Worker registration failed:', error);
      return null;
    });
}

// Handle messages from service worker
function handleSWMessage(event) {
  console.log('[PWA] Message from SW:', event.data);
  
  if (event.data && event.data.type === 'SYNC_OFFLINE_ACTIONS') {
    // Process offline queue when back online
    processOfflineQueue();
  }
}

// Process offline queue
async function processOfflineQueue() {
  const count = await getQueueCount();
  if (count > 0) {
    console.log(`[PWA] Processing ${count} offline actions...`);
    const results = await processQueue();
    console.log('[PWA] Queue processed:', results);
    
    // Dispatch event for UI update
    window.dispatchEvent(new CustomEvent('offlineQueueProcessed', { detail: results }));
  }
}

export function unregisterServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  navigator.serviceWorker.ready.then((registration) => {
    registration.unregister();
    console.log('Service Worker unregistered');
  });
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================

export async function subscribeToPushNotifications() {
  if (typeof window === 'undefined') return null;
  
  try {
    // Check if push notifications are supported
    if (!('PushManager' in window)) {
      console.log('[Push] Push notifications not supported');
      return null;
    }
    
    // Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[Push] Notification permission denied');
      return null;
    }
    
    // Get VAPID public key from server
    const response = await fetch('/api/pwa/vapid-key');
    if (!response.ok) {
      console.error('[Push] Failed to get VAPID key');
      return null;
    }
    const { publicKey } = await response.json();
    
    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;
    
    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    
    console.log('[Push] Subscribed successfully');
    
    // Send subscription to server
    const token = localStorage.getItem('token');
    if (token) {
      await fetch('/api/pwa/save-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ subscription: subscription.toJSON() })
      });
    }
    
    return subscription;
  } catch (error) {
    console.error('[Push] Subscription error:', error);
    return null;
  }
}

export async function unsubscribeFromPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      await subscription.unsubscribe();
      
      // Notify server
      const token = localStorage.getItem('token');
      if (token) {
        await fetch('/api/pwa/remove-subscription', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
      }
      
      console.log('[Push] Unsubscribed successfully');
    }
  } catch (error) {
    console.error('[Push] Unsubscribe error:', error);
  }
}

export async function isPushSubscribed() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch (error) {
    return false;
  }
}

// ============================================
// OFFLINE DATA SYNC
// ============================================

// Sync jobdesks to IndexedDB
export async function syncJobdesksToOffline(jobdesks) {
  try {
    await saveOfflineData(STORES.JOBDESKS, jobdesks);
    console.log('[PWA] Jobdesks synced to offline storage');
  } catch (error) {
    console.error('[PWA] Failed to sync jobdesks:', error);
  }
}

// Get offline jobdesks
export async function getOfflineJobdesks() {
  try {
    return await getOfflineData(STORES.JOBDESKS);
  } catch (error) {
    console.error('[PWA] Failed to get offline jobdesks:', error);
    return [];
  }
}

// Sync chat messages to IndexedDB
export async function syncChatMessagesToOffline(roomId, messages) {
  try {
    const messagesWithRoom = messages.map(m => ({ ...m, roomId }));
    await saveOfflineData(STORES.CHAT_MESSAGES, messagesWithRoom);
    console.log('[PWA] Chat messages synced to offline storage');
  } catch (error) {
    console.error('[PWA] Failed to sync chat messages:', error);
  }
}

// Get offline chat messages
export async function getOfflineChatMessages(roomId) {
  try {
    const allMessages = await getOfflineData(STORES.CHAT_MESSAGES);
    return allMessages.filter(m => m.roomId === roomId);
  } catch (error) {
    console.error('[PWA] Failed to get offline chat messages:', error);
    return [];
  }
}

// ============================================
// STATUS UTILITIES
// ============================================

export function checkOnlineStatus() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

export function canInstallPWA() {
  if (typeof window === 'undefined') return false;
  if (isStandalone()) return false;
  return true;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Pre-cache important pages
export async function precachePages() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({
    type: 'CACHE_URLS',
    urls: [
      '/',
      '/?page=jobdesk',
      '/?page=todo',
      '/?page=chat',
      '/?page=kpi'
    ]
  });
}
