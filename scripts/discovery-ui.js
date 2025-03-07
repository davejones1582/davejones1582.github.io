/**
 * discovery-ui.js - UI components for content discovery features
 */
import { 
    getTrendingVideos, 
    getCategories,
    getRecommendations,
    getRelatedVideos
} from './discovery.js';
import { addToWatchHistory } from './content-manager.js';
import { formatCount } from './ui.js';

/**
 * Render videos in a carousel
 * 
 * @param {HTMLElement} container - Carousel container
 * @param {Array} videos - Videos to display
 * @param {Function} onVideoSelect - Callback when a video is selected
 */
function renderCarousel(container, videos, onVideoSelect) {
    // Clear container
    container.innerHTML = '';
    
    // Create carousel cards
    videos.forEach(video => {
        const card = createCarouselCard(video);
        container.appendChild(card);
        
        // Add click handler
        card.addEventListener('click', () => {
            if (onVideoSelect) {
                // Add to watch history when selected
                addToWatchHistory(video);
                onVideoSelect(video);
            }
        });
    });
}

/**
 * Create a carousel card for a video
 * 
 * @param {Object} video - Video data
 * @returns {HTMLElement} - Carousel card element
 */
function createCarouselCard(video) {
    const card = document.createElement('div');
    card.className = 'carousel-card';
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', video.title);
    card.tabIndex = 0;
    
    const formattedUpvotes = formatCount(video.upvotes);
    
    card.innerHTML = `
        <div class="carousel-thumbnail">
            <img src="${video.thumbnail}" alt="" loading="lazy" decoding="async">
            <div class="play-icon"></div>
        </div>
        <div class="carousel-info">
            <div class="carousel-title">${video.title}</div>
            <div class="carousel-meta">
                <span>r/${video.subreddit}</span>
                <span>↑ ${formattedUpvotes}</span>
            </div>
        </div>
    `;
    
    // Add keyboard support
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            card.click();
        }
    });
    
    return card;
}

/**
 * Load and display related videos in the lightbox
 * 
 * @param {Object} currentVideo - Current video
 * @param {Function} onVideoSelect - Callback when a related video is selected
 */
async function loadRelatedVideos(currentVideo, onVideoSelect) {
    try {
        const relatedContainer = document.querySelector('.related-videos-container');
        
        if (!relatedContainer) return;
        
        // Show loading state
        relatedContainer.innerHTML = `
            <div class="video-loading-spinner"></div>
            <div style="margin-top: 12px; text-align: center;">Loading related videos...</div>
        `;
        
        // Get related videos
        const relatedVideos = await getRelatedVideos(currentVideo, 6);
        
        if (relatedVideos.length === 0) {
            relatedContainer.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <p>No related videos found</p>
                </div>
            `;
            return;
        }
        
        // Render related videos
        relatedContainer.innerHTML = '';
        
        relatedVideos.forEach(video => {
            const item = document.createElement('div');
            item.className = 'related-video-item';
            
            item.innerHTML = `
                <div class="related-thumbnail">
                    <img src="${video.thumbnail}" alt="" loading="lazy">
                    <div class="play-icon"></div>
                </div>
                <div class="related-info">
                    <div class="related-title">${video.title}</div>
                    <div class="related-meta">r/${video.subreddit}</div>
                </div>
            `;
            
            relatedContainer.appendChild(item);
            
            // Add click handler
            item.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent lightbox from closing
                
                if (onVideoSelect) {
                    // Add to watch history
                    addToWatchHistory(video);
                    onVideoSelect(video);
                }
            });
        });
    } catch (error) {
        console.error('Error loading related videos:', error);
        
        const relatedContainer = document.querySelector('.related-videos-container');
        if (relatedContainer) {
            relatedContainer.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <p>Failed to load related videos</p>
                </div>
            `;
        }
    }
}

/**
 * Create styles for related videos in the lightbox
 */
function addRelatedVideosStyles() {
    // Create style element if it doesn't exist
    let styleEl = document.getElementById('related-videos-styles');
    
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'related-videos-styles';
        
        // Add CSS for related videos
        styleEl.textContent = `
            .lightbox-related {
                margin-top: 20px;
                color: white;
            }
            
            .lightbox-related h3 {
                margin: 0 0 12px 0;
                font-size: 16px;
                font-weight: 500;
            }
            
            .related-videos-container {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 12px;
                max-width: 800px;
            }
            
            .related-video-item {
                cursor: pointer;
                transition: transform 0.2s;
                border-radius: 8px;
                overflow: hidden;
            }
            
            .related-video-item:hover {
                transform: translateY(-2px);
            }
            
            .related-thumbnail {
                position: relative;
                width: 100%;
                padding-bottom: 56.25%;
                overflow: hidden;
            }
            
            .related-thumbnail img {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .related-thumbnail .play-icon {
                width: 30px;
                height: 30px;
            }
            
            .related-info {
                padding: 8px;
            }
            
            .related-title {
                font-size: 12px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-bottom: 4px;
            }
            
            .related-meta {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.7);
            }
            
            [data-theme="light"] .lightbox-related {
                color: var(--text-color);
            }
            
            [data-theme="light"] .related-meta {
                color: var(--text-secondary);
            }
            
            @media (max-width: 768px) {
                .related-videos-container {
                    grid-template-columns: repeat(2, 1fr);
                }
            }
            
            @media (max-width: 480px) {
                .related-videos-container {
                    grid-template-columns: 1fr;
                }
            }
        `;
        
        document.head.appendChild(styleEl);
    }
}

export {
    loadRelatedVideos,
    addRelatedVideosStyles
};