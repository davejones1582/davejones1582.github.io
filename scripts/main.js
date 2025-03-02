/**
 * main.js - Enhanced main entry point with authentication and content discovery
 */
import { DEFAULT_SUBREDDITS, fetchRedditVideos, fetchSubredditInfo } from './api.js';
import { 
    saveSettings, loadSettings, saveTheme, loadTheme 
} from './storage.js';
import { 
    showError, showLoading, hideLoading, renderVideos, updateSortButtons, 
    renderSubredditTags, initThemeToggle, updateThemeButton, applyTheme, showToast 
} from './ui.js';
import { updateMuteState, optimizeVideoMemory } from './video.js';
import { showLightbox, closeLightbox, navigate } from './lightbox.js';
import { isIOSSafari, isMobileDevice } from './mobile-detection.js';
import { initializeMobileApp } from './mobile-main.js';
import { initAuth } from './auth.js';
import { 
    initializeCollections,
    addToWatchHistory,
    isInCollection,
    toggleFavorite,
    getWatchHistory
} from './content-manager.js';
import {
    createProfileUI, 
    createCollectionsUI, 
    createWatchHistoryUI
} from './profile-ui.js';
import {
    initDiscovery, 
    loadRelatedVideos,
    addRelatedVideosStyles
} from './discovery-ui.js';

// Load additional CSS
function loadAdditionalCSS() {
    // Load mobile CSS if needed
    if (isMobileDevice()) {
        const mobileLink = document.createElement('link');
        mobileLink.rel = 'stylesheet';
        mobileLink.href = './styles/mobile.css';
        document.head.appendChild(mobileLink);
    }
    
    // Load layout CSS
    const layoutLink = document.createElement('link');
    layoutLink.rel = 'stylesheet';
    layoutLink.href = './styles/layout.css';
    document.head.appendChild(layoutLink);
}

// Check for iOS Safari and initialize appropriate version
async function initApp() {
    if (isIOSSafari()) {
        initializeMobileApp();
    } else {
        initializeApp();
    }
}

// App state
let allVideos = [];
let userSubreddits = [];
let activeSubreddits = [];
let currentVideoIndex = 0;
let afterToken = null;
let isLoading = false;
let hasMore = true;
let showingFavorites = false;
let searchTimeout;
let observer;
let isMuted = true;
let themeToggleButton;
let isSidebarOpen = false;
let currentSettings = {
    sort: 'hot',
    time: 'week',
    subreddits: [],
    compactView: false,
    autoplay: false,
    showDiscovery: true
};
let currentTheme = 'dark';

/**
 * Initialize the application
 */
function initializeApp() {
    // Initialize auth system
    initAuth();
    
    // Initialize collections system
    initializeCollections();
    
    // Load CSS
    loadAdditionalCSS();
    
    // Load saved settings
    const defaultSettings = {
        sort: 'hot',
        time: 'week',
        subreddits: [],
        compactView: false,
        autoplay: false,
        showDiscovery: true
    };
    
    currentSettings = loadSettings(defaultSettings);
    
    // Load theme
    currentTheme = loadTheme('dark');
    applyTheme(currentTheme);
    
    // Initialize UI components
    themeToggleButton = initThemeToggle(currentTheme, toggleTheme);
    
    // Initialize event listeners
    initEventListeners();
    
    // Get subreddit list from settings
    userSubreddits = currentSettings.subreddits.map(sub => sub.name);
    activeSubreddits = [...userSubreddits]; // Start with all active
    
    // Update sort buttons
    updateSortButtons(currentSettings.sort, showingFavorites);
    
    // If no subreddits, load defaults
    if (userSubreddits.length === 0) {
        loadDefaultSubreddits();
    } else {
        // Render subreddit tags
        renderSubredditTags(
            userSubreddits,
            activeSubreddits,
            toggleActiveSubreddit,
            removeSubreddit
        );
        
        // Initial load
        loadMoreVideos();
    }
    
    // Apply grid style
    const videoGrid = document.getElementById('video-grid');
    if (videoGrid && currentSettings.compactView) {
        videoGrid.classList.add('compact');
    }
    
    // Initialize discovery sections if enabled
    if (currentSettings.showDiscovery) {
        initDiscovery(selectVideo);
    } else {
        document.getElementById('trending-section').style.display = 'none';
        document.getElementById('recommendations-section').style.display = 'none';
    }
    
    // Initialize sidebar
    initSidebar();
    
    // Add styles for related videos
    addRelatedVideosStyles();
    
    // Initialize infinite scroll
    initObserver();
    
    // Register service worker
    registerServiceWorker();
}

/**
 * Register service worker for offline support
 */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/service-worker.js')
                .then(registration => {
                    console.log('ServiceWorker registered with scope:', registration.scope);
                })
                .catch(error => {
                    console.error('ServiceWorker registration failed:', error);
                });
        });
    }
}

/**
 * Set up event listeners
 */
function initEventListeners() {
    // Favorite toggle button
    const favToggle = document.getElementById('favorites-toggle');
    if (favToggle) {
        favToggle.addEventListener('click', toggleFavorites);
    }
    
    // Sound toggle button
    const soundToggle = document.getElementById('sound-toggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', toggleSound);
    }
    
    // Grid size toggle button
    const gridToggle = document.getElementById('grid-size-toggle');
    if (gridToggle) {
        gridToggle.addEventListener('click', toggleGridSize);
    }
    
    // Sidebar toggle button
    const sidebarToggle = document.getElementById('sidebar-toggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', toggleSidebar);
    }
    
    // Quick-add subreddit input
    const quickAddInput = document.getElementById('quick-subreddit-input');
    if (quickAddInput) {
        quickAddInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                quickAddSubreddit();
            }
        });
    }
    
    // Time select change
    const timeSelect = document.getElementById('time-select');
    if (timeSelect) {
        timeSelect.addEventListener('change', changeTimeFilter);
    }
    
    // Sort buttons
    initSortButtons();
    
    // Search input
    initSearchListener();
    
    // Prevent elastic scrolling on iOS in lightbox mode
    if (navigator.userAgent.match(/iP(hone|od|ad)/)) {
        document.body.addEventListener('touchmove', (e) => {
            if (document.getElementById('lightbox').style.display === 'flex') {
                e.preventDefault();
            }
        }, { passive: false });
    }
}

/**
 * Initialize sidebar
 */
function initSidebar() {
    // Create profile, collections, and history components
    const profileContainer = document.getElementById('profile-container');
    const collectionsContainer = document.getElementById('collections-container');
    const historyContainer = document.getElementById('history-container');
    
    if (profileContainer) {
        profileContainer.appendChild(createProfileUI());
    }
    
    if (collectionsContainer) {
        collectionsContainer.appendChild(createCollectionsUI(handleCollectionSelect));
    }
    
    if (historyContainer) {
        historyContainer.appendChild(createWatchHistoryUI(selectVideo, allVideos));
    }
    
    // Close sidebar button
    const closeButton = document.getElementById('close-sidebar');
    if (closeButton) {
        closeButton.addEventListener('click', closeSidebar);
    }
    
    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (isSidebarOpen && !e.target.closest('#sidebar') && !e.target.closest('#sidebar-toggle')) {
            closeSidebar();
        }
    });
}

/**
 * Toggle sidebar visibility
 */
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const contentArea = document.querySelector('.content-area');
    
    if (sidebar) {
        if (isSidebarOpen) {
            sidebar.classList.remove('open');
            contentArea.classList.remove('sidebar-open');
        } else {
            sidebar.classList.add('open');
            contentArea.classList.add('sidebar-open');
        }
        
        isSidebarOpen = !isSidebarOpen;
    }
}

/**
 * Close sidebar
 */
function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const contentArea = document.querySelector('.content-area');
    
    if (sidebar) {
        sidebar.classList.remove('open');
        contentArea.classList.remove('sidebar-open');
        isSidebarOpen = false;
    }
}

/**
 * Handle collection selection from sidebar
 * 
 * @param {string} collectionId - Collection ID
 */
function handleCollectionSelect(collectionId) {
    console.log(`Selected collection: ${collectionId}`);
    // Implement viewing collection videos
    closeSidebar();
    
    // TODO: Add collection view implementation
    showToast('Collection view will be added in a future update', 'info');
}

/**
 * Toggle theme
 */
function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(currentTheme);
    updateThemeButton(themeToggleButton, currentTheme);
    saveTheme(currentTheme);
}

/**
 * Initialize sort buttons
 */
function initSortButtons() {
    const buttons = document.querySelectorAll('.sort-button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            currentSettings.sort = button.dataset.sort;
            updateSortButtons(currentSettings.sort, showingFavorites);
            saveSettings(currentSettings);
            refreshContent();
        });
    });
}

/**
 * Initialize search listener
 */
function initSearchListener() {
    const searchInput = document.getElementById('search');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function(e) {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            const query = e.target.value.toLowerCase();
            const filtered = allVideos.filter(video => 
                video.title.toLowerCase().includes(query) ||
                video.subreddit.toLowerCase().includes(query) ||
                (video.author && video.author.toLowerCase().includes(query))
            );
            renderVideos(
                filtered,
                handleFavoriteToggle,
                selectVideo,
                (id) => isInCollection('favorites', id)
            );
        }, 300);
    });
}

/**
 * Handle favorite toggling
 * 
 * @param {string} videoId - Video ID to toggle
 */
async function handleFavoriteToggle(videoId) {
    const video = allVideos.find(v => v.id === videoId);
    
    if (!video) return;
    
    const newStatus = await toggleFavorite(video);
    
    // Update UI
    const lightboxFavBtn = document.querySelector('.lightbox-favorite');
    if (lightboxFavBtn && lightboxFavBtn.dataset.id === videoId) {
        lightboxFavBtn.textContent = newStatus ? '★' : '☆';
        lightboxFavBtn.classList.toggle('active', newStatus);
    }
    
    // Update card if in grid
    const favBtns = document.querySelectorAll(`.favorite-button[data-id="${videoId}"]`);
    favBtns.forEach(btn => {
        btn.textContent = newStatus ? '★' : '☆';
        btn.classList.toggle('active', newStatus);
    });
    
    // Re-render if showing favorites
    if (showingFavorites) {
        refreshContent();
    }
}

/**
 * Initialize infinite scroll observer
 */
function initObserver() {
    // If we already have an observer, disconnect it first
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    
    // Don't initialize observer when showing favorites
    if (showingFavorites) {
        return;
    }
    
    const sentinel = document.getElementById('scroll-sentinel');
    if (sentinel) {
        sentinel.remove(); // Remove existing sentinel if present
    }
    
    if ('IntersectionObserver' in window) {
        const mobileThreshold = window.matchMedia("(max-width: 768px)").matches ? 0.5 : 0.1;
        
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && hasMore && !isLoading && !showingFavorites) {
                    loadMoreVideos();
                }
            });
        }, { threshold: mobileThreshold });

        const newSentinel = document.createElement('div');
        newSentinel.id = 'scroll-sentinel';
        newSentinel.style.height = '10px';
        newSentinel.style.marginTop = '20px';
        document.body.appendChild(newSentinel);
        observer.observe(newSentinel);
    } else {
        // Fallback for browsers without IntersectionObserver
        window.addEventListener('scroll', () => {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
                if (hasMore && !isLoading && !showingFavorites) {
                    loadMoreVideos();
                }
            }
        });
    }
}

/**
 * Load default subreddits
 */
async function loadDefaultSubreddits() {
    if (isLoading) return;
    
    showLoading();
    
    // Get subscriber counts for default subs
    const subreddits = await Promise.all(DEFAULT_SUBREDDITS.map(async (name) => {
        return await fetchSubredditInfo(name);
    }));
    
    // Update settings
    currentSettings.subreddits = subreddits;
    userSubreddits = subreddits.map(sub => sub.name);
    activeSubreddits = [...userSubreddits];
    
    saveSettings(currentSettings);
    hideLoading();
    
    // Update UI
    renderSubredditTags(
        userSubreddits,
        activeSubreddits,
        toggleActiveSubreddit,
        removeSubreddit
    );
    refreshContent();
}

/**
 * Toggle active subreddit
 * 
 * @param {string} subreddit - Subreddit name
 */
function toggleActiveSubreddit(subreddit) {
    const index = activeSubreddits.indexOf(subreddit);
    if (index === -1) {
        activeSubreddits.push(subreddit);
    } else {
        activeSubreddits.splice(index, 1);
    }
    
    renderSubredditTags(
        userSubreddits,
        activeSubreddits,
        toggleActiveSubreddit,
        removeSubreddit
    );
    refreshContent();
}

/**
 * Remove subreddit
 * 
 * @param {string} name - Subreddit name
 */
function removeSubreddit(name) {
    // Remove from active list
    const activeIndex = activeSubreddits.indexOf(name);
    if (activeIndex !== -1) {
        activeSubreddits.splice(activeIndex, 1);
    }
    
    // Remove from all subreddits
    const index = userSubreddits.indexOf(name);
    if (index !== -1) {
        userSubreddits.splice(index, 1);
    }
    
    // Remove from settings
    currentSettings.subreddits = currentSettings.subreddits.filter(sub => sub.name !== name);
    saveSettings(currentSettings);
    
    renderSubredditTags(
        userSubreddits,
        activeSubreddits,
        toggleActiveSubreddit,
        removeSubreddit
    );
    refreshContent();
}

/**
 * Quick add subreddit
 */
function quickAddSubreddit() {
    const input = document.getElementById('quick-subreddit-input');
    const subreddit = input.value.trim().replace(/^r\//i, '');
    
    if (!subreddit) return;
    
    // Add to subreddit list if not already there
    if (!userSubreddits.includes(subreddit)) {
        userSubreddits.push(subreddit);
        
        // Also add to settings
        if (!currentSettings.subreddits.some(s => s.name === subreddit)) {
            currentSettings.subreddits.push({ name: subreddit, subscribers: 0 });
            saveSettings(currentSettings);
            
            // Try to fetch subscriber count in background
            fetchSubredditInfo(subreddit)
                .then(info => {
                    // Update settings
                    const index = currentSettings.subreddits.findIndex(s => s.name === subreddit);
                    if (index !== -1) {
                        currentSettings.subreddits[index].subscribers = info.subscribers;
                        saveSettings(currentSettings);
                    }
                });
        }
    }
    
    // Activate it
    if (!activeSubreddits.includes(subreddit)) {
        activeSubreddits.push(subreddit);
    }
    
    input.value = '';
    renderSubredditTags(
        userSubreddits,
        activeSubreddits,
        toggleActiveSubreddit,
        removeSubreddit
    );
    refreshContent();
}

/**
 * Toggle sound mute state
 */
function toggleSound() {
    isMuted = !isMuted;
    const soundBtn = document.getElementById('sound-toggle');
    soundBtn.textContent = isMuted ? '🔇' : '🔊';
    soundBtn.classList.toggle('active', !isMuted);
    
    updateMuteState(isMuted);
}

/**
 * Toggle grid size
 */
function toggleGridSize() {
    currentSettings.compactView = !currentSettings.compactView;
    document.getElementById('grid-size-toggle').classList.toggle('active', currentSettings.compactView);
    
    // Update grid class
    const grid = document.getElementById('video-grid');
    grid.classList.toggle('compact', currentSettings.compactView);
    
    saveSettings(currentSettings);
}

/**
 * Change time filter
 */
function changeTimeFilter() {
    currentSettings.time = document.getElementById('time-select').value;
    saveSettings(currentSettings);
    refreshContent();
}

/**
 * Toggle favorites view
 */
function toggleFavorites() {
    showingFavorites = !showingFavorites;
    const favBtn = document.getElementById('favorites-toggle');
    favBtn.classList.toggle('active', showingFavorites);
    
    // Always disconnect observer when changing views
    if (observer) {
        observer.disconnect();
        observer = null;
    }
    
    refreshContent();
    
    // Update sort buttons status
    updateSortButtons(currentSettings.sort, showingFavorites);
}

/**
 * Select a video
 * 
 * @param {Object|number} videoOrIndex - Video object or index
 */
function selectVideo(videoOrIndex) {
    // If we have an index, get the video object
    let video, index;
    
    if (typeof videoOrIndex === 'number') {
        index = videoOrIndex;
        video = showingFavorites ? 
            allVideos.filter(v => isInCollection('favorites', v.id))[index] : 
            allVideos[index];
    } else {
        video = videoOrIndex;
        // Find index in current list
        index = allVideos.findIndex(v => v.id === video.id);
    }
    
    if (!video) {
        showError('Video not found');
        return;
    }
    
    currentVideoIndex = index;
    
    // Add to watch history
    addToWatchHistory(video);
    
    // Get videos for navigation
    const videos = showingFavorites ? 
        allVideos.filter(v => isInCollection('favorites', v.id)) : 
        allVideos;
    
    // Show lightbox
    showLightbox(
        video,
        index,
        videos,
        isMuted,
        (id) => isInCollection('favorites', id),
        handleFavoriteToggle
    );
    
    // Load related videos
    loadRelatedVideos(video, selectVideo);
}

/**
 * Load more videos
 */
async function loadMoreVideos() {
    if (!hasMore || isLoading) return;
    
    isLoading = true;
    showLoading();
    
    // If showing favorites, just render from storage
    if (showingFavorites) {
        const favoriteVideos = allVideos.filter(v => isInCollection('favorites', v.id));
        
        renderVideos(
            favoriteVideos,
            handleFavoriteToggle,
            selectVideo,
            (id) => isInCollection('favorites', id)
        );
        
        isLoading = false;
        hideLoading();
        return;
    }
    
    fetchRedditVideos(
        activeSubreddits,
        currentSettings,
        afterToken,
        (newVideos, newAfterToken, more) => {
            afterToken = newAfterToken;
            hasMore = more;
            
            if (newVideos.length === 0) {
                if (allVideos.length === 0) {
                    document.getElementById('video-grid').innerHTML = `
                        <div class="empty-state" style="grid-column: 1/-1; padding: 40px;">
                            <div class="empty-icon">📹</div>
                            <p>No videos found</p>
                            <p class="empty-subtext">Try selecting different subreddits</p>
                        </div>
                    `;
                }
                isLoading = false;
                hideLoading();
                return;
            }
            
            allVideos = [...allVideos, ...newVideos];
            renderVideos(
                allVideos,
                handleFavoriteToggle,
                selectVideo,
                (id) => isInCollection('favorites', id)
            );
            
            isLoading = false;
            hideLoading();
            
            // Optimize memory
            optimizeVideoMemory();
        },
        (error) => {
            showError(`Failed to load content: ${error.message}`);
            isLoading = false;
            hideLoading();
            hasMore = false;
            
            // Try again after a delay if it might be a temporary issue
            if (error.message.includes('HTTP error') || error.message.includes('Failed to fetch')) {
                setTimeout(() => {
                    hasMore = true;
                    loadMoreVideos();
                }, 5000);
            }
        }
    );
}

/**
 * Refresh content, resetting videos
 */
function refreshContent() {
    afterToken = null;
    hasMore = true;
    
    if (showingFavorites) {
        // Just render favorites from storage
        const favoriteVideos = allVideos.filter(v => isInCollection('favorites', v.id));
        
        renderVideos(
            favoriteVideos,
            handleFavoriteToggle,
            selectVideo,
            (id) => isInCollection('favorites', id)
        );
    } else {
        // Clear current videos and load new ones
        allVideos = [];
        document.getElementById('video-grid').innerHTML = '';
        loadMoreVideos();
        
        // Reconnect infinite scroll only when showing all videos
        initObserver();
    }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', initApp);

// For exposing closeLightbox to global scope
window.closeLightbox = closeLightbox;
window.navigate = (direction) => {
    const videos = showingFavorites ? 
        allVideos.filter(v => isInCollection('favorites', v.id)) : 
        allVideos;
    
    navigate(direction, videos, isMuted, (id) => isInCollection('favorites', id), handleFavoriteToggle);
};