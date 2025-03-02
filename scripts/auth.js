/**
 * auth.js - Reddit OAuth authentication and user management
 */

// Configuration
const CLIENT_ID = 'YOUR_CLIENT_ID'; // Replace with actual Reddit API client ID when registering the app
const REDIRECT_URI = `${window.location.origin}/auth-callback.html`;
const SCOPES = ['identity', 'read', 'subscribe', 'save', 'history'];
const AUTH_DURATION = 'permanent';
const TOKEN_KEY = 'reddit_auth_token';
const REFRESH_TOKEN_KEY = 'reddit_refresh_token';
const TOKEN_EXPIRY_KEY = 'reddit_token_expiry';
const USER_DATA_KEY = 'reddit_user_data';

/**
 * Check if user is currently authenticated
 * 
 * @returns {boolean} Authentication status
 */
function isAuthenticated() {
    const token = localStorage.getItem(TOKEN_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    
    if (!token || !expiry) {
        return false;
    }
    
    // Check if token is expired
    const expiryDate = new Date(parseInt(expiry, 10));
    const now = new Date();
    
    if (now > expiryDate) {
        // Token expired, try to refresh it
        refreshAccessToken();
        return false;
    }
    
    return true;
}

/**
 * Initiate Reddit OAuth authorization flow
 */
function initiateLogin() {
    // Generate random state for security
    const state = Math.random().toString(36).substring(2, 15);
    localStorage.setItem('reddit_auth_state', state);
    
    // Build authorization URL
    const authUrl = new URL('https://www.reddit.com/api/v1/authorize');
    authUrl.searchParams.append('client_id', CLIENT_ID);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.append('duration', AUTH_DURATION);
    authUrl.searchParams.append('scope', SCOPES.join(' '));
    
    // Redirect to Reddit for authorization
    window.location.href = authUrl.toString();
}

/**
 * Handle auth callback after Reddit OAuth
 * 
 * @param {URLSearchParams} urlParams - URL parameters from callback
 * @returns {Promise<boolean>} Success status
 */
async function handleAuthCallback(urlParams) {
    // Check for errors
    const error = urlParams.get('error');
    if (error) {
        throw new Error(`Authentication error: ${error}`);
    }
    
    // Verify state parameter to prevent CSRF
    const state = urlParams.get('state');
    const savedState = localStorage.getItem('reddit_auth_state');
    
    if (!state || state !== savedState) {
        throw new Error('State verification failed');
    }
    
    // Exchange authorization code for tokens
    const code = urlParams.get('code');
    if (!code) {
        throw new Error('No authorization code received');
    }
    
    try {
        // Exchange code for token
        const tokenResponse = await fetchAccessToken(code);
        
        // Save tokens
        localStorage.setItem(TOKEN_KEY, tokenResponse.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, tokenResponse.refresh_token);
        
        // Calculate expiry time (subtract 60 seconds for safety)
        const expiryTime = Date.now() + (tokenResponse.expires_in * 1000) - 60000;
        localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
        
        // Clean up state
        localStorage.removeItem('reddit_auth_state');
        
        // Fetch and store user data
        await fetchAndStoreUserData();
        
        return true;
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        return false;
    }
}

/**
 * Request new access token using refresh token
 * 
 * @returns {Promise<boolean>} Success status
 */
async function refreshAccessToken() {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    
    if (!refreshToken) {
        return false;
    }
    
    try {
        const response = await fetch('https://corsproxy.io/?https://www.reddit.com/api/v1/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${btoa(`${CLIENT_ID}:`)}`
            },
            body: new URLSearchParams({
                'grant_type': 'refresh_token',
                'refresh_token': refreshToken
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error ${response.status}`);
        }
        
        const data = await response.json();
        
        // Update stored token and expiry
        localStorage.setItem(TOKEN_KEY, data.access_token);
        const expiryTime = Date.now() + (data.expires_in * 1000) - 60000;
        localStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
        
        return true;
    } catch (error) {
        console.error('Error refreshing token:', error);
        return false;
    }
}

/**
 * Exchange authorization code for access token
 * 
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} Token response
 */
async function fetchAccessToken(code) {
    const response = await fetch('https://corsproxy.io/?https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${btoa(`${CLIENT_ID}:`)}`
        },
        body: new URLSearchParams({
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': REDIRECT_URI
        })
    });
    
    if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
    }
    
    return response.json();
}

/**
 * Fetch and store user data
 * 
 * @returns {Promise<Object>} User data
 */
async function fetchAndStoreUserData() {
    try {
        const userData = await fetchRedditApi('/api/v1/me');
        localStorage.setItem(USER_DATA_KEY, JSON.stringify(userData));
        return userData;
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw error;
    }
}

/**
 * Get current user data
 * 
 * @returns {Object|null} User data or null if not authenticated
 */
function getUserData() {
    if (!isAuthenticated()) {
        return null;
    }
    
    const userData = localStorage.getItem(USER_DATA_KEY);
    return userData ? JSON.parse(userData) : null;
}

/**
 * Fetch data from Reddit API with authentication
 * 
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} API response
 */
async function fetchRedditApi(endpoint, options = {}) {
    if (!isAuthenticated()) {
        throw new Error('User not authenticated');
    }
    
    // Get access token
    const token = localStorage.getItem(TOKEN_KEY);
    
    // Default options
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    };
    
    // Merge options
    const fetchOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };
    
    // Add CORS proxy to the URL if needed
    const baseUrl = 'https://oauth.reddit.com';
    let url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;
    
    // Use CORS proxy for cross-origin requests
    if (!url.includes('corsproxy.io')) {
        url = `https://corsproxy.io/?${encodeURIComponent(url)}`;
    }
    
    const response = await fetch(url, fetchOptions);
    
    if (!response.ok) {
        // Handle 401 Unauthorized by refreshing token and retrying
        if (response.status === 401) {
            const refreshed = await refreshAccessToken();
            if (refreshed) {
                // Update token in headers and retry
                fetchOptions.headers.Authorization = `Bearer ${localStorage.getItem(TOKEN_KEY)}`;
                const retryResponse = await fetch(url, fetchOptions);
                
                if (!retryResponse.ok) {
                    throw new Error(`API error: ${retryResponse.status}`);
                }
                
                return retryResponse.json();
            }
        }
        
        throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
}

/**
 * Get user's subscribed subreddits
 * 
 * @returns {Promise<Array>} List of subreddits
 */
async function getSubscribedSubreddits() {
    try {
        const response = await fetchRedditApi('/subreddits/mine/subscriber?limit=100');
        return response.data.children.map(child => ({
            name: child.data.display_name,
            subscribers: child.data.subscribers,
            description: child.data.public_description,
            iconUrl: child.data.icon_img || child.data.community_icon || null,
            nsfw: child.data.over18
        }));
    } catch (error) {
        console.error('Error fetching subscribed subreddits:', error);
        throw error;
    }
}

/**
 * Get user's saved posts
 * 
 * @returns {Promise<Array>} List of saved posts
 */
async function getSavedPosts() {
    try {
        const userData = getUserData();
        if (!userData) {
            throw new Error('User not authenticated');
        }
        
        const response = await fetchRedditApi(`/user/${userData.name}/saved?limit=100`);
        return response.data.children
            .filter(child => child.kind === 't3' && isVideoPost(child.data))
            .map(formatRedditPost);
    } catch (error) {
        console.error('Error fetching saved posts:', error);
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
 * Format Reddit post data for use in the app
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
        author: data.author,
        saved: true
    };
}

/**
 * Logout user
 */
function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(USER_DATA_KEY);
    
    // Dispatch logout event
    document.dispatchEvent(new Event('reddit-logout'));
}

/**
 * Save or unsave a post on Reddit
 * 
 * @param {string} fullname - Full name of post (t3_postid)
 * @param {boolean} save - Whether to save or unsave
 * @returns {Promise<boolean>} Success status
 */
async function savePost(fullname, save = true) {
    if (!isAuthenticated()) {
        throw new Error('User not authenticated');
    }
    
    try {
        const endpoint = save ? '/api/save' : '/api/unsave';
        await fetchRedditApi(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                id: fullname.startsWith('t3_') ? fullname : `t3_${fullname}`
            })
        });
        
        return true;
    } catch (error) {
        console.error(`Error ${save ? 'saving' : 'unsaving'} post:`, error);
        return false;
    }
}

/**
 * Initialize authentication listeners
 */
function initAuth() {
    // Check URL for auth callback
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('code') && urlParams.has('state')) {
        handleAuthCallback(urlParams).then(success => {
            if (success) {
                // Redirect to main page
                window.location.href = window.location.origin;
            }
        });
    }
    
    // Auto-refresh token when needed
    setInterval(() => {
        const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
        if (!expiry) return;
        
        const expiryDate = new Date(parseInt(expiry, 10));
        const now = new Date();
        const timeUntilExpiry = expiryDate.getTime() - now.getTime();
        
        // Refresh if token expires in less than 5 minutes
        if (timeUntilExpiry < 300000 && timeUntilExpiry > 0) {
            refreshAccessToken();
        }
    }, 60000); // Check every minute
}

export {
    isAuthenticated,
    initiateLogin,
    logout,
    getUserData,
    getSubscribedSubreddits,
    getSavedPosts,
    savePost,
    fetchRedditApi,
    initAuth
};