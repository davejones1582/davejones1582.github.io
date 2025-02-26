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
        // Join subreddits with plus sign - proper encoding is applied later
        const multiSub = activeSubreddits.join('+');
        const sort = settings.sort;
        const timeParam = sort === 'top' ? `&t=${settings.time}` : '';

        // Build the Reddit API URL without double-encoding the parts
        const redditApiUrl = `https://www.reddit.com/r/${multiSub}/${sort}.json?limit=${BATCH_SIZE}&raw_json=1${afterToken ? `&after=${afterToken}` : ''}${timeParam}`;
        
        // Apply CORS proxy with proper URL encoding
        const url = `https://corsproxy.io/?${encodeURIComponent(redditApiUrl)}`;

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
        const redditApiUrl = `https://www.reddit.com/r/${subreddit}/about.json`;
        const url = `https://corsproxy.io/?${encodeURIComponent(redditApiUrl)}`;
        
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
    getRedgifsEmbedUrl
};