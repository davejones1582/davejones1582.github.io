/**
 * mobile-main.js - Mobile-optimized version for iOS Safari
 */
import { DEFAULT_SUBREDDITS, fetchRedditVideos } from './api.js';
import { loadSettings, saveSettings, loadFavorites, saveFavorites } from './storage.js';
import { showError, showLoading, hideLoading } from './ui.js';

// App state
let allVideos = [];
let userSubreddits = [];
let activeSubreddits = [];
let afterToken = null;
let isLoading = false;
let hasMore = true;
let favoriteVideos = [];
let searchTimeout;
let isMuted = true;
let currentSettings = {
    sort: 'hot',
    time: 'week',
    subreddits: [],
    compactView: false
};

/**
 * Initialize the mobile application
 */
function initializeMobileApp() {
    console.log("Loading mobile-optimized version for iOS");
    
    // Add mobile class to body
    document.body.classList.add('mobile-view');
    
    // Load saved settings
    const defaultSettings = {
        sort: 'hot',
        time: 'week',
        subreddits: [],
        compactView: false
    };
    
    currentSettings = loadSettings(defaultSettings);
    
    // Load favorites
    favoriteVideos = loadFavorites();
    
    // Initialize event listeners
    initMobileEventListeners();
    
    // Get subreddit list from settings
    userSubreddits = currentSettings.subreddits.map(sub => sub.name);
    activeSubreddits = [...userSubreddits]; // Start with all active
    
    // If no subreddits, load defaults
    if (userSubreddits.length === 0) {
        loadDefaultSubreddits();
    } else {
        // Render subreddit tags
        renderMobileSubredditTags();
        
        // Initial load
        loadMoreVideos();
    }
}

/**
 * Set up mobile event listeners
 */
function initMobileEventListeners() {
    // Sound toggle button
    const soundToggle = document.getElementById('sound-toggle');
    if (soundToggle) {
        soundToggle.addEventListener('click', toggleSound);
    }
    
    // Favorite toggle button
    const favToggle = document.getElementById('favorites-toggle');
    if (favToggle) {
        favToggle.addEventListener('click', toggleFavorites);
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
    
    // Sort buttons
    const buttons = document.querySelectorAll('.sort-button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            currentSettings.sort = button.dataset.sort;
            
            // Update active state
            buttons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            // Show/hide time filter
            const timeSelect = document.getElementById('time-select');
            if (timeSelect) {
                timeSelect.style.display = currentSettings.sort === 'top' ? 'block' : 'none';
            }
            
            saveSettings(currentSettings);
            refreshContent();
        });
    });
    
    // Time select
    const timeSelect = document.getElementById('time-select');
    if (timeSelect) {
        timeSelect.addEventListener('change', () => {
            currentSettings.time = timeSelect.value;
            saveSettings(currentSettings);
            refreshContent();
        });
    }
    
    // Search input
    const searchInput = document.getElementById('search');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const query = e.target.value.toLowerCase();
                const filtered = allVideos.filter(video => 
                    video.title.toLowerCase().includes(query) ||
                    video.subreddit.toLowerCase().includes(query)
                );
                renderMobileVideos(filtered);
            }, 300);
        });
    }
    
    // Infinity scroll
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
            if (hasMore && !isLoading) {
                loadMoreVideos();
            }
        }
    });
}

/**
 * Toggle sound mute state
 */
function toggleSound() {
    isMuted = !isMuted;
    const soundBtn = document.getElementById('sound-toggle');
    if (soundBtn) {
        soundBtn.textContent = isMuted ? '🔇' : '🔊';
        soundBtn.classList.toggle('active', !isMuted);
    }
}

/**
 * Toggle favorites view
 */
function toggleFavorites() {
    const favBtn = document.getElementById('favorites-toggle');
    if (favBtn.classList.contains('active')) {
        // Switch back to all videos
        favBtn.classList.remove('active');
        renderMobileVideos(allVideos);
    } else {
        // Show favorites
        favBtn.classList.add('active');
        renderMobileVideos(favoriteVideos);
    }
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
    const favBtn = document.querySelector(`.favorite-button[data-id="${id}"]`);
    if (favBtn) {
        favBtn.textContent = isFavorited ? '★' : '☆';
        favBtn.classList.toggle('active', isFavorited);
    }
    
    // Re-render if showing favorites
    if (document.getElementById('favorites-toggle').classList.contains('active')) {
        renderMobileVideos(favoriteVideos);
    }
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
 * Load default subreddits
 */
function loadDefaultSubreddits() {
    // Update settings with defaults
    currentSettings.subreddits = DEFAULT_SUBREDDITS.map(name => ({ name, subscribers: 0 }));
    userSubreddits = DEFAULT_SUBREDDITS;
    activeSubreddits = [...userSubreddits];
    
    saveSettings(currentSettings);
    
    // Update UI
    renderMobileSubredditTags();
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
        }
    }
    
    // Activate it
    if (!activeSubreddits.includes(subreddit)) {
        activeSubreddits.push(subreddit);
    }
    
    input.value = '';
    renderMobileSubredditTags();
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
    
    renderMobileSubredditTags();
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
    
    renderMobileSubredditTags();
    refreshContent();
}

/**
 * Render subreddit tags for mobile
 */
function renderMobileSubredditTags() {
    const container = document.getElementById('subreddit-tags');
    if (!container) return;
    
    container.innerHTML = '';
    
    userSubreddits.forEach(sub => {
        const tag = document.createElement('div');
        tag.className = `subreddit-tag ${activeSubreddits.includes(sub) ? 'active' : ''}`;
        tag.dataset.subreddit = sub;
        
        // Create the name span
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `r/${sub}`;
        nameSpan.className = 'subreddit-name';
        nameSpan.addEventListener('click', () => toggleActiveSubreddit(sub));
        tag.appendChild(nameSpan);
        
        // Create the remove button
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSubreddit(sub);
        });
        tag.appendChild(removeBtn);
        
        container.appendChild(tag);
    });
}

/**
 * Create mobile video card
 */
function createMobileVideoCard(video) {
    const isFavorite = isVideoFavorited(video.id);
    
    const card = document.createElement('div');
    card.className = 'video-card mobile-card';
    
    const container = document.createElement('div');
    container.className = 'thumbnail-container';
    
    const img = document.createElement('img');
    img.className = 'thumbnail';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = video.thumbnail;
    img.alt = video.title;
    
    const playIcon = document.createElement('div');
    playIcon.className = 'play-icon';
    
    // Add favorite button
    const favButton = document.createElement('button');
    favButton.className = `favorite-button ${isFavorite ? 'active' : ''}`;
    favButton.textContent = isFavorite ? '★' : '☆';
    favButton.dataset.id = video.id;
    favButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavoriteItem(video.id);
    });
    
    container.appendChild(img);
    container.appendChild(playIcon);
    container.appendChild(favButton);
    
    const metadata = document.createElement('div');
    metadata.className = 'metadata';
    metadata.innerHTML = `
        <div class="title">${video.title}</div>
        <div class="details">
            <span>r/${video.subreddit}</span>
            <span>↑ ${video.upvotes}</span>
            <span>${video.created}</span>
        </div>
    `;

    // Open Reddit post in new tab instead of using lightbox
    card.addEventListener('click', () => {
        window.open(`https://reddit.com${video.permalink}`, '_blank');
    });

    card.appendChild(container);
    card.appendChild(metadata);
    return card;
}

/**
 * Render videos for mobile
 */
function renderMobileVideos(videos) {
    const grid = document.getElementById('video-grid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (videos.length === 0) {
        grid.innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 40px;">No videos found.</div>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    videos.forEach(video => {
        fragment.appendChild(createMobileVideoCard(video));
    });
    grid.appendChild(fragment);
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
            
            // If this is showing favorites, don't update allVideos display
            if (document.getElementById('favorites-toggle').classList.contains('active')) {
                // Just update the underlying data
                allVideos = [...allVideos, ...newVideos];
            } else {
                allVideos = [...allVideos, ...newVideos];
                renderMobileVideos(allVideos);
            }
            
            isLoading = false;
            hideLoading();
        },
        (error) => {
            showError(`Failed to load content: ${error.message}`);
            isLoading = false;
            hideLoading();
            hasMore = false;
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

export {
    initializeMobileApp
};