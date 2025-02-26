/**
 * main.js - Main entry point
 */
import { DEFAULT_SUBREDDITS, fetchRedditVideos, fetchSubredditInfo } from './api.js';
import { 
    saveSettings, loadSettings, saveFavorites, loadFavorites, saveTheme, loadTheme 
} from './storage.js';
import { 
    showError, showLoading, hideLoading, renderVideos, updateSortButtons, 
    renderSubredditTags, initThemeToggle, updateThemeButton, applyTheme 
} from './ui.js';
import { updateMuteState } from './video.js';
import { showLightbox, closeLightbox, navigate } from './lightbox.js';

// App state
let allVideos = [];
let userSubreddits = [];
let activeSubreddits = [];
let currentVideoIndex = 0;
let afterToken = null;
let isLoading = false;
let hasMore = true;
let favoriteVideos = [];
let showingFavorites = false;
let searchTimeout;
let observer;
let isMuted = true;
let themeToggleButton;
let currentSettings = {
    sort: 'hot',
    time: 'week',
    subreddits: [],
    compactView: false,
    autoplay: false
};
let currentTheme = 'dark';

/**
 * Initialize the application
 */
function initializeApp() {
    // Load saved settings
    const defaultSettings = {
        sort: 'hot',
        time: 'week',
        subreddits: [],
        compactView: false,
        autoplay: false
    };
    
    currentSettings = loadSettings(defaultSettings);
    
    // Load favorites
    favoriteVideos = loadFavorites();
    
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
    
    // Initialize infinite scroll
    initObserver();
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
    
    // Default button
    const defaultsButton = document.getElementById('defaults-button');
    if (defaultsButton) {
        defaultsButton.addEventListener('click', loadDefaultSubreddits);
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
                video.subreddit.toLowerCase().includes(query)
            );
            renderVideos(
                filtered,
                toggleFavoriteItem,
                (index) => {
                    currentVideoIndex = index;
                    showLightbox(
                        filtered[index],
                        index,
                        filtered,
                        isMuted,
                        isVideoFavorited,
                        toggleFavoriteItem
                    );
                },
                isVideoFavorited
            );
        }, 300);
    });
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
    
    if (showingFavorites) {
        renderVideos(
            favoriteVideos,
            toggleFavoriteItem,
            (index) => {
                currentVideoIndex = index;
                showLightbox(
                    favoriteVideos[index],
                    index,
                    favoriteVideos,
                    isMuted,
                    isVideoFavorited,
                    toggleFavoriteItem
                );
            },
            isVideoFavorited
        );
    } else {
        renderVideos(
            allVideos,
            toggleFavoriteItem,
            (index) => {
                currentVideoIndex = index;
                showLightbox(
                    allVideos[index],
                    index,
                    allVideos,
                    isMuted,
                    isVideoFavorited,
                    toggleFavoriteItem
                );
            },
            isVideoFavorited
        );
        // Reconnect infinite scroll only when showing all videos
        initObserver();
    }
    
    // Update sort buttons status
    updateSortButtons(currentSettings.sort, showingFavorites);
}

/**
 * Check if a video is favorited
 * 
 * @param {string} id - Video ID
 * @returns {boolean} Is favorited
 */
function isVideoFavorited(id) {
    return favoriteVideos.some(f => f.id === id);
}

/**
 * Toggle favorite item
 * 
 * @param {string} id - Video ID
 */
function toggleFavoriteItem(id) {
    const videoIndex = allVideos.findIndex(v => v.id === id);
    const video = videoIndex !== -1 ? allVideos[videoIndex] : 
                  favoriteVideos.find(f => f.id === id);
    
    if (!video) return;
    
    const favIndex = favoriteVideos.findIndex(f => f.id === id);
    
    let isFavorited;
    if (favIndex === -1) {
        // Add to favorites
        favoriteVideos.push(video);
        isFavorited = true;
    } else {
        // Remove from favorites
        favoriteVideos.splice(favIndex, 1);
        isFavorited = false;
    }
    
    saveFavorites(favoriteVideos);
    
    // Update UI
    const lightboxFavBtn = document.querySelector('.lightbox-favorite');
    if (lightboxFavBtn && lightboxFavBtn.dataset.id === id) {
        lightboxFavBtn.textContent = isFavorited ? '★' : '☆';
        lightboxFavBtn.classList.toggle('active', isFavorited);
    }
    
    // Update card if in grid
    const favBtn = document.querySelector(`.favorite-button[data-id="${id}"]`);
    if (favBtn) {
        favBtn.textContent = isFavorited ? '★' : '☆';
        favBtn.classList.toggle('active', isFavorited);
    }
    
    // Re-render if showing favorites
    if (showingFavorites) {
        renderVideos(
            favoriteVideos,
            toggleFavoriteItem,
            (index) => {
                currentVideoIndex = index;
                showLightbox(
                    favoriteVideos[index],
                    index,
                    favoriteVideos,
                    isMuted,
                    isVideoFavorited,
                    toggleFavoriteItem
                );
            },
            isVideoFavorited
        );
    }
}

/**
 * Load more videos
 */
async function loadMoreVideos() {
    if (!hasMore || isLoading) return;
    
    isLoading = true;
    showLoading();
    
    fetchRedditVideos(
        activeSubreddits,
        currentSettings,
        afterToken,
        (newVideos, newAfterToken, more) => {
            afterToken = newAfterToken;
            hasMore = more;
            
            if (newVideos.length === 0) {
                if (allVideos.length === 0) {
                    document.getElementById('video-grid').innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 40px;">No videos found. Try selecting different subreddits.</div>';
                }
                isLoading = false;
                hideLoading();
                return;
            }
            
            allVideos = [...allVideos, ...newVideos];
            renderVideos(
                allVideos,
                toggleFavoriteItem,
                (index) => {
                    currentVideoIndex = index;
                    showLightbox(
                        allVideos[index],
                        index,
                        allVideos,
                        isMuted,
                        isVideoFavorited,
                        toggleFavoriteItem
                    );
                },
                isVideoFavorited
            );
            
            isLoading = false;
            hideLoading();
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
    allVideos = [];
    document.getElementById('video-grid').innerHTML = '';
    loadMoreVideos();
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);

// For exposing closeLightbox to global scope
window.closeLightbox = closeLightbox;
window.navigate = (direction) => {
    const videos = showingFavorites ? favoriteVideos : allVideos;
    navigate(direction, videos, isMuted, isVideoFavorited, toggleFavoriteItem);
};

// For the default button that's using onclick in HTML
window.loadDefaultSubreddits = loadDefaultSubreddits;