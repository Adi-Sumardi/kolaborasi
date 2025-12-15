// Offline Queue Manager for Background Sync - Enhanced Version

import { openDB, STORES } from './offline-db';

// Add action to offline queue
export async function addToQueue(action) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.OFFLINE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_QUEUE);
    
    const queueItem = {
      ...action,
      timestamp: Date.now(),
      synced: false,
      retries: 0,
      maxRetries: 3,
      createdOffline: true
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(queueItem);
      request.onsuccess = () => {
        console.log('[Offline Queue] Added action:', action.type, action.url);
        
        // Trigger background sync if supported
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          navigator.serviceWorker.ready.then(registration => {
            return registration.sync.register('sync-offline-actions');
          }).catch(err => {
            console.warn('[Offline Queue] Background sync registration failed:', err);
          });
        }
        
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Offline Queue] Add error:', error);
    throw error;
  }
}

// Get all pending actions from queue
export async function getQueue() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.OFFLINE_QUEUE, 'readonly');
    const store = tx.objectStore(STORES.OFFLINE_QUEUE);
    const index = store.index('synced');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(false);
      request.onsuccess = () => {
        // Sort by timestamp (oldest first)
        const queue = request.result.sort((a, b) => a.timestamp - b.timestamp);
        console.log(`[Offline Queue] ${queue.length} pending actions`);
        resolve(queue);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Offline Queue] Get queue error:', error);
    return [];
  }
}

// Process offline queue
export async function processQueue() {
  // Check if we're online
  if (!navigator.onLine) {
    console.log('[Offline Queue] Still offline, skipping sync');
    return { success: 0, failed: 0, pending: true };
  }
  
  const queue = await getQueue();
  
  if (queue.length === 0) {
    console.log('[Offline Queue] No actions to sync');
    return { success: 0, failed: 0 };
  }
  
  console.log(`[Offline Queue] Processing ${queue.length} actions...`);
  
  const results = {
    success: 0,
    failed: 0,
    details: []
  };
  
  // Get token for authenticated requests
  const token = localStorage.getItem('token');
  
  for (const item of queue) {
    try {
      // Retry limit check
      if (item.retries >= item.maxRetries) {
        console.warn('[Offline Queue] Max retries reached for:', item.url);
        await markAsSynced(item.id, false);
        results.failed++;
        results.details.push({ id: item.id, type: item.type, status: 'max_retries' });
        continue;
      }
      
      // Build headers
      const headers = {
        'Content-Type': 'application/json',
        ...(item.headers || {})
      };
      
      // Add auth token if available
      if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Execute the queued action
      const response = await fetch(item.url, {
        method: item.method,
        headers,
        body: item.body ? JSON.stringify(item.body) : undefined
      });
      
      if (response.ok) {
        console.log('[Offline Queue] ✅ Synced:', item.type, item.url);
        await removeFromQueue(item.id);
        results.success++;
        results.details.push({ id: item.id, type: item.type, status: 'success' });
      } else {
        const errorText = await response.text();
        console.warn('[Offline Queue] ❌ Failed:', response.status, item.url, errorText);
        await incrementRetry(item.id);
        results.failed++;
        results.details.push({ id: item.id, type: item.type, status: 'failed', error: response.status });
      }
    } catch (error) {
      console.error('[Offline Queue] Sync error:', error);
      await incrementRetry(item.id);
      results.failed++;
      results.details.push({ id: item.id, type: item.type, status: 'error', error: error.message });
    }
    
    // Small delay between requests to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log(`[Offline Queue] Sync complete: ${results.success} success, ${results.failed} failed`);
  return results;
}

// Remove item from queue
async function removeFromQueue(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.OFFLINE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_QUEUE);
    
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Offline Queue] Remove error:', error);
  }
}

// Mark item as synced (or failed permanently)
async function markAsSynced(id, success = true) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.OFFLINE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_QUEUE);
    
    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.synced = true;
          item.syncedAt = Date.now();
          item.syncSuccess = success;
          const putRequest = store.put(item);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.error('[Offline Queue] Mark synced error:', error);
  }
}

// Increment retry counter
async function incrementRetry(id) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.OFFLINE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_QUEUE);
    
    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.retries = (item.retries || 0) + 1;
          item.lastRetryAt = Date.now();
          const putRequest = store.put(item);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.error('[Offline Queue] Increment retry error:', error);
  }
}

// Clear all synced items from queue
export async function clearSyncedQueue() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.OFFLINE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_QUEUE);
    const index = store.index('synced');
    
    return new Promise((resolve, reject) => {
      const request = index.openCursor(IDBKeyRange.only(true));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          console.log('[Offline Queue] Cleared synced items');
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Offline Queue] Clear synced error:', error);
  }
}

// Get queue count (pending items)
export async function getQueueCount() {
  try {
    const queue = await getQueue();
    return queue.length;
  } catch (error) {
    return 0;
  }
}

// Clear entire queue
export async function clearQueue() {
  try {
    const db = await openDB();
    const tx = db.transaction(STORES.OFFLINE_QUEUE, 'readwrite');
    const store = tx.objectStore(STORES.OFFLINE_QUEUE);
    
    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => {
        console.log('[Offline Queue] Queue cleared');
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Offline Queue] Clear queue error:', error);
  }
}
