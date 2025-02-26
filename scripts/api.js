/**
 * api.js - Functions for fetching data from Reddit API
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

// Check if running locally (file:// protocol or localhost)
const isLocalMode = window.location.protocol === 'file:' || 
                    window.location.hostname === 'localhost' || 
                    window.location.hostname === '127.0.0.1';

/**
 * Convert RedGifs URLs to embeddable format
 * 
 * @param {string} url - Original RedGifs URL
 * @param {boolean} muted - Whether the video should be muted
 * @returns {string} Embeddable URL
 */
function getRedgifsEmbedUrl(url, muted = true) {
    try {
        let id = url.split('/').pop();
        // Clean up ID in case there are query parameters
        id = id.split('?')[0];
        return `https://www.redgifs.com/ifr/${id}?autoplay=1&muted=${muted ? '1' : '0'}&controls=1`;
    } catch (e) {
        console.error("Error processing RedGifs URL:", e);
        return url;
    }
}

/**
 * Build the Reddit API URL with appropriate parameters
 * 
 * @param {string} multiSub - Concatenated subreddit names
 * @param {string} sort - Sort type (hot, new, top)
 * @param {string} time - Time period for top posts
 * @param {string} afterToken - Pagination token
 * @returns {string} Reddit API URL
 */
function buildRedditApiUrl(multiSub, sort, time, afterToken) {
    // For top and controversial sorts, we need a time parameter
    let timeParam = '';
    if (sort === 'top' || sort === 'controversial') {
        timeParam = `&t=${time || 'week'}`;
    }
    
    // Build the URL with proper parameters
    let redditApiUrl = `https://www.reddit.com/r/${multiSub}/${sort}.json?limit=${BATCH_SIZE}&raw_json=1${timeParam}`;
    
    // Add after token if present
    if (afterToken) {
        redditApiUrl += `&after=${afterToken}`;
    }
    
    return redditApiUrl;
}

/**
 * Get the complete URL (with proxy if needed)
 * 
 * @param {string} endpoint - Reddit API endpoint
 * @returns {string} Complete URL with proxy if needed
 */
function getProxiedUrl(endpoint) {
    // When running locally, use a CORS proxy
    if (isLocalMode) {
        // Options for CORS proxy (try different ones if needed)
        return `https://corsproxy.io/?${encodeURIComponent(endpoint)}`;
        // Alternative proxies:
        // return `https://api.allorigins.win/raw?url=${encodeURIComponent(endpoint)}`;
        // return `https://cors-anywhere.herokuapp.com/${endpoint}`;
    }
    
    // When deployed online, direct requests often work
    return endpoint;
}

/**
 * Extract video data from Reddit post
 * 
 * @param {Object} post - Reddit post data
 * @returns {Object} Processed video data
 */
function extractVideoData(post) {
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
        // Extract video ID is handled in showLightbox
        videoUrl = data.url;
    } else if (data.secure_media && data.secure_media.oembed) {
        // Extract iframe src if available
        const html = data.secure_media.oembed.html;
        const srcMatch = html?.match(/src="([^"]+)"/);
        videoUrl = srcMatch ? srcMatch[1] : data.url;
    } else {
        videoUrl = data.url;
    }
    
    // Get thumbnail - ensure proper URL formatting
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
        // Get base URL for audio
        const videoUrlBase = data.media.reddit_video.fallback_url.split('DASH_')[0];
        audioUrl = `${videoUrlBase}DASH_audio.mp4`;
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
}

/**
 * Fetch videos from Reddit
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
        // Debug logging
        console.log(`Fetching videos for subreddits: ${activeSubreddits.join(', ')}`);
        console.log(`Sort: ${settings.sort}, Time: ${settings.time}`);
        
        // Build the multi-reddit string properly
        const multiSub = activeSubreddits.join('+');
        const sort = settings.sort || 'hot'; // Default to hot if undefined
        const time = settings.time || 'week'; // Default to week if undefined
        
        // Build the full API URL
        const redditApiUrl = buildRedditApiUrl(multiSub, sort, time, afterToken);
        console.log(`API URL: ${redditApiUrl}`);
        
        // Get proxied URL if needed
        const url = getProxiedUrl(redditApiUrl);
        console.log(`Final URL: ${url}`);

        // Fetch data with proper error handling
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
        }

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
            .map(extractVideoData);

        onSuccess(newVideos, newAfterToken, hasMore);
    } catch (error) {
        console.error('Error fetching content:', error);
        onError(error);
    }
}

/**
 * Fetch information about a subreddit
 * 
 * @param {string} subreddit - Subreddit name
 * @returns {Promise<Object>} - Subreddit information
 */
async function fetchSubredditInfo(subreddit) {
    try {
        const endpoint = `https://www.reddit.com/r/${subreddit}/about.json`;
        const url = getProxiedUrl(endpoint);
        
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch subreddit info: ${response.status}`);
        }
        
        const data = await response.json();
        return { 
            name: subreddit, 
            subscribers: data.data?.subscribers || 0 
        };
    } catch (error) {
        console.error(`Error fetching subreddit info for ${subreddit}:`, error);
        return { name: subreddit, subscribers: 0 };
    }
}

export { 
    DEFAULT_SUBREDDITS, 
    fetchRedditVideos,
    fetchSubredditInfo,
    getRedgifsEmbedUrl,
    isLocalMode
};