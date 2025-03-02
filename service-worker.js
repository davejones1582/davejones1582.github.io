/**
 * Enhanced Service Worker with better caching and offline support
 */
const CACHE_NAME = 'reddit-video-gallery-v2';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Assets to pre-cache for offline use
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/styles/main.css',
  '/styles/mobile.css',
  '/scripts/main.js',
  '/scripts/api.js',
  '/scripts/storage.js',
  '/scripts/ui.js',
  '/scripts/video.js',
  '/scripts/lightbox.js',
  '/scripts/mobile-detection.js',
  '/scripts/mobile-main.js',
  '/scripts/ios-fixes.js',
  '/icons/film-icon-192.png',
  '/icons/film-icon-512.png'
];

/**
 * Install event - cache static assets with progress tracking
 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching static assets...');
        
        // Cache assets sequentially with progress tracking
        return Promise.all(
          STATIC_ASSETS.map(async (asset, index) => {
            try {
              const response = await fetch(asset);
              if (!response.ok) {
                throw new Error(`Failed to fetch ${asset}`);
              }
              await cache.put(asset, response);
              console.log(`Cached ${index + 1}/${STATIC_ASSETS.length}: ${asset}`);
              return true;
            } catch (error) {
              console.error(`Failed to cache ${asset}:`, error);
              return false;
            }
          })
        );
      })
      .then(() => {
        console.log('Static assets cached successfully');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Error during service worker installation:', error);
      })
  );
});

/**
 * Activate event - clean up old caches and take control of clients
 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // Delete old version caches but keep the current one
            if (cacheName !== CACHE_NAME) {
              console.log(`Deleting old cache: ${cacheName}`);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker activated and taking control');
        return self.clients.claim();
      })
  );
});

/**
 * Check if URL is for an API request
 * 
 * @param {string} url - URL to check
 * @returns {boolean} - Is API request
 */
function isApiRequest(url) {
  return url.includes('reddit.com') || 
         url.includes('corsproxy.io') || 
         url.includes('redgifs.com/api');
}

/**
 * Check if URL is for a media file
 * 
 * @param {string} url - URL to check
 * @returns {boolean} - Is media file
 */
function isMediaFile(url) {
  return url.match(/\.(mp4|webm|gif|jpe?g|png|svg|webp)$/i) !== null;
}

/**
 * Add timestamp to cached responses
 * 
 * @param {Response} response - Original response
 * @returns {Response} - Response with timestamp
 */
async function addTimestampToResponse(response) {
  if (!response || !response.body) return response;
  
  const timestamp = Date.now();
  const clonedResponse = response.clone();
  const data = await clonedResponse.blob();
  
  // Create headers with timestamp
  const headers = new Headers(response.headers);
  headers.append('sw-cache-timestamp', timestamp.toString());
  
  // Create new response with timestamp
  return new Response(data, {
    status: response.status,
    statusText: response.statusText,
    headers: headers
  });
}

/**
 * Check if a response is stale
 * 
 * @param {Response} response - Response to check
 * @returns {boolean} - Is stale
 */
function isResponseStale(response) {
  if (!response || !response.headers) return true;
  
  const timestampHeader = response.headers.get('sw-cache-timestamp');
  if (!timestampHeader) return true;
  
  const timestamp = parseInt(timestampHeader, 10);
  const now = Date.now();
  
  return (now - timestamp) > CACHE_DURATION;
}

/**
 * Main fetch event handler with improved strategy
 */
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET' || 
      url.protocol === 'chrome-extension:') {
    return;
  }
  
  // Handle API requests (network first, fall back to cache)
  if (isApiRequest(url.href)) {
    event.respondWith(
      fetchWithNetworkFirst(event.request)
    );
  }
  // Handle media files (cache first with background refresh)
  else if (isMediaFile(url.href)) {
    event.respondWith(
      fetchWithStaleWhileRevalidate(event.request)
    );
  }
  // For static assets, try cache first, then network
  else {
    event.respondWith(
      fetchWithCacheFirst(event.request)
    );
  }
});

/**
 * Network-first strategy
 * 
 * @param {Request} request - Request to fetch
 * @returns {Promise<Response>} - Response
 */
async function fetchWithNetworkFirst(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    const cachedResponse = await addTimestampToResponse(networkResponse.clone());
    
    // Cache the successful response
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, cachedResponse);
    
    return networkResponse;
  } catch (error) {
    console.log('Network request failed, using cache for:', request.url);
    
    // Fall back to cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If nothing in cache, return a simple offline response
    if (request.headers.get('Accept').includes('text/html')) {
      return caches.match('/index.html');
    }
    
    throw error;
  }
}

/**
 * Cache-first strategy
 * 
 * @param {Request} request - Request to fetch
 * @returns {Promise<Response>} - Response
 */
async function fetchWithCacheFirst(request) {
  // Try cache first
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // If not in cache, fetch from network
  try {
    const networkResponse = await fetch(request);
    const responseToCache = networkResponse.clone();
    
    // Cache the response for future
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, responseToCache);
    
    return networkResponse;
  } catch (error) {
    console.error('Error fetching and caching:', error);
    
    // For HTML requests, return the cached index page as fallback
    if (request.headers.get('Accept').includes('text/html')) {
      return caches.match('/index.html');
    }
    
    throw error;
  }
}

/**
 * Stale-while-revalidate strategy
 * 
 * @param {Request} request - Request to fetch
 * @returns {Promise<Response>} - Response
 */
async function fetchWithStaleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // Get from cache
  const cachedResponse = await cache.match(request);
  
  // Clone request for parallel fetch
  const fetchPromise = fetch(request)
    .then(async networkResponse => {
      // Cache the new response
      await cache.put(request, networkResponse.clone());
      return networkResponse;
    })
    .catch(error => {
      console.log('Failed to fetch and update cache:', error);
      // Return undefined so we fall back to cached response
      return undefined;
    });
  
  // Return cached response immediately, but update cache in background
  return cachedResponse || fetchPromise;
}

/**
 * Handle offline favorite syncing 
 */
self.addEventListener('sync', event => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

/**
 * Handle push notifications
 */
self.addEventListener('push', event => {
  const data = event.data.json();
  
  const options = {
    body: data.body || 'New content is available!',
    icon: '/icons/film-icon-192.png',
    badge: '/icons/film-icon-192.png',
    data: data.url || '/'
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Reddit Video Gallery', options)
  );
});

/**
 * Handle notification clicks
 */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({type: 'window'})
      .then(clientList => {
        // If a window client is already open, focus it
        for (const client of clientList) {
          if (client.url === event.notification.data && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Otherwise open a new window
        if (clients.openWindow) {
          return clients.openWindow(event.notification.data);
        }
      })
  );
});

/**
 * Sync favorites when online
 */
async function syncFavorites() {
  // This would normally use a local storage library like localforage
  // For this demo, we'll use a simpler approach
  const stored = localStorage.getItem('pendingFavoriteActions');
  
  if (!stored) return;
  
  try {
    const actions = JSON.parse(stored);
    if (!actions || !actions.length) return;
    
    // Here you would implement logic to sync with a backend
    console.log('Syncing favorite actions:', actions);
    
    // For now, we'll just mark them as synced
    localStorage.setItem('pendingFavoriteActions', JSON.stringify([]));
    
    // Notify any open clients that sync is complete
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'FAVORITES_SYNCED',
        count: actions.length
      });
    });
    
  } catch (e) {
    console.error('Error syncing favorites:', e);
  }
}