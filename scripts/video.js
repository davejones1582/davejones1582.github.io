/**
 * video.js - Video handling functions
 */
import { getRedgifsEmbedUrl } from './api.js';

// Track the current media elements
let currentVideoIframe = null;
let currentVideoElement = null;

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
                videoUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? '1' : '0'}&playsinline=1`;
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
        
        // Ensure iOS compatibility
        iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.setAttribute('playsinline', ''); // iOS requires this attribute
        iframe.setAttribute('webkit-playsinline', ''); // Older iOS versions
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
 * Create a native video element for Reddit videos
 * 
 * @param {string} videoUrl - Video URL
 * @param {string} audioUrl - Audio URL
 * @param {boolean} isMuted - Whether the video should be muted
 * @param {HTMLElement} container - Container element
 * @returns {HTMLVideoElement} - The video element
 */
function createRedditVideo(videoUrl, audioUrl, isMuted, container) {
    try {
        const video = document.createElement('video');
        video.className = 'lightbox-video';
        video.controls = true;
        video.autoplay = false; // Set to false initially for iOS
        video.muted = isMuted;
        video.playsInline = true;
        video.setAttribute('webkit-playsinline', ''); // For older iOS versions
        video.setAttribute('playsinline', '');
        
        // Create a play button overlay for iOS compatibility
        const playButton = document.createElement('div');
        playButton.className = 'manual-play-button';
        playButton.innerHTML = '▶';
        playButton.style.display = 'flex';
        
        // If there's an audio track
        let audio = null;
        if (audioUrl) {
            try {
                // Create audio element for sound
                audio = document.createElement('audio');
                audio.src = audioUrl;
                audio.autoplay = false; // Set to false initially for iOS
                audio.controls = false;
                audio.muted = isMuted;
                
                // Add audio element
                container.appendChild(audio);
            } catch (e) {
                console.error("Error creating audio element:", e);
            }
        }
        
        // Set video source after configuring
        try {
            video.src = videoUrl;
        } catch (e) {
            console.error("Error setting video source:", e);
        }
        
        // Add play button for user interaction
        container.appendChild(playButton);
        
        // iOS-compatible playback initialization
        playButton.addEventListener('click', function() {
            playButton.style.display = 'none';
            
            // Try to play video
            video.play().then(() => {
                // If we have audio, sync and play it
                if (audio) {
                    audio.currentTime = video.currentTime;
                    audio.play().catch(err => {
                        console.error("Audio play failed:", err);
                    });
                }
            }).catch(err => {
                console.error("Video play failed:", err);
                playButton.style.display = 'flex';
            });
        });
        
        // Handle audio-video sync if audio exists
        if (audio) {
            // Improved audio-video sync with iOS compatibility
            video.addEventListener('play', () => {
                audio.currentTime = video.currentTime;
                audio.play().catch(e => {
                    console.error("Audio sync play failed:", e);
                });
            });
            
            video.addEventListener('pause', () => {
                audio.pause();
            });
            
            video.addEventListener('seeked', () => { 
                audio.currentTime = video.currentTime;
                if (!video.paused) {
                    audio.play().catch(e => console.error("Audio play failed after seek:", e));
                }
            });
        }
        
        return video;
    } catch (e) {
        console.error("Error creating Reddit video:", e);
        
        // Fallback to a simple video element
        const video = document.createElement('video');
        video.className = 'lightbox-video';
        video.controls = true;
        video.src = videoUrl;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        
        return video;
    }
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
            
            // Also mute any audio elements (for Reddit videos)
            const audioElements = document.querySelectorAll('audio');
            audioElements.forEach(audio => {
                audio.muted = isMuted;
            });
        }
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
}

/**
 * Set current video references
 * 
 * @param {HTMLIFrameElement} iframe - Iframe element
 * @param {HTMLVideoElement} video - Video element
 */
function setVideoReferences(iframe, video) {
    currentVideoIframe = iframe;
    currentVideoElement = video;
}

export {
    createVideoIframe,
    createRedditVideo,
    updateMuteState,
    resetVideoReferences,
    setVideoReferences
};