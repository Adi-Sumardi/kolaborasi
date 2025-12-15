// IndexedDB for Offline Data Storage - Enhanced Version

const DB_NAME = 'workspace-offline';
const DB_VERSION = 2;

export const STORES = {
  JOBDESKS: 'jobdesks',
  TODOS: 'todos',
  USERS: 'users',
  DAILY_LOGS: 'daily_logs',
  CHAT_MESSAGES: 'chat_messages',
  OFFLINE_QUEUE: 'offline_queue',
  ATTACHMENTS: 'attachments',
  PROFILE: 'profile'
};

let dbInstance = null;

// Open database connection (singleton pattern)
export function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
      console.error('[IndexedDB] Error opening database:', request.error);
      reject(request.error);
    };
    
    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[IndexedDB] Database opened successfully');
      resolve(dbInstance);
    };
    
    request.onupgradeneeded = (event) => {
      console.log('[IndexedDB] Upgrading database to version', DB_VERSION);
      const db = event.target.result;
      
      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.JOBDESKS)) {
        const jobdesksStore = db.createObjectStore(STORES.JOBDESKS, { keyPath: 'id' });
        jobdesksStore.createIndex('status', 'status', { unique: false });
        jobdesksStore.createIndex('assignedTo', 'assignedTo', { unique: false, multiEntry: true });
        console.log('[IndexedDB] Created jobdesks store');
      }
      
      if (!db.objectStoreNames.contains(STORES.TODOS)) {
        const todosStore = db.createObjectStore(STORES.TODOS, { keyPath: 'id' });
        todosStore.createIndex('status', 'status', { unique: false });
        todosStore.createIndex('userId', 'userId', { unique: false });
        console.log('[IndexedDB] Created todos store');
      }
      
      if (!db.objectStoreNames.contains(STORES.USERS)) {
        const usersStore = db.createObjectStore(STORES.USERS, { keyPath: 'id' });
        usersStore.createIndex('role', 'role', { unique: false });
        console.log('[IndexedDB] Created users store');
      }
      
      if (!db.objectStoreNames.contains(STORES.DAILY_LOGS)) {
        const logsStore = db.createObjectStore(STORES.DAILY_LOGS, { keyPath: 'id' });
        logsStore.createIndex('userId', 'userId', { unique: false });
        logsStore.createIndex('date', 'date', { unique: false });
        console.log('[IndexedDB] Created daily_logs store');
      }
      
      if (!db.objectStoreNames.contains(STORES.CHAT_MESSAGES)) {
        const chatStore = db.createObjectStore(STORES.CHAT_MESSAGES, { keyPath: 'id' });
        chatStore.createIndex('roomId', 'roomId', { unique: false });
        chatStore.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('[IndexedDB] Created chat_messages store');
      }
      
      if (!db.objectStoreNames.contains(STORES.OFFLINE_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.OFFLINE_QUEUE, { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('synced', 'synced', { unique: false });
        console.log('[IndexedDB] Created offline_queue store');
      }
      
      if (!db.objectStoreNames.contains(STORES.ATTACHMENTS)) {
        const attachStore = db.createObjectStore(STORES.ATTACHMENTS, { keyPath: 'id' });
        attachStore.createIndex('jobdeskId', 'jobdeskId', { unique: false });
        attachStore.createIndex('userId', 'userId', { unique: false });
        console.log('[IndexedDB] Created attachments store');
      }
      
      if (!db.objectStoreNames.contains(STORES.PROFILE)) {
        db.createObjectStore(STORES.PROFILE, { keyPath: 'id' });
        console.log('[IndexedDB] Created profile store');
      }
    };
  });
}

// Save data to IndexedDB
export async function saveOfflineData(storeName, data) {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    if (Array.isArray(data)) {
      for (const item of data) {
        store.put(item);
      }
      console.log(`[IndexedDB] Saved ${data.length} items to ${storeName}`);
    } else {
      store.put(data);
      console.log(`[IndexedDB] Saved 1 item to ${storeName}`);
    }
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Save error:', error);
    throw error;
  }
}

// Get data from IndexedDB
export async function getOfflineData(storeName, id = null) {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    
    if (id) {
      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    } else {
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          console.log(`[IndexedDB] Retrieved ${request.result.length} items from ${storeName}`);
          resolve(request.result);
        };
        request.onerror = () => reject(request.error);
      });
    }
  } catch (error) {
    console.error('[IndexedDB] Get error:', error);
    return id ? null : [];
  }
}

// Delete data from IndexedDB
export async function deleteOfflineData(storeName, id = null) {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    
    if (id) {
      store.delete(id);
      console.log(`[IndexedDB] Deleted item ${id} from ${storeName}`);
    } else {
      store.clear();
      console.log(`[IndexedDB] Cleared all items from ${storeName}`);
    }
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Delete error:', error);
    throw error;
  }
}

// Query data by index
export async function queryOfflineData(storeName, indexName, value) {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const index = store.index(indexName);
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(value);
      request.onsuccess = () => {
        console.log(`[IndexedDB] Query ${indexName}=${value} returned ${request.result.length} items`);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('[IndexedDB] Query error:', error);
    return [];
  }
}

// Clear all offline data
export async function clearAllOfflineData() {
  try {
    const db = await openDB();
    const storeNames = Object.values(STORES);
    
    for (const storeName of storeNames) {
      if (db.objectStoreNames.contains(storeName)) {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).clear();
        await new Promise((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      }
    }
    
    console.log('[IndexedDB] All offline data cleared');
  } catch (error) {
    console.error('[IndexedDB] Clear all error:', error);
  }
}

// Get storage usage estimate
export async function getStorageEstimate() {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    return {
      usage: estimate.usage,
      quota: estimate.quota,
      usagePercentage: ((estimate.usage / estimate.quota) * 100).toFixed(2)
    };
  }
  return null;
}
