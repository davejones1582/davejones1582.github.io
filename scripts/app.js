// Configuration
const batchSize = 25;
const DEFAULT_SUBREDDITS = [
    'videos',
    'youtubehaiku',
    'deepintoyoutube',
    'TikTokCringe',
    'perfectlycutscreams',
    'contagiouslaughter'        
];
let allVideos = [];
let userSubreddits = [];
let activeSubreddits = [];
let currentVideoIndex = 0;
let afterToken = null;
let isLoading = false;
let hasMore = true;
let currentSettings = {
    sort: 'hot',
    time: 'week',
    subreddits: [],
    compactView: false,
    autoplay: false
};
let favoriteVideos = [];
let showingFavorites = false;
let searchTimeout;
let observer;
let isMuted = true;
let currentVideoIframe = null;
let currentVideoElement = null;

// Error handling
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => errorDiv.style.display = 'none', 3000);
}

// Loading states
function showLoading() {
    document.getElementById('loading-spinner').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading-spinner').style.display = 'none';
}

// Convert redgifs URLs to embeddable format
function getRedgifsEmbedUrl(url) {
    const id = url.split('/').pop();
    return `https://www.redgifs.com/ifr/${id}?autoplay=0&controls=1`;
}

// Main page controls
function updateSortButtons() {
    const buttons = document.querySelectorAll('.sort-button');
    buttons.forEach(button => {
        button.classList.toggle('active', button.dataset.sort === currentSettings.sort);
    });
    
    // Show/hide time filter for "top" sort
    const timeFilter = document.getElementById('time-select');
    timeFilter.style.display = currentSettings.sort === 'top' ? 'block' : 'none';
    
    // Disable sort buttons when showing favorites
    buttons.forEach(button => {
        button.disabled = showingFavorites;
        if (showingFavorites) {
            button.classList.add('disabled');
        } else {
            button.classList.remove('disabled');
        }
    });
}

function initSortButtons() {
    const buttons = document.querySelectorAll('.sort-button');
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            currentSettings.sort = button.dataset.sort;
            updateSortButtons();
            saveSettings();
            refreshContent();
        });
    });
}

function changeTimeFilter() {
    currentSettings.time = document.getElementById('time-select').value;
    saveSettings();
    refreshContent();
}

function toggleGridSize() {
    currentSettings.compactView = !currentSettings.compactView;
    document.getElementById('grid-size-toggle').classList.toggle('active', currentSettings.compactView);
    
    // Update grid class
    const grid = document.getElementById('video-grid');
    grid.classList.toggle('compact', currentSettings.compactView);
    
    saveSettings();
}

function toggleAutoplay() {
    currentSettings.autoplay = !currentSettings.autoplay;
    document.getElementById('autoplay-toggle').classList.toggle('active', currentSettings.autoplay);
    saveSettings();
}

function clearFilters() {
    // Clear search
    document.getElementById('search').value = '';
    
    // Reset to default sort
    currentSettings.sort = 'hot';
    updateSortButtons();
    
    // Show all videos again
    renderVideos(allVideos);
}

function updateStats() {
    // We removed the stats bar in our minimal UI
}

function handleKeyDown(e) {
    if (document.getElementById('lightbox').style.display === 'flex') {
        if (e.key === 'ArrowLeft') navigate(-1);
        if (e.key === 'ArrowRight') navigate(1);
        if (e.key === 'Escape') closeLightbox();
    }
}

function navigate(direction) {
    const videos = showingFavorites ? favoriteVideos : allVideos;
    if (videos.length === 0) return;
    
    currentVideoIndex += direction;
    if (currentVideoIndex < 0) currentVideoIndex = videos.length - 1;
    if (currentVideoIndex >= videos.length) currentVideoIndex = 0;
    showLightbox(videos[currentVideoIndex]);
}

// Toggle sound function
function toggleSound() {
    isMuted = !isMuted;
    const soundBtn = document.getElementById('sound-toggle');
    soundBtn.textContent = isMuted ? '🔇' : '🔊';
    soundBtn.classList.toggle('active', !isMuted);
    
    // Handle iframe videos
    if (currentVideoIframe) {
        try {
            const src = new URL(currentVideoIframe.src);
            
            // Different services have different parameter names
            if (src.href.includes('youtube.com')) {
                src.searchParams.set('mute', isMuted ? '1' : '0');
            } else {
                src.searchParams.set('muted', isMuted ? '1' : '0');
            }
            
            currentVideoIframe.src = src.href;
        } catch (e) {
            console.error('Could not update iframe mute state:', e);
        }
    }
    
    // Handle HTML5 video
    if (currentVideoElement) {
        currentVideoElement.muted = isMuted;
        
        // Also mute any audio elements (for Reddit videos)
        const audioElements = document.querySelectorAll('audio');
        audioElements.forEach(audio => {
            audio.muted = isMuted;
        });
    }
}

// Favorites functionality
function loadFavorites() {
    try {
        const saved = localStorage.getItem('favoriteVideos');
        if (saved) {
            favoriteVideos = JSON.parse(saved);
        } else {
            favoriteVideos = [];
        }
    } catch (error) {
        console.error('Error loading favorites:', error);
        favoriteVideos = [];
    }
}

function saveFavorites() {
    try {
        localStorage.setItem('favoriteVideos', JSON.stringify(favoriteVideos));
    } catch (error) {
        console.error('Error saving favorites:', error);
        showError('Could not save favorites. Storage may be full.');
    }
}

function toggleFavorites() {
    showingFavorites = !showingFavorites;
    const favBtn = document.getElementById('favorites-toggle');
    favBtn.classList.toggle('active', showingFavorites);
    
    // Disconnect infinite scroll observer when showing favorites
    if (observer) {
        observer.disconnect();
    }
    
    if (showingFavorites) {
        renderVideos(favoriteVideos);
    } else {
        renderVideos(allVideos);
        // Reconnect infinite scroll only when showing all videos
        initObserver();
    }
}

function toggleFavoriteItem(id) {
    const videoIndex = allVideos.findIndex(v => v.id === id);
    if (videoIndex === -1) return;
    
    const video = allVideos[videoIndex];
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
    
    saveFavorites();
    
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
        renderVideos(favoriteVideos);
    }
}

// Touch support for lightbox navigation
let touchStartX = 0;

function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
}

function handleTouchEnd(e) {
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX - touchEndX;
    
    if (Math.abs(diffX) > 50) {
        navigate(diffX > 0 ? 1 : -1);
    }
}

// Lightbox functionality
function showLightbox(item) {
    if (!item) return;
    
    const container = document.getElementById('media-container');
    container.innerHTML = ''; // Clear previous content
    currentVideoElement = null;
    currentVideoIframe = null;
    
    // Handle different video types
    if (item.isVideo) {
        try {
            if (item.isReddit && item.fallbackUrl) {
                // Native Reddit video with fallback URL
                const video = document.createElement('video');
                video.className = 'lightbox-video';
                video.controls = true;
                video.autoplay = true;
                video.muted = isMuted;
                
                // If there's an audio track
                if (item.audioUrl) {
                    // Create audio element for sound
                    const audio = document.createElement('audio');
                    audio.src = item.audioUrl;
                    audio.autoplay = true;
                    audio.controls = false;
                    audio.muted = isMuted;
                    
                    // Sync audio with video
                    video.onplay = () => {
                        audio.currentTime = video.currentTime;
                        audio.play().catch(e => console.error("Audio play failed:", e));
                    };
                    
                    video.onpause = () => audio.pause();
                    video.onseeked = () => { audio.currentTime = video.currentTime; };
                    
                    // Add audio element
                    container.appendChild(audio);
                }
                
                video.src = item.fallbackUrl;
                container.appendChild(video);
                
                video.play().catch(e => console.error("Video play failed:", e));
                currentVideoElement = video;
            } else {
                // Embedded video (YouTube, Redgifs, etc)
                let videoUrl;
                
                try {
                    videoUrl = new URL(item.url);
                    
                    // Handle different video services
                    if (item.url.includes('youtube.com') || item.url.includes('youtu.be')) {
                        // Ensure YouTube parameters are properly set
                        videoUrl.searchParams.set('autoplay', '1');
                        videoUrl.searchParams.set('mute', isMuted ? '1' : '0');
                    } else if (item.url.includes('redgifs.com')) {
                        // RedGifs handling
                        videoUrl.searchParams.set('autoplay', '1');
                        videoUrl.searchParams.set('muted', isMuted ? '1' : '0');
                    }
                } catch (e) {
                    console.error("URL parsing error:", e);
                    videoUrl = item.url;
                }
                
                const iframe = document.createElement('iframe');
                iframe.className = 'lightbox-iframe';
                iframe.src = typeof videoUrl === 'string' ? videoUrl : videoUrl.href;
                iframe.allow = 'autoplay; fullscreen; encrypted-media';
                iframe.allowFullscreen = true;
                iframe.frameBorder = "0";
                container.appendChild(iframe);
                currentVideoIframe = iframe;
            }
        } catch (error) {
            console.error("Error displaying video:", error);
            // Fallback to showing the thumbnail as an image
            const img = document.createElement('img');
            img.className = 'lightbox-image';
            img.src = item.thumbnail;
            container.appendChild(img);
        }
    } else {
        // Image
        const img = document.createElement('img');
        img.className = 'lightbox-image';
        img.src = item.url;
        container.appendChild(img);
    }

    // Add metadata with favorite button
    const isFavorite = favoriteVideos.some(fav => fav.id === item.id);
    const metadata = document.getElementById('lightbox-metadata');
    metadata.innerHTML = `
        <div class="lightbox-header">
            <div>r/${item.subreddit}</div>
            <button onclick="toggleFavoriteItem('${item.id}')" class="lightbox-favorite ${isFavorite ? 'active' : ''}" data-id="${item.id}">
                ${isFavorite ? '★' : '☆'}
            </button>
        </div>
        <div>↑ ${item.upvotes} • ${item.created}</div>
        <div>${item.title}</div>
        <a class="lightbox-link" href="https://reddit.com${item.permalink}" target="_blank">View Post</a>
    `;

    document.getElementById('lightbox').style.display = 'flex';
    document.addEventListener('keydown', handleKeyDown);
    document.getElementById('lightbox').addEventListener('touchstart', handleTouchStart);
    document.getElementById('lightbox').addEventListener('touchend', handleTouchEnd);
}

function closeLightbox() {
    // Destroy the video element completely
    const container = document.getElementById('media-container');
    container.innerHTML = '';
    
    // Reset video references
    currentVideoIframe = null;
    currentVideoElement = null;
    
    // Hide lightbox
    document.getElementById('lightbox').style.display = 'none';
    document.removeEventListener('keydown', handleKeyDown);
    document.getElementById('lightbox').removeEventListener('touchstart', handleTouchStart);
    document.getElementById('lightbox').removeEventListener('touchend', handleTouchEnd);
}

// Settings management
function saveSettings() {
    try {
        localStorage.setItem('appSettings', JSON.stringify(currentSettings));
    } catch (error) {
        console.error('Error saving settings:', error);
        showError('Could not save settings. Storage may be full.');
    }
}

function loadSettings() {
    try {
        const saved = localStorage.getItem('appSettings');
        if (saved) {
            const loadedSettings = JSON.parse(saved);
            
            // Migrate old format (array of strings) to new format
            if (loadedSettings.subreddits.length > 0 && typeof loadedSettings.subreddits[0] === 'string') {
                loadedSettings.subreddits = loadedSettings.subreddits.map(name => ({
                    name,
                    subscribers: 0
                }));
            }
            
            // Apply loaded settings
            currentSettings = {
                ...currentSettings,  // Ensure we have defaults for any new settings
                ...loadedSettings    // Override with saved settings
            };
            
            // Update UI to reflect settings
            const timeSelect = document.getElementById('time-select');
            if (timeSelect) {
                timeSelect.value = currentSettings.time;
            }
            
            // Set active sort button
            updateSortButtons();
            
            // Set grid view toggle
            const gridToggle = document.getElementById('grid-size-toggle');
            if (gridToggle) {
                gridToggle.classList.toggle('active', currentSettings.compactView);
                document.getElementById('video-grid')?.classList.toggle('compact', currentSettings.compactView);
            }
            
            // Set autoplay toggle
            const autoplayToggle = document.getElementById('autoplay-toggle');
            if (autoplayToggle) {
                autoplayToggle.classList.toggle('active', currentSettings.autoplay);
            }
        } else {
            loadDefaultSubreddits(); // Load defaults on first run
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        showError('Could not load settings. Using defaults.');
        loadDefaultSubreddits();
    }
}

// Subreddit management
async function loadDefaultSubreddits() {
    if (isLoading) return;
    
    showLoading();
    
    // Get subscriber counts for default subs
    const subreddits = await Promise.all(DEFAULT_SUBREDDITS.map(async (name) => {
        try {
            const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(
                `https://www.reddit.com/r/${name}/about.json`
            )}`);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch subreddit info: ${response.status}`);
            }
            
            const data = await response.json();
            return { name, subscribers: data.data?.subscribers || 0 };
        } catch (error) {
            console.error(`Error fetching subreddit ${name}:`, error);
            return { name, subscribers: 0 };
        }
    }));
    
    // Update settings
    currentSettings.subreddits = subreddits;
    userSubreddits = [...DEFAULT_SUBREDDITS];
    activeSubreddits = [...userSubreddits];
    
    saveSettings();
    hideLoading();
    
    // Update UI
    renderSubredditTags();
    refreshContent();
}

// Fetch videos from Reddit
async function fetchRedditVideos() {
    if (!hasMore || isLoading || activeSubreddits.length === 0) return [];
    
    isLoading = true;
    showLoading();
    
    try {
        const multiSub = activeSubreddits.join('+');
        const sort = currentSettings.sort;
        const timeParam = sort === 'top' ? `&t=${currentSettings.time}` : '';

        let url = `https://corsproxy.io/?${encodeURIComponent(
            `https://www.reddit.com/r/${multiSub}/${sort}.json?limit=${batchSize}&raw_json=1`
        )}${timeParam}${afterToken ? `&after=${afterToken}` : ''}`;

        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Update pagination state
        afterToken = data.data.after;
        hasMore = afterToken !== null;

        // Filter for videos and images
        const newVideos = data.data.children
            .filter(post => {
                // Keep videos and GIFs
                return (
                    // Native Reddit videos
                    post.data.is_video || 
                    // External videos (YouTube, etc.)
                    (post.data.domain && (
                        post.data.domain.includes('youtube.com') || 
                        post.data.domain.includes('youtu.be') ||
                        post.data.domain.includes('redgifs.com') ||
                        post.data.domain.includes('gfycat.com')
                    )) ||
                    // Check for videos in secure media embeds
                    (post.data.secure_media && post.data.secure_media.oembed) ||
                    // Also include GIFs
                    (post.data.url && (
                        post.data.url.endsWith('.gif') ||
                        post.data.url.endsWith('.gifv')
                    ))
                );
            })
            .map(post => {
                const data = post.data;
                const isRedditVideo = data.is_video && data.media && data.media.reddit_video;
                const isRedgifs = data.url && data.url.includes('redgifs.com');
                const isYouTube = data.url && (data.url.includes('youtube.com') || data.url.includes('youtu.be'));
                
                let videoUrl;
                if (isRedditVideo) {
                    videoUrl = data.url; // Use the post URL for Reddit videos
                } else if (isRedgifs) {
                    videoUrl = getRedgifsEmbedUrl(data.url);
                } else if (isYouTube) {
                    // Extract video ID from YouTube URL
                    let videoId;
                    if (data.url.includes('youtu.be')) {
                        videoId = data.url.split('/').pop();
                    } else {
                        try {
                            const urlParams = new URLSearchParams(new URL(data.url).search);
                            videoId = urlParams.get('v');
                        } catch (e) {
                            // Handle malformed URLs
                            console.error("Failed to parse YouTube URL:", e);
                            videoId = null;
                        }
                    }
                    
                    if (videoId) {
                        videoUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&mute=${isMuted ? '1' : '0'}`;
                    } else {
                        videoUrl = data.url;
                    }
                } else if (data.secure_media && data.secure_media.oembed) {
                    // Extract iframe src if available
                    const html = data.secure_media.oembed.html;
                    const srcMatch = html?.match(/src="([^"]+)"/);
                    videoUrl = srcMatch ? srcMatch[1] : data.url;
                } else {
                    videoUrl = data.url;
                }
                
                // Get thumbnail
                let thumbnailUrl;
                if (data.preview && data.preview.images && data.preview.images[0]) {
                    thumbnailUrl = data.preview.images[0].source.url.replace(/&amp;/g, '&');
                } else if (data.thumbnail && data.thumbnail !== 'self' && data.thumbnail !== 'default') {
                    thumbnailUrl = data.thumbnail;
                } else {
                    thumbnailUrl = 'https://www.redditstatic.com/mweb2x/img/camera.png'; // Fallback
                }
                
                // For Reddit videos, check if there's a separate audio track
                let audioUrl = null;
                if (isRedditVideo && data.media.reddit_video.fallback_url) {
                    const dashUrl = data.media.reddit_video.dash_url;
                    if (dashUrl) {
                        // Try to extract audio URL from DASH
                        audioUrl = dashUrl.replace('DASHPlaylist.mpd', 'DASH_audio.mp4');
                    } else {
                        // Try to construct audio URL
                        const videoUrl = data.media.reddit_video.fallback_url;
                        audioUrl = videoUrl.replace(/DASH_\d+/, 'DASH_audio');
                    }
                }
                
                return {
                    id: data.id,
                    title: data.title,
                    subreddit: data.subreddit,
                    url: videoUrl,
                    thumbnail: thumbnailUrl,
                    upvotes: data.ups,
                    created: new Date(data.created_utc * 1000).toLocaleDateString(),
                    isVideo: true, // All are treated as "video" for the purpose of the lightbox
                    isReddit: isRedditVideo,
                    fallbackUrl: isRedditVideo ? data.media.reddit_video.fallback_url : null,
                    audioUrl: audioUrl,
                    permalink: data.permalink
                };
            });

        hideLoading();
        isLoading = false;
        return newVideos;
    } catch (error) {
        console.error('Error fetching content:', error);
        showError(`Failed to load content: ${error.message}`);
        hideLoading();
        isLoading = false;
        return [];
    }
}

function refreshContent() {
    afterToken = null;
    hasMore = true;
    allVideos = [];
    document.getElementById('video-grid').innerHTML = '';
    loadMoreVideos();
}

function createVideoCard(video, index) {
    const card = document.createElement('div');
    card.className = 'video-card';
    
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
    const isFavorite = favoriteVideos.some(fav => fav.id === video.id);
    const favButton = document.createElement('button');
    favButton.className = `favorite-button ${isFavorite ? 'active' : ''}`;
    favButton.textContent = isFavorite ? '★' : '☆';
    favButton.dataset.id = video.id;
    favButton.onclick = (e) => {
        e.stopPropagation();
        toggleFavoriteItem(video.id);
    };
    
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

    card.onclick = (e) => {
        e.preventDefault();
        currentVideoIndex = index;
        showLightbox(video);
    };

    card.appendChild(container);
    card.appendChild(metadata);
    return card;
}

async function loadMoreVideos() {
    if (!hasMore || isLoading) return;
    
    const newVideos = await fetchRedditVideos();
    if (newVideos.length === 0) {
        if (allVideos.length === 0) {
            document.getElementById('video-grid').innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 40px;">No videos found. Try selecting different subreddits.</div>';
        }
        return;
    }
    
    allVideos = [...allVideos, ...newVideos];
    renderVideos(allVideos);
}

function renderVideos(videos) {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '';
    
    if (videos.length === 0) {
        grid.innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 40px;">No videos found.</div>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    videos.forEach((video, index) => {
        fragment.appendChild(createVideoCard(video, index));
    });
    grid.appendChild(fragment);
    
    // Update video count
    updateStats();
    
    // Update active subreddits display
    renderActiveSubreddits();
}

// Search functionality
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
            renderVideos(filtered);
        }, 300);
    });
}

// Subreddit management features
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
            saveSettings();
            
            // Try to fetch subscriber count in background
            fetchSubredditInfo(subreddit);
        }
    }
    
    // Activate it
    if (!activeSubreddits.includes(subreddit)) {
        activeSubreddits.push(subreddit);
    }
    
    input.value = '';
    renderSubredditTags();
    refreshContent();
}

async function fetchSubredditInfo(subreddit) {
    try {
        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(
            `https://www.reddit.com/r/${subreddit}/about.json`
        )}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch subreddit info: ${response.status}`);
        }
        
        const data = await response.json();
        const subscribers = data.data?.subscribers || 0;
        
        // Update settings
        const index = currentSettings.subreddits.findIndex(s => s.name === subreddit);
        if (index !== -1) {
            currentSettings.subreddits[index].subscribers = subscribers;
            saveSettings();
        }
    } catch (error) {
        console.error(`Error fetching subreddit info for ${subreddit}:`, error);
    }
}

// Initialize infinite scroll
function initObserver() {
    // If we already have an observer, disconnect it first
    if (observer) {
        observer.disconnect();
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

// Subreddit quick bar functions
function renderSubredditTags() {
    const container = document.getElementById('subreddit-tags');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (userSubreddits.length === 0 && !isLoading) {
        // If no subreddits, load defaults
        loadDefaultSubreddits();
        return;
    }
    
    userSubreddits.forEach(sub => {
        const tag = document.createElement('div');
        tag.className = `subreddit-tag ${activeSubreddits.includes(sub) ? 'active' : ''}`;
        tag.dataset.subreddit = sub;
        
        // Create the name span
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `r/${sub}`;
        tag.appendChild(nameSpan);
        
        // Create the remove button
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent tag click
            removeSubreddit(sub);
        });
        tag.appendChild(removeBtn);
        
        tag.addEventListener('click', () => {
            toggleActiveSubreddit(sub);
        });
        
        container.appendChild(tag);
    });
}

// This function is no longer needed as we removed the active subreddits section
function renderActiveSubreddits() {
    // Intentionally empty
}

function toggleActiveSubreddit(subreddit) {
    const index = activeSubreddits.indexOf(subreddit);
    if (index === -1) {
        activeSubreddits.push(subreddit);
    } else {
        activeSubreddits.splice(index, 1);
    }
    
    renderSubredditTags();
    refreshContent();
}

function removeActiveSubreddit(name) {
    // Remove from active list
    const activeIndex = activeSubreddits.indexOf(name);
    if (activeIndex !== -1) {
        activeSubreddits.splice(activeIndex, 1);
    }
    
    renderSubredditTags();
    refreshContent();
}

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
    saveSettings();
    
    renderSubredditTags();
    refreshContent();
}

// Set up event listeners
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
}

// Initialization
function initializeApp() {
    // Add no-subreddit placeholder in search bar
    const subredditInput = document.getElementById('quick-subreddit-input');
    if (subredditInput) {
        subredditInput.placeholder = "+ Add subreddit";
    }
    
    // Load saved settings
    loadSettings();
    
    // Load favorites
    loadFavorites();
    
    // Initialize sorting controls
    initSortButtons();
    
    // Initialize search listener
    initSearchListener();
    
    // Initialize event listeners
    initEventListeners();
    
    // Initialize infinite scroll
    initObserver();
    
    // Prevent elastic scrolling on iOS in lightbox mode
    if (navigator.userAgent.match(/iP(hone|od|ad)/)) {
        document.body.addEventListener('touchmove', (e) => {
            if (document.getElementById('lightbox').style.display === 'flex') {
                e.preventDefault();
            }
        }, { passive: false });
    }
    
    // Get subreddit list from settings
    userSubreddits = currentSettings.subreddits.map(sub => sub.name);
    activeSubreddits = [...userSubreddits]; // Start with all active
    
    // If no subreddits, load defaults
    if (userSubreddits.length === 0) {
        loadDefaultSubreddits();
    } else {
        // Render subreddit tags
        renderSubredditTags();
        
        // Initial load
        loadMoreVideos();
    }
    
    // Apply grid style
    const videoGrid = document.getElementById('video-grid');
    if (videoGrid && currentSettings.compactView) {
        videoGrid.classList.add('compact');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', initializeApp);