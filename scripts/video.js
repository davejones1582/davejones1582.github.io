/**
 * video.js - Enhanced video handling with improved compatibility
 */
import { getRedgifsEmbedUrl } from './api.js';

// Track the current media elements
let currentVideoIframe = null;
let currentVideoElement = null;
let currentAudioElement = null;

// Keep track of playing videos to optimize performance
const activeVideoTrackers = new Set();

/**
 * Create an iframe element for external videos
 * 
 * @param {string} url - Video URL
 * @param {boolean} isMuted - Whether the video should be muted
 * @returns {HTMLIFrameElement} - The iframe element
 */
function createVideoIframe(url, isMuted) {
    try {
        let videoUrl;
        
        // Fix malformed URLs first - more robust URL handling
        let urlString = String(url || '');
        if (!urlString.startsWith('http')) {
            urlString = 'https://' + urlString;
        }
        
        // For iOS Safari compatibility, use try/catch for each URL operation
        try {
            videoUrl = new URL(urlString);
        } catch (e) {
            console.error("URL parsing error:", e);
            // Fallback to string handling
            videoUrl = urlString;
        }
        
        // Handle different video services
        if (urlString.includes('youtube.com') || urlString.includes('youtu.be')) {
            // Extract videoId more robustly
            let videoId = null;
            
            if (urlString.includes('youtu.be')) {
                try {
                    // youtu.be/VIDEO_ID format
                    const pathParts = urlString.split('/').filter(p => p);
                    const lastPart = pathParts[pathParts.length - 1];
                    videoId = lastPart.split('?')[0]; // Remove any query params
                } catch (e) {
                    console.error("YouTube URL parsing error:", e);
                }
            } else if (urlString.includes('youtube.com')) {
                try {
                    // youtube.com/watch?v=VIDEO_ID format
                    const match = urlString.match(/[?&]v=([^&#]*)/);
                    videoId = match && match[1];
                    
                    // Handle youtube.com/embed/VIDEO_ID format
                    if (!videoId && urlString.includes('/embed/')) {
                        const embedMatch = urlString.match(/\/embed\/([^/?#]+)/);
                        videoId = embedMatch && embedMatch[1];
                    }
                } catch (e) {
                    console.error("YouTube URL parsing error:", e);
                }
            }
            
            if (videoId) {
                videoUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? '1' : '0'}&playsinline=1&rel=0`;
            } else {
                // Fallback if we can't parse the ID
                videoUrl = urlString;
            }
        } else if (urlString.includes('redgifs.com')) {
            try {
                // RedGifs handling - pass the current mute state
                videoUrl = getRedgifsEmbedUrl(urlString, isMuted);
            } catch (e) {
                console.error("RedGifs URL parsing error:", e);
                videoUrl = urlString;
            }
        } else if (urlString.includes('gfycat.com')) {
            // Convert gfycat URLs to their embedded version
            try {
                const gfycatId = urlString.split('/').pop().split('-')[0];
                if (gfycatId) {
                    videoUrl = `https://gfycat.com/ifr/${gfycatId}?autoplay=1&muted=${isMuted ? '1' : '0'}`;
                } else {
                    videoUrl = urlString;
                }
            } catch (e) {
                console.error("Gfycat URL parsing error:", e);
                videoUrl = urlString;
            }
        }
        
        const iframe = document.createElement('iframe');
        iframe.className = 'lightbox-iframe';
        
        // Handle videoUrl based on its type
        if (typeof videoUrl === 'string') {
            iframe.src = videoUrl;
        } else if (videoUrl && typeof videoUrl.href === 'string') {
            iframe.src = videoUrl.href;
        } else {
            // Last resort fallback
            iframe.src = String(url || '');
        }
        
        // Ensure maximum compatibility
        iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.setAttribute('playsinline', ''); // iOS requires this attribute
        iframe.setAttribute('webkit-playsinline', ''); // Older iOS versions
        iframe.setAttribute('loading', 'lazy'); // Performance improvement
        iframe.frameBorder = "0";
        
        return iframe;
    } catch (e) {
        console.error("Error creating iframe:", e);
        
        // Extremely safe fallback with minimal assumptions
        const iframe = document.createElement('iframe');
        iframe.className = 'lightbox-iframe';
        iframe.src = String(url || '');
        iframe.allow = 'autoplay; fullscreen';
        iframe.allowFullscreen = true;
        iframe.setAttribute('playsinline', '');
        iframe.setAttribute('webkit-playsinline', '');
        iframe.frameBorder = "0";
        
        return iframe;
    }
}

/**
 * Create a native video element for Reddit videos with improved iOS compatibility
 * 
 * @param {string} videoUrl - Video URL
 * @param {string} audioUrl - Audio URL
 * @param {boolean} isMuted - Whether the video should be muted
 * @param {HTMLElement} container - Container element
 * @returns {HTMLVideoElement} - The video element
 */
function createRedditVideo(videoUrl, audioUrl, isMuted, container) {
    // Create video element
    const video = document.createElement('video');
    video.className = 'lightbox-video';
    video.controls = true;
    video.autoplay = true; // Try autoplay first
    video.muted = isMuted;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('playsinline', '');
    video.preload = 'metadata'; // For faster loading
    
    // Use srcset for different video qualities if available
    if (videoUrl && videoUrl.includes('DASH_')) {
        try {
            // Extract the base URL and add quality variants
            const baseUrl = videoUrl.split('DASH_')[0];
            const qualityMatch = videoUrl.match(/DASH_(\d+)/);
            const currentQuality = qualityMatch ? parseInt(qualityMatch[1]) : 720;
            
            // Add source elements for different qualities
            const qualities = [1080, 720, 480, 360, 240].filter(q => q <= currentQuality);
            
            qualities.forEach(quality => {
                const source = document.createElement('source');
                source.src = `${baseUrl}DASH_${quality}.mp4`;
                source.type = 'video/mp4';
                video.appendChild(source);
            });
        } catch (e) {
            console.error("Error setting up video quality sources:", e);
            // Fallback to direct src
            video.src = videoUrl;
        }
    } else {
        video.src = videoUrl;
    }
    
    // Create play button overlay for iOS and other browsers that block autoplay
    const playButton = document.createElement('div');
    playButton.className = 'manual-play-button';
    playButton.innerHTML = '<svg viewBox="0 0 24 24" width="48" height="48"><path fill="white" d="M8 5v14l11-7z"></path></svg>';
    container.appendChild(playButton);
    
    // Add loading spinner
    const spinner = document.createElement('div');
    spinner.className = 'video-loading-spinner';
    container.appendChild(spinner);
    
    // Handle audio element with better error recovery
    let audio = null;
    if (audioUrl) {
        try {
            audio = document.createElement('audio');
            audio.src = audioUrl;
            audio.autoplay = false;
            audio.muted = isMuted;
            audio.preload = 'metadata';
            container.appendChild(audio);
            currentAudioElement = audio;
            
            // Add error handling for audio
            audio.addEventListener('error', (e) => {
                console.warn("Audio load error:", e);
                // Continue with video only - don't show error to user
            });
        } catch (e) {
            console.error("Error creating audio element:", e);
        }
    }
    
    // Enhanced error handling with fallback options
    video.addEventListener('error', (e) => {
        console.error("Video load error:", e);
        
        // Try an alternative format if the current one fails
        const errorCode = (video.error && video.error.code) || 0;
        
        if (errorCode === 4) { // MEDIA_ERR_SRC_NOT_SUPPORTED
            // Try a lower quality if possible
            if (videoUrl && videoUrl.includes('DASH_1080')) {
                video.src = videoUrl.replace('DASH_1080', 'DASH_720');
                video.load();
                return;
            }
        }
        
        // Show error message with fallback option
        spinner.style.display = 'none';
        const errorMsg = document.createElement('div');
        errorMsg.className = 'media-error-message';
        errorMsg.innerHTML = `
            <p>Video failed to load.</p>
            <a href="https://reddit.com${permalink}" target="_blank" rel="noopener noreferrer" class="error-link">
                Open on Reddit
            </a>
        `;
        container.appendChild(errorMsg);
    });
    
    // Better loading states
    video.addEventListener('loadstart', () => {
        spinner.style.display = 'block';
        playButton.style.display = 'none';
    });
    
    video.addEventListener('canplay', () => {
        spinner.style.display = 'none';
        // Only show play button if video isn't already playing
        if (video.paused) {
            playButton.style.display = 'flex';
        } else {
            playButton.style.display = 'none';
        }
    });
    
    // Advanced autoplay detection
    video.addEventListener('play', () => {
        playButton.style.display = 'none';
        spinner.style.display = 'none';
    });
    
    video.addEventListener('pause', () => {
        // Only show play button if the video has loaded
        if (video.readyState >= 2) {
            playButton.style.display = 'flex';
        }
    });
    
    // Improved play button click handler
    playButton.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent lightbox closing
        playButton.style.display = 'none';
        
        // Try to play video with robust error handling
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Successfully started playing video
                if (audio) {
                    // Make sure audio is synced with video
                    audio.currentTime = video.currentTime;
                    const audioPromise = audio.play();
                    if (audioPromise !== undefined) {
                        audioPromise.catch(e => {
                            console.error("Audio play failed:", e);
                            // If audio fails but video works, continue with video only
                        });
                    }
                }
                
                // Add to active trackers
                const tracker = { video, audio };
                activeVideoTrackers.add(tracker);
                
                // Set a cleanup function to remove this video from trackers
                video.addEventListener('ended', () => {
                    activeVideoTrackers.delete(tracker);
                }, { once: true });
                
            }).catch(err => {
                console.error("Video play failed:", err);
                // Show play button again if autoplay fails
                playButton.style.display = 'flex';
                
                // For iOS, we might need user interaction
                if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
                    // Add a message to encourage user interaction
                    const tapMsg = document.createElement('div');
                    tapMsg.className = 'tap-to-play-message';
                    tapMsg.textContent = 'Tap to play video';
                    container.appendChild(tapMsg);
                    
                    // Remove the message on click
                    container.addEventListener('click', () => {
                        if (tapMsg.parentNode) {
                            tapMsg.parentNode.removeChild(tapMsg);
                        }
                    }, { once: true });
                }
            });
        }
    });
    
    // Improved audio-video sync for cross-browser compatibility
    if (audio) {
        // Keep audio in sync with video
        video.addEventListener('play', () => {
            audio.currentTime = video.currentTime;
            audio.play().catch(e => console.warn("Audio sync error:", e));
        });
        
        video.addEventListener('pause', () => {
            audio.pause();
        });
        
        // Critical for iOS: sync on timeupdate with debouncing
        let lastSyncTime = 0;
        video.addEventListener('timeupdate', () => {
            // Only sync if difference is significant and not too frequent
            const now = Date.now();
            if (now - lastSyncTime > 2000 && Math.abs(video.currentTime - audio.currentTime) > 0.3) {
                audio.currentTime = video.currentTime;
                lastSyncTime = now;
            }
        });
        
        video.addEventListener('seeked', () => {
            audio.currentTime = video.currentTime;
            if (!video.paused) {
                audio.play().catch(e => console.warn("Audio seek error:", e));
            }
        });
        
        // Handle interruptions
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Resync when tab becomes visible again
                if (!video.paused) {
                    audio.currentTime = video.currentTime;
                    audio.play().catch(e => {});
                }
            } else if (document.visibilityState === 'hidden') {
                // Save resources when tab is not visible
                if (!video.paused) {
                    video.pause();
                    audio.pause();
                }
            }
        });
    }
    
    return video;
}

/**
 * Update the mute state for all video elements
 * 
 * @param {boolean} isMuted - Whether to mute
 */
function updateMuteState(isMuted) {
    try {
        // Handle iframe videos
        if (currentVideoIframe) {
            try {
                if (currentVideoIframe.src.includes('redgifs.com')) {
                    // For Redgifs, we need to recreate the iframe with new parameters
                    const currentSrc = currentVideoIframe.src;
                    const idMatch = currentSrc.match(/\/ifr\/([^?&]+)/);
                    const redgifsId = idMatch && idMatch[1];
                    
                    if (redgifsId) {
                        // Create new URL with updated mute parameter
                        currentVideoIframe.src = `https://www.redgifs.com/ifr/${redgifsId}?autoplay=1&muted=${isMuted ? '1' : '0'}&controls=1`;
                    }
                } else if (currentVideoIframe.src.includes('gfycat.com')) {
                    // Handle Gfycat similarly
                    const currentSrc = currentVideoIframe.src;
                    const idMatch = currentSrc.match(/\/ifr\/([^?&]+)/);
                    const gfycatId = idMatch && idMatch[1];
                    
                    if (gfycatId) {
                        currentVideoIframe.src = `https://gfycat.com/ifr/${gfycatId}?autoplay=1&muted=${isMuted ? '1' : '0'}`;
                    }
                } else {
                    // Handle other iframe types
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
                        console.error('URL parsing error in updateMuteState:', e);
                    }
                }
            } catch (e) {
                console.error('Could not update iframe mute state:', e);
            }
        }
        
        // Handle HTML5 video
        if (currentVideoElement) {
            currentVideoElement.muted = isMuted;
        }
        
        // Handle audio element
        if (currentAudioElement) {
            currentAudioElement.muted = isMuted;
        }
        
        // Update all active trackers
        activeVideoTrackers.forEach(tracker => {
            if (tracker.video) tracker.video.muted = isMuted;
            if (tracker.audio) tracker.audio.muted = isMuted;
        });
    } catch (e) {
        console.error('Error in updateMuteState:', e);
    }
}

/**
 * Reset current video references
 */
function resetVideoReferences() {
    currentVideoIframe = null;
    currentVideoElement = null;
    currentAudioElement = null;
    
    // Stop and clear all tracked videos to free resources
    activeVideoTrackers.forEach(tracker => {
        try {
            if (tracker.video) {
                tracker.video.pause();
                tracker.video.src = '';
                tracker.video.load();
            }
            if (tracker.audio) {
                tracker.audio.pause();
                tracker.audio.src = '';
                tracker.audio.load();
            }
        } catch (e) {
            console.warn('Error cleaning up media elements:', e);
        }
    });
    
    activeVideoTrackers.clear();
}

/**
 * Set current video references
 * 
 * @param {HTMLIFrameElement} iframe - Iframe element
 * @param {HTMLVideoElement} video - Video element
 * @param {HTMLAudioElement} audio - Audio element
 */
function setVideoReferences(iframe, video, audio) {
    currentVideoIframe = iframe;
    currentVideoElement = video;
    currentAudioElement = audio;
}

/**
 * Create thumbnail videos for grid items (low power preview)
 * 
 * @param {string} videoUrl - Video URL
 * @param {string} thumbnailUrl - Thumbnail URL
 * @param {HTMLElement} container - Container element
 * @returns {HTMLElement} - Either video or image element
 */
function createThumbnailPreview(videoUrl, thumbnailUrl, container) {
    // Default to image for performance
    const img = document.createElement('img');
    img.className = 'thumbnail';
    img.src = thumbnailUrl;
    img.loading = 'lazy';
    img.decoding = 'async';
    
    // Add hover preview only for Reddit videos in Reddit native format
    if (videoUrl && videoUrl.includes('v.redd.it') && 
        !container.closest('.compact')) { // Skip in compact mode
        
        container.addEventListener('mouseenter', () => {
            // Only create preview if user hovers for a moment
            const hoverTimer = setTimeout(() => {
                try {
                    // Extract base URL without query params
                    const baseUrl = videoUrl.split('?')[0];
                    const previewUrl = `${baseUrl}/DASH_96.mp4`;
                    
                    const previewVideo = document.createElement('video');
                    previewVideo.className = 'thumbnail-preview';
                    previewVideo.muted = true;
                    previewVideo.autoplay = true;
                    previewVideo.loop = true;
                    previewVideo.playsInline = true;
                    previewVideo.src = previewUrl;
                    
                    // Add preview behind the thumbnail
                    container.insertBefore(previewVideo, img);
                    
                    // Cleanup function
                    container.addEventListener('mouseleave', () => {
                        previewVideo.pause();
                        previewVideo.src = '';
                        previewVideo.remove();
                    }, { once: true });
                } catch (e) {
                    console.warn('Error creating thumbnail preview:', e);
                }
            }, 300); // 300ms delay before loading preview
            
            container.addEventListener('mouseleave', () => {
                clearTimeout(hoverTimer);
            }, { once: true });
        });
    }
    
    return img;
}

/**
 * Optimize video memory usage
 */
function optimizeVideoMemory() {
    // Limit number of active videos
    if (activeVideoTrackers.size > 3) {
        // Find oldest trackers to remove (beyond the first 3)
        const trackersArray = Array.from(activeVideoTrackers);
        const trackersToRemove = trackersArray.slice(0, trackersArray.length - 3);
        
        trackersToRemove.forEach(tracker => {
            try {
                if (tracker.video) {
                    tracker.video.pause();
                    tracker.video.src = '';
                    tracker.video.load();
                }
                if (tracker.audio) {
                    tracker.audio.pause();
                    tracker.audio.src = '';
                    tracker.audio.load();
                }
                activeVideoTrackers.delete(tracker);
            } catch (e) {
                console.warn('Error cleaning up media elements:', e);
            }
        });
    }
}

export {
    createVideoIframe,
    createRedditVideo,
    createThumbnailPreview,
    updateMuteState,
    resetVideoReferences,
    setVideoReferences,
    optimizeVideoMemory
};