/**
 * iOS Safari Compatibility Fixes
 * 
 * This patch addresses several critical issues with the Reddit Video Gallery app
 * that prevent it from working correctly on iOS devices:
 * 
 * 1. Fix string handling in URL parsing
 * 2. Improve iOS video playback
 * 3. Fix touchEvent handling
 * 4. Update lightbox navigation for iOS
 */

// === PATCH 1: Fix URL parsing in video.js ===
function createVideoIframe(url, isMuted) {
    try {
        // Ensure url is a valid string to prevent "isn't working correctly" errors
        if (!url || typeof url !== 'string') {
            url = String(url || '');
        }
        
        let videoUrl = url;
        
        // Parse YouTube videos - more robust method
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            let videoId = null;
            
            if (url.includes('youtu.be/')) {
                // Format: youtu.be/VIDEO_ID
                const parts = url.split('youtu.be/');
                if (parts.length > 1) {
                    videoId = parts[1].split(/[?&#]/)[0];
                }
            } else if (url.includes('youtube.com')) {
                // Format: youtube.com/watch?v=VIDEO_ID
                const match = url.match(/[?&]v=([^&#]*)/);
                videoId = match && match[1];
                
                // Handle youtube.com/embed/VIDEO_ID format
                if (!videoId && url.includes('/embed/')) {
                    const embedMatch = url.match(/\/embed\/([^/?#]+)/);
                    videoId = embedMatch && embedMatch[1];
                }
            }
            
            if (videoId) {
                videoUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? '1' : '0'}&playsinline=1`;
            }
        } else if (url.includes('redgifs.com')) {
            // Extract ID more safely
            const idMatch = url.match(/redgifs\.com\/watch\/([a-zA-Z0-9]+)/);
            const id = idMatch ? idMatch[1] : url.split('/').pop();
            videoUrl = `https://www.redgifs.com/ifr/${id}?autoplay=1&muted=${isMuted ? '1' : '0'}&controls=1`;
        }
        
        const iframe = document.createElement('iframe');
        iframe.className = 'lightbox-iframe';
        iframe.src = videoUrl;
        iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.setAttribute('playsinline', '');
        iframe.setAttribute('webkit-playsinline', '');
        iframe.frameBorder = "0";
        
        return iframe;
    } catch (e) {
        console.error("Error creating iframe:", e);
        
        // Fallback to a basic iframe
        const iframe = document.createElement('iframe');
        iframe.className = 'lightbox-iframe';
        iframe.src = String(url || '');
        iframe.allowFullscreen = true;
        
        return iframe;
    }
}

// === PATCH 2: Fix Reddit Video Playback on iOS ===
function createRedditVideo(videoUrl, audioUrl, isMuted, container) {
    // Create play button overlay (iOS requires user interaction)
    const playButton = document.createElement('div');
    playButton.className = 'manual-play-button';
    playButton.innerHTML = '▶';
    playButton.style.display = 'flex';
    container.appendChild(playButton);
    
    // Create video element with iOS-compatible settings
    const video = document.createElement('video');
    video.className = 'lightbox-video';
    video.controls = true;
    video.autoplay = false; // Always false for iOS
    video.muted = isMuted;
    video.playsInline = true; 
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('playsinline', '');
    video.src = videoUrl;
    
    // Add audio element if needed
    let audio = null;
    if (audioUrl) {
        audio = document.createElement('audio');
        audio.src = audioUrl;
        audio.autoplay = false;
        audio.controls = false;
        audio.muted = isMuted;
        container.appendChild(audio);
    }
    
    // Handle play button click - critical for iOS
    playButton.addEventListener('click', function() {
        playButton.style.display = 'none';
        
        // Try to play video with error handling
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Play audio if available
                if (audio) {
                    audio.currentTime = video.currentTime;
                    const audioPromise = audio.play();
                    if (audioPromise !== undefined) {
                        audioPromise.catch(e => {
                            console.error("Audio play failed:", e);
                        });
                    }
                }
            }).catch(err => {
                console.error("Video play failed:", err);
                playButton.style.display = 'flex';
            });
        }
    });
    
    // Improved audio-video sync for iOS
    if (audio) {
        // Keep audio in sync with video events
        video.addEventListener('play', () => {
            audio.currentTime = video.currentTime;
            audio.play().catch(() => {});
        });
        
        video.addEventListener('pause', () => {
            audio.pause();
        });
        
        video.addEventListener('seeked', () => {
            audio.currentTime = video.currentTime;
            if (!video.paused) {
                audio.play().catch(() => {});
            }
        });
    }
    
    return video;
}

// === PATCH 3: Fix touch event handling in lightbox.js ===
function setupLightboxEventListeners(videos, isMuted, isFavoriteCheck, onToggleFavorite) {
    try {
        // Clean up existing event listeners
        document.removeEventListener('keydown', handleKeyDown);
        document.addEventListener('keydown', (e) => 
            handleKeyDown(e, videos, isMuted, isFavoriteCheck, onToggleFavorite)
        );
        
        const lightbox = document.getElementById('lightbox');
        if (!lightbox) return;
        
        // Remove existing touch listeners
        lightbox.removeEventListener('touchstart', handleTouchStart);
        lightbox.removeEventListener('touchmove', handleTouchMove);
        lightbox.removeEventListener('touchend', handleTouchEnd);
        
        // Add proper iOS-compatible touch handling
        lightbox.addEventListener('touchstart', (e) => {
            const touchStartX = e.touches[0].clientX;
            lightbox.dataset.touchStartX = touchStartX;
        }, { passive: true });
        
        lightbox.addEventListener('touchmove', (e) => {
            const touchEndX = e.touches[0].clientX;
            lightbox.dataset.touchEndX = touchEndX;
        }, { passive: true });
        
        lightbox.addEventListener('touchend', (e) => {
            const touchStartX = parseFloat(lightbox.dataset.touchStartX || 0);
            const touchEndX = parseFloat(lightbox.dataset.touchEndX || 0);
            const diffX = touchStartX - touchEndX;
            
            // Only navigate if the swipe was intentional (more than 50px)
            if (Math.abs(diffX) > 50) {
                // Navigate in the correct direction
                navigate(diffX > 0 ? 1 : -1, videos, isMuted, isFavoriteCheck, onToggleFavorite);
            }
            
            // Clean up
            delete lightbox.dataset.touchStartX;
            delete lightbox.dataset.touchEndX;
        });
        
        // Set up navigation buttons
        const prevBtn = document.querySelector('.lightbox-prev');
        const nextBtn = document.querySelector('.lightbox-next');
        
        if (prevBtn) {
            prevBtn.onclick = (e) => {
                e.stopPropagation();
                navigate(-1, videos, isMuted, isFavoriteCheck, onToggleFavorite);
            };
        }
        
        if (nextBtn) {
            nextBtn.onclick = (e) => {
                e.stopPropagation();
                navigate(1, videos, isMuted, isFavoriteCheck, onToggleFavorite);
            };
        }
        
        // Set up close button
        const closeBtn = document.querySelector('.lightbox-close');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                closeLightbox();
            };
        }
        
        // Set up lightbox backdrop click
        lightbox.onclick = (e) => {
            if (e.target === lightbox) {
                closeLightbox();
            }
        };
    } catch (e) {
        console.error("Error in setupLightboxEventListeners:", e);
    }
}

// === PATCH 4: iOS-specific CSS fixes ===
function addIOSSpecificCSS() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        /* iOS-specific fixes */
        .mobile-view .thumbnail-container {
            height: 140px;
            position: relative;
            background-color: #000;
        }
        
        .mobile-view .favorite-button {
            opacity: 1;
            background: rgba(0, 0, 0, 0.7);
        }
        
        /* Prevent rubber-banding */
        .lightbox {
            position: fixed;
            touch-action: none;
            overflow: hidden;
        }
        
        /* Make play button better for touch */
        .manual-play-button {
            width: 70px;
            height: 70px;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 100;
        }
        
        /* Fix nav buttons for touch */
        .mobile-view .lightbox-nav {
            width: 50px;
            height: 50px;
            background-color: rgba(0, 0, 0, 0.5);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            top: 50%;
            transform: translateY(-50%);
            z-index: 10;
        }
        
        .mobile-view .lightbox-prev {
            left: 15px;
        }
        
        .mobile-view .lightbox-next {
            right: 15px;
        }
    `;
    document.head.appendChild(styleEl);
}

// === PATCH 5: Update initialization for iOS ===
function initIOSFixes() {
    // Add iOS-specific CSS
    addIOSSpecificCSS();
    
    // Disable scroll on lightbox
    const lightbox = document.getElementById('lightbox');
    if (lightbox) {
        lightbox.addEventListener('touchmove', function(e) {
            e.preventDefault();
        }, { passive: false });
    }
    
    // Fix default browser behavior
    document.body.addEventListener('touchstart', function() {}, { passive: true });
    
    console.log("iOS compatibility fixes loaded");
}

// Initialize fixes when the page loads
document.addEventListener('DOMContentLoaded', initIOSFixes);

// Export patched functions to replace the originals
export {
    createVideoIframe,
    createRedditVideo,
    setupLightboxEventListeners
};
