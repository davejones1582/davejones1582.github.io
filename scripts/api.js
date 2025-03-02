/**
 * api.js - Enhanced Reddit API client with advanced caching
 */

// Configuration
const BATCH_SIZE = 25;
const DEFAULT_SUBREDDITS = [
    'videos',
    'youtubehaiku',
    'deepintoyoutube',
    'TikTokCringe',
    'perfectlycutscreams',
    'contagiouslaughter'
];

// Cache control
const API_CACHE_TIME = 15 * 60 * 1000; // 15 minutes in milliseconds
const apiCache = new Map();

/**
 * Convert RedGifs URLs to embeddable format
 * 
 * @param {string} url - Original RedGifs URL
 * @param {boolean} muted - Whether the video should be muted
 * @returns {string} Embeddable URL
 */
function getRedgifsEmbedUrl(url, muted = true) {
    const id = url.split('/').pop();
    return `https://www.redgifs.com/ifr/${id}?autoplay=1&muted=${muted ? '1' : '0'}&controls=1`;
}

/**
 * Fetch with timeout and retry logic
 * 
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeout - Timeout in milliseconds
 * @param {number} retries - Number of retries
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithRetry(url, options = {}, timeout = 10000, retries = 2) {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        
        // If we have retries left and it's a timeout or network error, retry
        if (retries > 0 && (error.name === 'AbortError' || error.message.includes('Failed to fetch'))) {
            console.log(`Retrying fetch to ${url}, ${retries} attempts left`);
            // Exponential backoff
            await new Promise(r => setTimeout(r, 1000 * (3 - retries)));
            return fetchWithRetry(url, options, timeout, retries - 1);
        }
        
        throw error;
    }
}

/**
 * Check if cached result is still valid
 * 
 * @param {Object} cachedResult - Cached result with timestamp
 * @returns {boolean} - Whether cache is valid
 */
function isCacheValid(cachedResult) {
    if (!cachedResult) return false;
    return (Date.now() - cachedResult.timestamp) < API_CACHE_TIME;
}

/**
 * Fetch videos from Reddit with improved caching and error handling
 * 
 * @param {Array} activeSubreddits - List of active subreddits
 * @param {Object} settings - Current settings
 * @param {string} afterToken - Token for pagination
 * @param {function} onSuccess - Success callback
 * @param {function} onError - Error callback
 */
async function fetchRedditVideos(activeSubreddits, settings, afterToken, onSuccess, onError) {
    if (!activeSubreddits || activeSubreddits.length === 0) {
        onSuccess([], null, false);
        return;
    }

    try {
        // Create cache key from parameters
        const cacheKey = JSON.stringify({
            subs: activeSubreddits.sort().join('+'),
            sort: settings.sort,
            time: settings.time,
            after: afterToken
        });
        
        // Check cache first
        const cachedResult = apiCache.get(cacheKey);
        if (isCacheValid(cachedResult)) {
            console.log('Using cached Reddit results');
            onSuccess(cachedResult.videos, cachedResult.after, cachedResult.hasMore);
            return;
        }
        
        // Join subreddits with proper URL encoding for each
        const multiSub = activeSubreddits.map(sub => encodeURIComponent(sub)).join('+');
        const sort = settings.sort;
        
        // The CORS proxy passes additional parameters, so only encode the base URL
        const baseUrl = `https://www.reddit.com/r/${multiSub}/${sort}.json?limit=${BATCH_SIZE}&raw_json=1`;
        const timeParam = sort === 'top' ? `&t=${settings.time}` : '';
        
        // Construct URL with params outside encodeURIComponent for proxy to pass them through
        let url = `https://corsproxy.io/?${encodeURIComponent(baseUrl)}${afterToken ? `&after=${afterToken}` : ''}${timeParam}`;
        
        console.log("Fetching from URL:", url);

        const response = await fetchWithRetry(url);
        const data = await response.json();
        
        // Validate response structure
        if (!data || !data.data || !Array.isArray(data.data.children)) {
            throw new Error('Invalid response format from Reddit API');
        }
        
        // Update pagination state
        const newAfterToken = data.data.after;
        const hasMore = newAfterToken !== null;

        // Filter for videos and images
        const newVideos = data.data.children
            .filter(post => {
                if (!post || !post.data) return false;
                
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
                    // Extract video ID is now handled in showLightbox
                    videoUrl = data.url;
                } else if (data.secure_media && data.secure_media.oembed) {
                    // Extract iframe src if available
                    const html = data.secure_media.oembed.html;
                    const srcMatch = html?.match(/src="([^"]+)"/);
                    videoUrl = srcMatch ? srcMatch[1] : data.url;
                } else {
                    videoUrl = data.url;
                }
                
                // Get thumbnail - use higher res when available
                let thumbnailUrl;
                if (data.preview && data.preview.images && data.preview.images[0]) {
                    // Try to get the highest quality preview without being too large
                    const previews = data.preview.images[0].resolutions || [];
                    const mediumPreview = previews.find(p => p.width >= 640) || 
                                         previews[previews.length - 1];
                    
                    thumbnailUrl = mediumPreview ? 
                        mediumPreview.url.replace(/&amp;/g, '&') : 
                        data.preview.images[0].source.url.replace(/&amp;/g, '&');
                } else if (data.thumbnail && data.thumbnail !== 'self' && data.thumbnail !== 'default') {
                    thumbnailUrl = data.thumbnail;
                } else {
                    thumbnailUrl = 'https://www.redditstatic.com/mweb2x/img/camera.png'; // Fallback
                }
                
                // Improved Reddit video audio extraction
                let audioUrl = null;
                if (isRedditVideo && data.media.reddit_video.fallback_url) {
                    // Extract the base URL without resolution specification
                    const videoBaseUrl = data.media.reddit_video.fallback_url.split('DASH_')[0];
                    audioUrl = `${videoBaseUrl}DASH_audio.mp4`;
                }
                
                return {
                    id: data.id,
                    title: data.title,
                    subreddit: data.subreddit,
                    url: videoUrl,
                    thumbnail: thumbnailUrl,
                    upvotes: data.ups,
                    comments: data.num_comments,
                    created: new Date(data.created_utc * 1000).toLocaleDateString(),
                    isVideo: true, // All are treated as "video" for the purpose of the lightbox
                    isReddit: isRedditVideo,
                    fallbackUrl: isRedditVideo ? data.media.reddit_video.fallback_url : null,
                    audioUrl: audioUrl,
                    permalink: data.permalink,
                    author: data.author
                };
            });

        // Store results in cache
        apiCache.set(cacheKey, {
            videos: newVideos,
            after: newAfterToken,
            hasMore,
            timestamp: Date.now()
        });
        
        // Limit cache size
        if (apiCache.size > 50) {
            // Delete oldest entries
            const keys = [...apiCache.keys()];
            keys.slice(0, 10).forEach(key => apiCache.delete(key));
        }

        onSuccess(newVideos, newAfterToken, hasMore);
    } catch (error) {
        console.error('Error fetching content:', error);
        onError(error);
    }
}

/**
 * Fetch information about a subreddit with improved error handling
 * 
 * @param {string} subreddit - Subreddit name
 * @returns {Promise<Object>} - Subreddit information
 */
async function fetchSubredditInfo(subreddit) {
    // Check cache first
    const cacheKey = `subreddit_info_${subreddit.toLowerCase()}`;
    const cachedInfo = apiCache.get(cacheKey);
    
    if (isCacheValid(cachedInfo)) {
        return cachedInfo.data;
    }
    
    try {
        const url = `https://corsproxy.io/?${encodeURIComponent(
            `https://www.reddit.com/r/${subreddit}/about.json`
        )}`;
        
        const response = await fetchWithRetry(url);
        
        // Handle specific error cases
        if (response.status === 404) {
            console.warn(`Subreddit not found: ${subreddit}`);
            return { 
                name: subreddit, 
                subscribers: 0,
                exists: false,
                errorCode: 404,
                errorMessage: 'Subreddit not found'
            };
        }
        
        if (response.status === 403) {
            console.warn(`Subreddit restricted or private: ${subreddit}`);
            return { 
                name: subreddit, 
                subscribers: 0,
                exists: true,
                errorCode: 403,
                errorMessage: 'Subreddit is private or restricted'
            };
        }
        
        if (!response.ok) {
            throw new Error(`Failed to fetch subreddit info: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data || !data.data) {
            throw new Error('Invalid response format');
        }
        
        const subredditInfo = { 
            name: subreddit, 
            subscribers: data.data.subscribers || 0,
            exists: true,
            title: data.data.title || '',
            description: data.data.public_description || '',
            nsfw: data.data.over18 || false,
            iconUrl: data.data.icon_img || data.data.community_icon || null
        };
        
        // Cache the result
        apiCache.set(cacheKey, {
            data: subredditInfo,
            timestamp: Date.now()
        });
        
        return subredditInfo;
    } catch (error) {
        console.error(`Error fetching subreddit info for ${subreddit}:`, error);
        
        // Provide informative return value even on error
        return { 
            name: subreddit, 
            subscribers: 0,
            exists: null, // Unknown state
            errorMessage: error.message
        };
    }
}

/**
 * Handle subreddit validation with user feedback
 * 
 * @param {string} subreddit - Subreddit name to validate
 * @param {function} onSuccess - Success callback
 * @param {function} onError - Error callback
 */
async function validateAndAddSubreddit(subreddit, onSuccess, onError) {
    if (!subreddit || typeof subreddit !== 'string') {
        onError('Please enter a valid subreddit name');
        return;
    }
    
    // Clean the input
    const cleanSubreddit = subreddit.trim().replace(/^r\//, '');
    
    if (!cleanSubreddit) {
        onError('Please enter a valid subreddit name');
        return;
    }
    
    try {
        // Show loading indicator
        const showLoading = window.showLoading || (() => {});
        const hideLoading = window.hideLoading || (() => {});
        
        showLoading();
        
        const info = await fetchSubredditInfo(cleanSubreddit);
        
        if (!info.exists) {
            onError(`Subreddit r/${cleanSubreddit} not found`);
            return;
        }
        
        if (info.errorCode === 403) {
            onError(`Subreddit r/${cleanSubreddit} is private or restricted`);
            return;
        }
        
        if (info.nsfw) {
            // For NSFW subreddits, we should notify the user
            const confirmAdd = confirm(`r/${cleanSubreddit} is an 18+ subreddit. Do you want to add it?`);
            if (!confirmAdd) {
                onError('NSFW subreddit not added');
                return;
            }
        }
        
        // All checks passed
        onSuccess(info);
    } catch (error) {
        onError(`Error validating subreddit: ${error.message}`);
    } finally {
        hideLoading();
    }
}

/**
 * Clear API cache
 */
function clearApiCache() {
    apiCache.clear();
    console.log('API cache cleared');
}

export { 
    DEFAULT_SUBREDDITS, 
    fetchRedditVideos,
    fetchSubredditInfo,
    getRedgifsEmbedUrl,
    validateAndAddSubreddit,
    clearApiCache
};