// Custom hook for offline-first data fetching
'use client';

import { useState, useEffect, useCallback } from 'react';
import { saveOfflineData, getOfflineData, STORES } from './offline-db';
import { addToQueue } from './offline-queue';

// Mapping of API endpoints to IndexedDB stores
const STORE_MAP = {
  '/api/jobdesks': STORES.JOBDESKS,
  '/api/todos': STORES.TODOS,
  '/api/users': STORES.USERS,
  '/api/daily-logs': STORES.DAILY_LOGS,
  '/api/chat/messages': STORES.CHAT_MESSAGES,
};

// Generic offline-first fetch hook
export function useOfflineData(url, options = {}) {
  const [data, setData] = useState(options.initialData || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFromCache, setIsFromCache] = useState(false);

  const storeName = options.storeName || STORE_MAP[url];
  const enabled = options.enabled !== false;

  const fetchData = useCallback(async () => {
    if (!enabled || !url) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // First, try to get cached data
      if (storeName) {
        const cachedData = await getOfflineData(storeName);
        if (cachedData && cachedData.length > 0) {
          console.log(`[OfflineData] Loaded ${cachedData.length} items from cache for ${url}`);
          setData(cachedData);
          setIsFromCache(true);
        }
      }

      // If online, fetch fresh data
      if (navigator.onLine) {
        const token = localStorage.getItem('token');
        const response = await fetch(url, {
          headers: {
            'Authorization': token ? `Bearer ${token}` : '',
            'Content-Type': 'application/json',
            ...options.headers
          }
        });

        if (response.ok) {
          const freshData = await response.json();
          const dataArray = Array.isArray(freshData) ? freshData : 
                           freshData.data ? freshData.data : 
                           freshData.jobdesks ? freshData.jobdesks :
                           freshData.todos ? freshData.todos :
                           freshData.users ? freshData.users :
                           freshData.logs ? freshData.logs :
                           freshData.messages ? freshData.messages :
                           [freshData];
          
          setData(dataArray);
          setIsFromCache(false);

          // Cache the fresh data
          if (storeName && Array.isArray(dataArray)) {
            await saveOfflineData(storeName, dataArray);
            console.log(`[OfflineData] Cached ${dataArray.length} items for ${url}`);
          }
        } else {
          const errorData = await response.json();
          // If we have cached data, don't set error
          if (!data) {
            setError(errorData.error || 'Failed to fetch data');
          }
        }
      } else {
        console.log(`[OfflineData] Offline, using cached data for ${url}`);
        // Already using cached data
      }
    } catch (err) {
      console.error(`[OfflineData] Error fetching ${url}:`, err);
      // If we have cached data, don't set error
      if (!data) {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [url, storeName, enabled, options.headers, data]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    return fetchData();
  }, [fetchData]);

  return { data, loading, error, isFromCache, refetch };
}

// Offline-aware mutation function
export async function offlineMutation(url, method, body, options = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Authorization': token ? `Bearer ${token}` : '',
    'Content-Type': 'application/json',
    ...options.headers
  };

  // If online, try direct API call
  if (navigator.onLine) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined
      });

      if (response.ok) {
        const result = await response.json();
        
        // Update local cache if applicable
        if (options.updateStore && options.storeName) {
          const cachedData = await getOfflineData(options.storeName);
          if (method === 'POST' && result.id) {
            // Add new item
            await saveOfflineData(options.storeName, [...cachedData, result]);
          } else if (method === 'PUT' && body.id) {
            // Update existing item
            const updated = cachedData.map(item => 
              item.id === body.id ? { ...item, ...result } : item
            );
            await saveOfflineData(options.storeName, updated);
          } else if (method === 'DELETE') {
            // Remove deleted item
            const filtered = cachedData.filter(item => item.id !== options.deleteId);
            await saveOfflineData(options.storeName, filtered);
          }
        }
        
        return { success: true, data: result, offline: false };
      } else {
        const errorData = await response.json();
        return { success: false, error: errorData.error || 'Request failed', offline: false };
      }
    } catch (err) {
      console.error('[OfflineMutation] Network error:', err);
      // Fall through to offline handling
    }
  }

  // If offline or network error, add to queue
  console.log('[OfflineMutation] Adding to offline queue:', method, url);
  
  await addToQueue({
    type: `${method}_${url.split('/').pop()}`,
    method,
    url,
    body,
    headers
  });

  // Optimistically update local cache
  if (options.optimisticUpdate && options.storeName) {
    const cachedData = await getOfflineData(options.storeName);
    if (method === 'POST' && body) {
      const tempId = `temp-${Date.now()}`;
      await saveOfflineData(options.storeName, [...cachedData, { ...body, id: tempId, _offline: true }]);
    }
  }

  return { 
    success: true, 
    offline: true, 
    queued: true,
    message: 'Aksi akan disinkronkan saat online' 
  };
}

// Helper to sync specific data
export async function syncData(url, storeName) {
  if (!navigator.onLine) {
    console.log('[SyncData] Offline, skipping sync');
    return null;
  }

  try {
    const token = localStorage.getItem('token');
    const response = await fetch(url, {
      headers: {
        'Authorization': token ? `Bearer ${token}` : '',
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      const dataArray = Array.isArray(data) ? data : 
                       data.data || data.jobdesks || data.todos || 
                       data.users || data.logs || data.messages || [];
      
      await saveOfflineData(storeName, dataArray);
      console.log(`[SyncData] Synced ${dataArray.length} items for ${url}`);
      return dataArray;
    }
  } catch (err) {
    console.error('[SyncData] Error:', err);
  }
  return null;
}

export { STORES };
