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
        
        // Fix malformed URLs first
        let urlString = url;
        if (!urlString.startsWith('http')) {
            urlString = 'https://' + urlString;
        }
        
        videoUrl = new URL(urlString);
        
        // Handle different video services
        if (urlString.includes('youtube.com') || urlString.includes('youtu.be')) {
            // Extract videoId more robustly
            let videoId = null;
            
            if (urlString.includes('youtu.be')) {
                // youtu.be/VIDEO_ID format
                const pathParts = videoUrl.pathname.split('/').filter(p => p);
                if (pathParts.length > 0) {
                    videoId = pathParts[0];
                }
            } else if (urlString.includes('youtube.com')) {
                // youtube.com/watch?v=VIDEO_ID format
                videoId = videoUrl.searchParams.get('v');
                
                // Handle youtube.com/embed/VIDEO_ID format
                if (!videoId && urlString.includes('/embed/')) {
                    const pathParts = videoUrl.pathname.split('/').filter(p => p);
                    if (pathParts.length > 1 && pathParts[0] === 'embed') {
                        videoId = pathParts[1];
                    }
                }
            }
            
            if (videoId) {
                videoUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? '1' : '0'}&playsinline=1`;
            } else {
                // Fallback if we can't parse the ID
                videoUrl = url;
            }
        } else if (urlString.includes('redgifs.com')) {
            // RedGifs handling - pass the current mute state
            videoUrl = getRedgifsEmbedUrl(url, isMuted);
        }
        
        const iframe = document.createElement('iframe');
        iframe.className = 'lightbox-iframe';
        iframe.src = typeof videoUrl === 'string' ? videoUrl : videoUrl.href;
        iframe.allow = 'autoplay; fullscreen; encrypted-media';
        iframe.allowFullscreen = true;
        iframe.frameBorder = "0";
        
        return iframe;
    } catch (e) {
        console.error("URL parsing error:", e);
        
        // Fallback to original URL
        const iframe = document.createElement('iframe');
        iframe.className = 'lightbox-iframe';
        iframe.src = url;
        iframe.allow = 'autoplay; fullscreen; encrypted-media';
        iframe.allowFullscreen = true;
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
    const video = document.createElement('video');
    video.className = 'lightbox-video';
    video.controls = true;
    video.autoplay = true;
    video.muted = isMuted;
    video.playsInline = true; // Fix for iOS
    
    // Clean up any existing audio elements
    const existingAudio = container.querySelector('audio');
    if (existingAudio) {
        existingAudio.remove();
    }
    
    // If there's an audio track
    if (audioUrl) {
        // Create audio element for sound
        const audio = document.createElement('audio');
        audio.src = audioUrl;
        audio.autoplay = true;
        audio.controls = false;
        audio.muted = isMuted;
        audio.preload = 'auto';
        audio.style.display = 'none';
        
        // Improved audio-video sync
        let audioSyncAttempts = 0;
        
        // Handle video play event
        video.onplay = () => {
            audio.currentTime = video.currentTime;
            const playPromise = audio.play();
            
            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    console.error("Audio play failed:", e);
                    audioSyncAttempts++;
                    
                    // After a few failures, try a different approach
                    if (audioSyncAttempts <= 3) {
                        // Try again with a delay
                        setTimeout(() => {
                            audio.currentTime = video.currentTime;
                            audio.play().catch(err => console.error("Delayed audio play failed:", err));
                        }, 500);
                    } else {
                        // Fallback: try playing after user interaction
                        const playButton = document.createElement('div');
                        playButton.className = 'manual-play-button';
                        playButton.innerHTML = '🔊';
                        playButton.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                        playButton.title = 'Enable Sound';
                        
                        playButton.onclick = (e) => {
                            e.stopPropagation();
                            audio.muted = false;
                            video.muted = false;
                            audio.currentTime = video.currentTime;
                            audio.play().catch(err => console.error("Audio play after click failed:", err));
                            playButton.remove();
                        };
                        
                        container.appendChild(playButton);
                    }
                });
            }
        };
        
        // Sync audio with video
        video.onpause = () => audio.pause();
        
        video.onseeked = () => { 
            audio.currentTime = video.currentTime;
            // Fix for seeking when paused
            if (!video.paused) {
                audio.play().catch(e => console.error("Audio play failed after seek:", e));
            }
        };
        
        // Handle time updates for better sync
        video.ontimeupdate = () => {
            // Only sync if the difference is significant
            if (Math.abs(video.currentTime - audio.currentTime) > 0.3) {
                audio.currentTime = video.currentTime;
            }
        };
        
        // Handle ended event
        video.onended = () => audio.pause();
        
        // Add audio element
        container.appendChild(audio);
    }
    
    // Set source after attaching event handlers
    video.src = videoUrl;
    
    return video;
}

/**
 * Update the mute state for all video elements
 * 
 * @param {boolean} isMuted - Whether to mute
 */
function updateMuteState(isMuted) {
    // Handle iframe videos
    if (currentVideoIframe) {
        try {
            const currentSrc = currentVideoIframe.src;
            const urlObj = new URL(currentSrc);
            
            if (currentSrc.includes('redgifs.com')) {
                // For Redgifs, we need to recreate the iframe with new parameters
                const redgifsId = urlObj.pathname.split('/').pop();
                currentVideoIframe.src = `https://www.redgifs.com/ifr/${redgifsId}?autoplay=1&muted=${isMuted ? '1' : '0'}&controls=1`;
            } else if (currentSrc.includes('youtube.com')) {
                // YouTube uses 'mute' parameter
                urlObj.searchParams.set('mute', isMuted ? '1' : '0');
                currentVideoIframe.src = urlObj.toString();
            } else {
                // Other services generally use 'muted'
                urlObj.searchParams.set('muted', isMuted ? '1' : '0');
                currentVideoIframe.src = urlObj.toString();
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