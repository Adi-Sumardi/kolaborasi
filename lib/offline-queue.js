// Offline Queue Manager for Background Sync

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
      maxRetries: 3
    };
    
    return new Promise((resolve, reject) => {
      const request = store.add(queueItem);
      request.onsuccess = () => {
        console.log('[Offline Queue] Added action:', action.type, action.url);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => {
        // Trigger background sync if supported
        if ('serviceWorker' in navigator && 'sync' in registration) {
          navigator.serviceWorker.ready.then(registration => {
            return registration.sync.register('sync-offline-actions');
          }).catch(err => {
            console.warn('[Offline Queue] Background sync registration failed:', err);
          });
        }
      };
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
        console.log(`[Offline Queue] ${request.result.length} pending actions`);
        resolve(request.result);
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
  const queue = await getQueue();
  
  if (queue.length === 0) {
    console.log('[Offline Queue] No actions to sync');
    return { success: 0, failed: 0 };
  }
  
  console.log(`[Offline Queue] Processing ${queue.length} actions...`);
  
  const results = {
    success: 0,
    failed: 0
  };
  
  for (const item of queue) {
    try {
      // Retry limit check
      if (item.retries >= item.maxRetries) {
        console.warn('[Offline Queue] Max retries reached for:', item.url);
        await removeFromQueue(item.id);
        results.failed++;
        continue;
      }
      
      // Execute the queued action
      const response = await fetch(item.url, {
        method: item.method,
        headers: item.headers || {},
        body: item.body ? JSON.stringify(item.body) : undefined
      });
      
      if (response.ok) {
        console.log('[Offline Queue] ✅ Synced:', item.type, item.url);
        await removeFromQueue(item.id);
        results.success++;
      } else {
        console.warn('[Offline Queue] ❌ Failed:', response.status, item.url);
        await incrementRetry(item.id);
        results.failed++;
      }
    } catch (error) {
      console.error('[Offline Queue] Sync error:', error);
      await incrementRetry(item.id);
      results.failed++;
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
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

// Clear all synced items
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
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[Offline Queue] Clear synced error:', error);
  }
}

// Get queue count
export async function getQueueCount() {
  try {
    const queue = await getQueue();
    return queue.length;
  } catch (error) {
    return 0;
  }
}
