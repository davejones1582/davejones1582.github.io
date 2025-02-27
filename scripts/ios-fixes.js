/**
 * iOS Safari Compatibility Fixes
 * 
 * This patch addresses several critical issues with the Reddit Video Gallery app
 * that prevent it from working correctly on iOS devices:
 * 
 * 1. Fix string handling in URL parsing without regex
 * 2. Improve iOS video playback
 * 3. Fix touchEvent handling
 * 4. Update lightbox navigation for iOS
 */

/**
 * Safe YouTube ID extraction without regex for iOS Safari
 * 
 * @param {string} url - YouTube URL
 * @returns {string|null} - Video ID or null if not found
 */
function safeExtractYouTubeID(url) {
    // Safe string handling
    if (!url || typeof url !== 'string') {
      return null;
    }
    
    let videoId = null;
    
    try {
      // Handle youtu.be format
      if (url.indexOf('youtu.be/') >= 0) {
        const parts = url.split('youtu.be/');
        if (parts.length > 1) {
          // Get everything after the last slash until any ? or & or #
          const potentialId = parts[1].split(/[?&#]/)[0];
          if (potentialId && potentialId.length > 0) {
            videoId = potentialId;
          }
        }
      } 
      // Handle youtube.com format
      else if (url.indexOf('youtube.com') >= 0) {
        // Check for v= parameter
        if (url.indexOf('v=') >= 0) {
          const parts = url.split('v=');
          if (parts.length > 1) {
            // Get everything after v= until any & or #
            const potentialId = parts[1].split(/[&#]/)[0];
            if (potentialId && potentialId.length > 0) {
              videoId = potentialId;
            }
          }
        }
        // Check for /embed/ format
        else if (url.indexOf('/embed/') >= 0) {
          const parts = url.split('/embed/');
          if (parts.length > 1) {
            // Get everything after /embed/ until any ? or &
            const potentialId = parts[1].split(/[?&#]/)[0];
            if (potentialId && potentialId.length > 0) {
              videoId = potentialId;
            }
          }
        }
      }
      
      return videoId;
    } catch (e) {
      console.error("Safe YouTube ID extraction failed:", e);
      return null;
    }
  }
  
  // === PATCH 1: Fix URL parsing in video.js ===
  function createVideoIframe(url, isMuted) {
    try {
      // Ensure url is a string
      const safeUrl = String(url || '');
      let videoUrl = safeUrl;
      
      // Handle YouTube videos with safe parsing
      if (safeUrl.indexOf('youtube.com') >= 0 || safeUrl.indexOf('youtu.be') >= 0) {
        const videoId = safeExtractYouTubeID(safeUrl);
        
        if (videoId) {
          videoUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=${isMuted ? '1' : '0'}&playsinline=1`;
        }
      } 
      // Handle RedGifs with safe parsing
      else if (safeUrl.indexOf('redgifs.com') >= 0) {
        let id = null;
        
        // Extract ID without regex
        if (safeUrl.indexOf('/watch/') >= 0) {
          const parts = safeUrl.split('/watch/');
          if (parts.length > 1) {
            id = parts[1].split(/[?&#]/)[0];
          }
        } else {
          // Fallback to last path segment
          const segments = safeUrl.split('/').filter(s => s.length > 0);
          if (segments.length > 0) {
            id = segments[segments.length - 1].split(/[?&#]/)[0];
          }
        }
        
        if (id) {
          videoUrl = `https://www.redgifs.com/ifr/${id}?autoplay=1&muted=${isMuted ? '1' : '0'}&controls=1`;
        }
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
      
      // Fallback to simple iframe
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
      video.preload = 'auto';
      video.src = videoUrl;
      
      // Add error handling for video
      video.addEventListener('error', () => {
          console.error("Video failed to load:", videoUrl);
          const errorMsg = document.createElement('div');
          errorMsg.className = 'media-error-message';
          errorMsg.textContent = 'Video failed to load. Click to open on Reddit.';
          container.appendChild(errorMsg);
      });
      
      // Add audio element if needed
      let audio = null;
      if (audioUrl) {
          audio = document.createElement('audio');
          audio.src = audioUrl;
          audio.autoplay = false;
          audio.controls = false;
          audio.muted = isMuted;
          audio.preload = 'auto';
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
                  
                  // For iPhone, show tap message
                  if (/iPhone/.test(navigator.userAgent)) {
                      const tapMsg = document.createElement('div');
                      tapMsg.textContent = 'Tap to play video';
                      tapMsg.style.position = 'absolute';
                      tapMsg.style.bottom = '10px';
                      tapMsg.style.width = '100%';
                      tapMsg.style.textAlign = 'center';
                      tapMsg.style.color = 'white';
                      tapMsg.style.background = 'rgba(0,0,0,0.5)';
                      tapMsg.style.padding = '5px';
                      container.appendChild(tapMsg);
                  }
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
          
          // Critical for iOS: sync on timeupdate
          video.addEventListener('timeupdate', () => {
              // Only sync if difference is significant
              if (Math.abs(video.currentTime - audio.currentTime) > 0.3) {
                  audio.currentTime = video.currentTime;
              }
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
          
          // Set up navigation buttons with better touch handling
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
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;
              font-size: 28px;
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
          
          /* iPhone-specific adjustments */
          @media only screen and (device-width: 375px), 
                 only screen and (device-width: 390px),
                 only screen and (device-width: 414px),
                 only screen and (device-width: 428px) {
              .video-grid {
                  grid-template-columns: repeat(2, 1fr) !important;
              }
              
              .thumbnail-container {
                  height: 120px !important;
              }
              
              .title {
                  font-size: 13px !important;
              }
              
              .manual-play-button {
                  width: 60px;
                  height: 60px;
              }
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
              if (e.target === lightbox) {
                  e.preventDefault();
              }
          }, { passive: false });
      }
      
      // Fix default browser behavior
      document.body.addEventListener('touchstart', function() {}, { passive: true });
      
      // Set a class to detect iPhone specifically
      if (/iPhone/.test(navigator.userAgent)) {
          document.body.classList.add('iphone-view');
      }
      
      console.log("iOS compatibility fixes loaded for", /iPhone/.test(navigator.userAgent) ? "iPhone" : "iPad");
  }
  
  // Initialize fixes when the page loads
  document.addEventListener('DOMContentLoaded', initIOSFixes);
  
  // Export patched functions to replace the originals
  export {
      createVideoIframe,
      createRedditVideo,
      setupLightboxEventListeners
  };