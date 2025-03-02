/**
 * discovery.js - Content discovery features with trending and recommendations
 */
import { fetchRedditApi, isAuthenticated } from './auth.js';
import { getWatchHistory } from './content-manager.js';

// In-memory cache for recommendations and trending content
const recommendationsCache = new Map();
const trendingCache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// Top subreddits by category
const CATEGORY_SUBREDDITS = {
    gaming: [
        'gaming', 'GamePhysics', 'gamingclips', 'GamersBeingBros',
        'PS5', 'XboxSeriesX', 'NintendoSwitch', 'pcgaming',
        'leagueoflegends', 'Minecraft', 'FortNiteBR', 'apexlegends'
    ],
    entertainment: [
        'videos', 'movies', 'television', 'movieclips',
        'youtubehaiku', 'TikTokCringe', 'StandUpComedy', 'trailers',
        'Music', 'listentothis', 'hiphopheads', 'livemusic'
    ],
    educational: [
        'science', 'space', 'natureisfuckinglit', 'educationalgifs',
        'DIY', 'ArtisanVideos', 'howto', 'explainlikeimfive',
        'HistoryPorn', 'Documentaries', 'lectures', 'askscience'
    ],
    sports: [
        'sports', 'soccer', 'nba', 'nfl',
        'formula1', 'hockey', 'baseball', 'MMA',
        'tennis', 'golf', 'HighlightGIFS', 'athleticfeats'
    ],
    animals: [
        'aww', 'AnimalsBeingDerps', 'AnimalsBeingBros', 'NatureIsFuckingLit',
        'rarepuppers', 'cats', 'dogs', 'zoomies'
    ]
};

/**
 * Fetch trending videos by upvotes and recent activity
 * 
 * @param {string} category - Content category (optional)
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array>} Trending videos
 */
async function getTrendingVideos(category = null, limit = 20) {
    // Check cache first
    const cacheKey = `trending_${category || 'all'}_${limit}`;
    const cachedResult = trendingCache.get(cacheKey);
    
    if (cachedResult && (Date.now() - cachedResult.timestamp < CACHE_DURATION)) {
        return cachedResult.data;
    }
    
    try {
        let subreddits;
        
        // Select subreddits based on category
        if (category && CATEGORY_SUBREDDITS[category]) {
            subreddits = CATEGORY_SUBREDDITS[category].join('+');
        } else {
            // Mix of popular video subreddits
            subreddits = [
                'videos', 'youtubehaiku', 'TikTokCringe', 'Documentaries',
                'gaming', 'nba', 'soccer', 'MovieClips', 'music'
            ].join('+');
        }
        
        // Fetch top posts from selected subreddits
        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(
            `https://www.reddit.com/r/${subreddits}/top.json?t=day&limit=${limit * 2}`
        )}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Filter for videos and format the response
        const videos = data.data.children
            .filter(post => isVideoPost(post.data))
            .slice(0, limit)
            .map(formatRedditPost);
        
        // Cache the result
        trendingCache.set(cacheKey, {
            data: videos,
            timestamp: Date.now()
        });
        
        return videos;
    } catch (error) {
        console.error('Error fetching trending videos:', error);
        
        // Return cached data even if stale in case of error
        if (cachedResult) {
            return cachedResult.data;
        }
        
        throw error;
    }
}

/**
 * Check if a post contains video content
 * 
 * @param {Object} post - Reddit post data
 * @returns {boolean} - Is video post
 */
function isVideoPost(post) {
    return post.is_video || 
           (post.domain && (
               post.domain.includes('youtube.com') || 
               post.domain.includes('youtu.be') ||
               post.domain.includes('redgifs.com') ||
               post.domain.includes('gfycat.com')
           )) ||
           (post.secure_media && post.secure_media.oembed) ||
           (post.url && (
               post.url.endsWith('.gif') ||
               post.url.endsWith('.gifv') ||
               post.url.endsWith('.mp4')
           ));
}

/**
 * Format Reddit post data for the app
 * 
 * @param {Object} post - Reddit post data
 * @returns {Object} - Formatted post data
 */
function formatRedditPost(post) {
    const data = post.data;
    const isRedditVideo = data.is_video && data.media && data.media.reddit_video;
    
    let thumbnailUrl;
    if (data.preview && data.preview.images && data.preview.images[0]) {
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
    
    // Extract audio URL for Reddit videos
    let audioUrl = null;
    if (isRedditVideo && data.media.reddit_video.fallback_url) {
        const videoBaseUrl = data.media.reddit_video.fallback_url.split('DASH_')[0];
        audioUrl = `${videoBaseUrl}DASH_audio.mp4`;
    }
    
    return {
        id: data.id,
        title: data.title,
        subreddit: data.subreddit,
        url: data.url,
        thumbnail: thumbnailUrl,
        upvotes: data.ups,
        comments: data.num_comments,
        created: new Date(data.created_utc * 1000).toLocaleDateString(),
        isVideo: true,
        isReddit: isRedditVideo,
        fallbackUrl: isRedditVideo ? data.media.reddit_video.fallback_url : null,
        audioUrl: audioUrl,
        permalink: data.permalink,
        author: data.author
    };
}

/**
 * Get subreddit categories
 * 
 * @returns {Array} Categories with subreddits
 */
function getCategories() {
    return Object.keys(CATEGORY_SUBREDDITS).map(key => ({
        id: key,
        name: key.charAt(0).toUpperCase() + key.slice(1),
        subreddits: CATEGORY_SUBREDDITS[key]
    }));
}

/**
 * Generate personalized recommendations based on watch history and favorites
 * 
 * @param {number} limit - Number of recommendations to return
 * @returns {Promise<Array>} Recommended videos
 */
async function getRecommendations(limit = 20) {
    const cacheKey = `recommendations_${limit}`;
    const cachedResult = recommendationsCache.get(cacheKey);
    
    if (cachedResult && (Date.now() - cachedResult.timestamp < CACHE_DURATION)) {
        return cachedResult.data;
    }
    
    try {
        // Get watch history
        const history = getWatchHistory();
        
        if (history.length === 0) {
            // No history, return trending instead
            return getTrendingVideos(null, limit);
        }
        
        // Extract subreddits from watch history
        const watchedSubreddits = history
            .map(item => item.subreddit)
            .filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
            .slice(0, 5); // Take top 5 subreddits
        
        const subreddits = watchedSubreddits.join('+');
        
        // Fetch hot posts from these subreddits
        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(
            `https://www.reddit.com/r/${subreddits}/hot.json?limit=${limit * 2}`
        )}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Filter posts that are already in watch history
        const watchedIds = new Set(history.map(item => item.id));
        
        // Filter for videos and exclude watched items
        const recommendations = data.data.children
            .filter(post => isVideoPost(post.data) && !watchedIds.has(post.data.id))
            .slice(0, limit)
            .map(formatRedditPost);
        
        // If we don't have enough recommendations, fetch some trending videos too
        if (recommendations.length < limit) {
            const trending = await getTrendingVideos(null, limit - recommendations.length);
            const trendingIds = new Set(trending.map(item => item.id));
            
            // Add trending videos that aren't already in recommendations
            for (const video of trending) {
                if (!watchedIds.has(video.id) && recommendations.findIndex(v => v.id === video.id) === -1) {
                    recommendations.push(video);
                    
                    if (recommendations.length >= limit) {
                        break;
                    }
                }
            }
        }
        
        // Cache the result
        recommendationsCache.set(cacheKey, {
            data: recommendations,
            timestamp: Date.now()
        });
        
        return recommendations;
    } catch (error) {
        console.error('Error generating recommendations:', error);
        
        // Return cached data even if stale in case of error
        if (cachedResult) {
            return cachedResult.data;
        }
        
        // Fall back to trending
        return getTrendingVideos(null, limit);
    }
}

/**
 * Get related videos based on current video
 * 
 * @param {Object} video - Current video
 * @param {number} limit - Number of related videos to return
 * @returns {Promise<Array>} Related videos
 */
async function getRelatedVideos(video, limit = 10) {
    try {
        // First try to get videos from the same subreddit
        const subreddit = video.subreddit;
        
        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(
            `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit * 2}`
        )}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Filter for videos and exclude the current video
        const related = data.data.children
            .filter(post => isVideoPost(post.data) && post.data.id !== video.id)
            .slice(0, limit)
            .map(formatRedditPost);
        
        return related;
    } catch (error) {
        console.error('Error fetching related videos:', error);
        
        // Fall back to trending in same category
        return getTrendingVideos(null, limit);
    }
}

/**
 * Search for videos across Reddit
 * 
 * @param {string} query - Search query
 * @param {string} sortBy - Sort method (relevance, hot, new, top)
 * @param {string} timeFilter - Time filter for top sort (hour, day, week, month, year, all)
 * @param {number} limit - Number of results
 * @returns {Promise<Array>} Search results
 */
async function searchVideos(query, sortBy = 'relevance', timeFilter = 'all', limit = 25) {
    try {
        let url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=${sortBy}&limit=${limit * 2}`;
        
        if (sortBy === 'top') {
            url += `&t=${timeFilter}`;
        }
        
        const response = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Filter for videos
        const results = data.data.children
            .filter(post => isVideoPost(post.data))
            .slice(0, limit)
            .map(formatRedditPost);
        
        return results;
    } catch (error) {
        console.error('Error searching videos:', error);
        throw error;
    }
}

export {
    getTrendingVideos,
    getCategories,
    getRecommendations,
    getRelatedVideos,
    searchVideos
};