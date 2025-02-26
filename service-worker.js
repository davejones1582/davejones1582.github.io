// service-worker.js
const CACHE_NAME = 'reddit-video-gallery-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles/main.css',
  '/scripts/app.js'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  const currentCaches = [CACHE_NAME];
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
      })
      .then(cachesToDelete => {
        return Promise.all(cachesToDelete.map(cacheToDelete => {
          return caches.delete(cacheToDelete);
        }));
      })
      .then(() => self.clients.claim())
  );
});

// Network-first strategy for API requests, cache-first for assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // Handle API requests (network first, fall back to cache)
  if (url.href.includes('reddit.com') || url.href.includes('corsproxy.io')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Clone the response for the cache
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME)
            .then(cache => {
              // Cache the successful response
              cache.put(event.request, responseToCache);
            });
            
          return response;
        })
        .catch(() => {
          // If network fails, try to return from cache
          return caches.match(event.request);
        })
    );
  } 
  // For static assets, try cache first, then network
  else {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }
          
          // Not in cache, fetch from network
          return fetch(event.request)
            .then(response => {
              // Clone and cache the response for future
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
                
              return response;
            });
        })
    );
  }
});

// Handle background sync for favoriting when offline
self.addEventListener('sync', event => {
  if (event.tag === 'sync-favorites') {
    event.waitUntil(syncFavorites());
  }
});

// Function to sync favorites when online
async function syncFavorites() {
  // This would normally use a local storage library like localforage
  // For this demo, we'll use a simpler approach
  const pendingActions = localStorage.getItem('pendingFavoriteActions');
  
  if (!pendingActions) return;
  
  try {
    const actions = JSON.parse(pendingActions);
    if (!actions || !actions.length) return;
    
    // Here you would implement logic to sync with a backend
    console.log('Syncing favorite actions:', actions);
    
    // Clear pending actions after successful sync
    localStorage.setItem('pendingFavoriteActions', JSON.stringify([]));
  } catch (e) {
    console.error('Error syncing favorites:', e);
  }
}
