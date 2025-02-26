/**
 * lightbox.js - Lightbox functionality
 */
import { createVideoIframe, createRedditVideo, setVideoReferences, resetVideoReferences } from './video.js';

let currentVideoIndex = 0;
let touchStartX = 0;

/**
 * Show lightbox with video
 * 
 * @param {Object} item - Video data
 * @param {number} index - Video index
 * @param {Array} videos - All videos
 * @param {boolean} isMuted - Whether sound is muted
 * @param {function} isFavoriteCheck - Function to check if video is favorited
 * @param {function} onToggleFavorite - Callback for toggling favorite
 */
function showLightbox(item, index, videos, isMuted, isFavoriteCheck, onToggleFavorite) {
    if (!item) return;
    
    currentVideoIndex = index;
    
    const container = document.getElementById('media-container');
    container.innerHTML = ''; // Clear previous content
    resetVideoReferences();
    
    // Handle different video types
    if (item.isVideo) {
        try {
            if (item.isReddit && item.fallbackUrl) {
                // Native Reddit video with fallback URL
                const video = createRedditVideo(item.fallbackUrl, item.audioUrl, isMuted, container);
                container.appendChild(video);
                
                video.play().catch(e => {
                    console.error("Video play failed:", e);
                    // Show a play button overlay when autoplay fails
                    const playButton = document.createElement('div');
                    playButton.className = 'manual-play-button';
                    playButton.innerHTML = '▶';
                    playButton.addEventListener('click', () => {
                        video.play().catch(err => console.error("Manual play failed:", err));
                        playButton.style.display = 'none';
                    });
                    container.appendChild(playButton);
                });
                
                setVideoReferences(null, video);
            } else {
                // Embedded video (YouTube, Redgifs, etc)
                const iframe = createVideoIframe(item.url, isMuted);
                container.appendChild(iframe);
                setVideoReferences(iframe, null);
            }
        } catch (error) {
            console.error("Error displaying video:", error);
            // Fallback to showing the thumbnail as an image
            const img = document.createElement('img');
            img.className = 'lightbox-image';
            img.src = item.thumbnail;
            container.appendChild(img);
            
            // Add error message
            const errorMsg = document.createElement('div');
            errorMsg.className = 'media-error-message';
            errorMsg.textContent = 'Could not load video. Click to view on Reddit.';
            errorMsg.addEventListener('click', () => {
                window.open(`https://reddit.com${item.permalink}`, '_blank');
            });
            container.appendChild(errorMsg);
        }
    } else {
        // Image
        const img = document.createElement('img');
        img.className = 'lightbox-image';
        img.src = item.url;
        container.appendChild(img);
    }

    // Add metadata with favorite button
    const isFavorite = isFavoriteCheck(item.id);
    const metadata = document.getElementById('lightbox-metadata');
    metadata.innerHTML = `
        <div class="lightbox-header">
            <div>r/${item.subreddit}</div>
            <button class="lightbox-favorite ${isFavorite ? 'active' : ''}" data-id="${item.id}">
                ${isFavorite ? '★' : '☆'}
            </button>
        </div>
        <div>↑ ${item.upvotes} • ${item.created}</div>
        <div>${item.title}</div>
        <a class="lightbox-link" href="https://reddit.com${item.permalink}" target="_blank">View Post</a>
    `;
    
    // Add event listener to favorite button
    const favBtn = metadata.querySelector('.lightbox-favorite');
    favBtn.addEventListener('click', () => onToggleFavorite(item.id));

    document.getElementById('lightbox').style.display = 'flex';
    
    // Set up event listeners
    setupLightboxEventListeners(videos, isMuted, isFavoriteCheck, onToggleFavorite);
}

/**
 * Close the lightbox
 */
function closeLightbox() {
    // Destroy the video element completely
    const container = document.getElementById('media-container');
    container.innerHTML = '';
    
    // Reset video references
    resetVideoReferences();
    
    // Hide lightbox
    document.getElementById('lightbox').style.display = 'none';
    
    // Clean up event listeners
    document.removeEventListener('keydown', handleKeyDown);
    const lightbox = document.getElementById('lightbox');
    lightbox.removeEventListener('touchstart', handleTouchStart);
    lightbox.removeEventListener('touchend', handleTouchEnd);
}

/**
 * Navigate to next or previous item
 * 
 * @param {number} direction - Direction (-1 for previous, 1 for next)
 * @param {Array} videos - Videos array
 * @param {boolean} isMuted - Mute state
 * @param {function} isFavoriteCheck - Function to check if video is favorited
 * @param {function} onToggleFavorite - Callback for toggling favorite
 */
function navigate(direction, videos, isMuted, isFavoriteCheck, onToggleFavorite) {
    if (videos.length === 0) return;
    
    currentVideoIndex += direction;
    if (currentVideoIndex < 0) currentVideoIndex = videos.length - 1;
    if (currentVideoIndex >= videos.length) currentVideoIndex = 0;
    
    showLightbox(
        videos[currentVideoIndex], 
        currentVideoIndex, 
        videos, 
        isMuted, 
        isFavoriteCheck, 
        onToggleFavorite
    );
}

/**
 * Handle keyboard events
 * 
 * @param {Event} e - Keyboard event
 * @param {Array} videos - Videos array
 * @param {boolean} isMuted - Mute state
 * @param {function} isFavoriteCheck - Function to check if video is favorited
 * @param {function} onToggleFavorite - Callback for toggling favorite
 */
function handleKeyDown(e, videos, isMuted, isFavoriteCheck, onToggleFavorite) {
    if (document.getElementById('lightbox').style.display === 'flex') {
        if (e.key === 'ArrowLeft') navigate(-1, videos, isMuted, isFavoriteCheck, onToggleFavorite);
        if (e.key === 'ArrowRight') navigate(1, videos, isMuted, isFavoriteCheck, onToggleFavorite);
        if (e.key === 'Escape') closeLightbox();
    }
}

/**
 * Handle touch start event
 * 
 * @param {Event} e - Touch event
 */
function handleTouchStart(e) {
    touchStartX = e.touches[0].clientX;
}

/**
 * Handle touch end event
 * 
 * @param {Event} e - Touch event
 * @param {Array} videos - Videos array
 * @param {boolean} isMuted - Mute state
 * @param {function} isFavoriteCheck - Function to check if video is favorited
 * @param {function} onToggleFavorite - Callback for toggling favorite
 */
function handleTouchEnd(e, videos, isMuted, isFavoriteCheck, onToggleFavorite) {
    const touchEndX = e.changedTouches[0].clientX;
    const diffX = touchStartX - touchEndX;
    
    if (Math.abs(diffX) > 50) {
        navigate(diffX > 0 ? 1 : -1, videos, isMuted, isFavoriteCheck, onToggleFavorite);
    }
}

/**
 * Set up lightbox event listeners
 * 
 * @param {Array} videos - Videos array
 * @param {boolean} isMuted - Mute state
 * @param {function} isFavoriteCheck - Function to check if video is favorited
 * @param {function} onToggleFavorite - Callback for toggling favorite
 */
function setupLightboxEventListeners(videos, isMuted, isFavoriteCheck, onToggleFavorite) {
    // Clean up existing event listeners before adding new ones
    document.removeEventListener('keydown', handleKeyDown);
    document.addEventListener('keydown', (e) => 
        handleKeyDown(e, videos, isMuted, isFavoriteCheck, onToggleFavorite)
    );
    
    const lightbox = document.getElementById('lightbox');
    lightbox.removeEventListener('touchstart', handleTouchStart);
    lightbox.removeEventListener('touchend', handleTouchEnd);
    lightbox.addEventListener('touchstart', handleTouchStart);
    lightbox.addEventListener('touchend', (e) => 
        handleTouchEnd(e, videos, isMuted, isFavoriteCheck, onToggleFavorite)
    );
    
    // Set up navigation buttons
    const prevBtn = document.querySelector('.lightbox-prev');
    const nextBtn = document.querySelector('.lightbox-next');
    
    if (prevBtn) {
        prevBtn.onclick = () => navigate(-1, videos, isMuted, isFavoriteCheck, onToggleFavorite);
    }
    
    if (nextBtn) {
        nextBtn.onclick = () => navigate(1, videos, isMuted, isFavoriteCheck, onToggleFavorite);
    }
    
    // Set up close button
    const closeBtn = document.querySelector('.lightbox-close');
    if (closeBtn) {
        closeBtn.onclick = closeLightbox;
    }
    
    // Set up lightbox backdrop click
    lightbox.onclick = (e) => {
        if (e.target === lightbox) {
            closeLightbox();
        }
    };
}

export {
    showLightbox,
    closeLightbox,
    navigate
};