/**
 * content-manager.js - Advanced content management with collections and watch history
 */
import { showToast } from './ui.js';
import { savePost } from './auth.js';

// LocalStorage keys
const COLLECTIONS_KEY = 'video_collections';
const WATCH_HISTORY_KEY = 'watch_history';
const WATCH_LATER_KEY = 'watch_later';
const HISTORY_LIMIT = 100; // Maximum items in watch history

/**
 * Collection object structure
 * @typedef {Object} Collection
 * @property {string} id - Unique identifier
 * @property {string} name - Collection name
 * @property {string} description - Collection description
 * @property {string} icon - Emoji icon
 * @property {Array<string>} videoIds - Array of video IDs
 * @property {number} created - Creation timestamp
 * @property {number} updated - Last update timestamp
 */

/**
 * Initialize collections if they don't exist
 */
function initializeCollections() {
    if (!localStorage.getItem(COLLECTIONS_KEY)) {
        const defaultCollections = [
            {
                id: 'favorites',
                name: 'Favorites',
                description: 'Your favorite videos',
                icon: '⭐',
                videoIds: [],
                created: Date.now(),
                updated: Date.now()
            },
            {
                id: 'watchLater',
                name: 'Watch Later',
                description: 'Videos to watch later',
                icon: '⏱️',
                videoIds: [],
                created: Date.now(),
                updated: Date.now()
            }
        ];
        
        localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(defaultCollections));
    }
    
    if (!localStorage.getItem(WATCH_HISTORY_KEY)) {
        localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify([]));
    }
}

/**
 * Get all collections
 * 
 * @returns {Array<Collection>} Collections
 */
function getCollections() {
    initializeCollections();
    return JSON.parse(localStorage.getItem(COLLECTIONS_KEY));
}

/**
 * Get a specific collection by ID
 * 
 * @param {string} collectionId - Collection ID
 * @returns {Collection|null} Collection or null if not found
 */
function getCollection(collectionId) {
    const collections = getCollections();
    return collections.find(c => c.id === collectionId) || null;
}

/**
 * Create a new collection
 * 
 * @param {string} name - Collection name
 * @param {string} description - Collection description
 * @param {string} icon - Emoji icon
 * @returns {Collection} New collection
 */
function createCollection(name, description = '', icon = '📁') {
    const collections = getCollections();
    
    // Generate unique ID
    const id = `collection_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    const newCollection = {
        id,
        name,
        description,
        icon,
        videoIds: [],
        created: Date.now(),
        updated: Date.now()
    };
    
    collections.push(newCollection);
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    
    showToast(`Collection "${name}" created`, 'success');
    return newCollection;
}

/**
 * Update a collection
 * 
 * @param {string} collectionId - Collection ID
 * @param {Object} updates - Properties to update
 * @returns {Collection|null} Updated collection or null if not found
 */
function updateCollection(collectionId, updates) {
    const collections = getCollections();
    const index = collections.findIndex(c => c.id === collectionId);
    
    if (index === -1) {
        return null;
    }
    
    // Apply updates
    collections[index] = {
        ...collections[index],
        ...updates,
        updated: Date.now()
    };
    
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    return collections[index];
}

/**
 * Delete a collection
 * 
 * @param {string} collectionId - Collection ID
 * @returns {boolean} Success
 */
function deleteCollection(collectionId) {
    // Don't allow deleting default collections
    if (collectionId === 'favorites' || collectionId === 'watchLater') {
        showToast('Cannot delete default collections', 'error');
        return false;
    }
    
    const collections = getCollections();
    const filteredCollections = collections.filter(c => c.id !== collectionId);
    
    if (filteredCollections.length === collections.length) {
        return false; // Collection not found
    }
    
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(filteredCollections));
    showToast('Collection deleted', 'success');
    return true;
}

/**
 * Add a video to a collection
 * 
 * @param {string} collectionId - Collection ID
 * @param {Object} video - Video object
 * @returns {boolean} Success
 */
async function addToCollection(collectionId, video) {
    const collections = getCollections();
    const index = collections.findIndex(c => c.id === collectionId);
    
    if (index === -1) {
        return false;
    }
    
    // Check if video already exists in collection
    if (collections[index].videoIds.includes(video.id)) {
        return true; // Already in collection
    }
    
    // Add to collection
    collections[index].videoIds.push(video.id);
    collections[index].updated = Date.now();
    
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    
    // If this is the favorites collection and user is authenticated, save on Reddit too
    if (collectionId === 'favorites') {
        try {
            await savePost(video.id, true);
        } catch (error) {
            console.warn('Failed to save post to Reddit:', error);
            // Continue anyway - we've saved it locally
        }
    }
    
    showToast(`Added to ${collections[index].name}`, 'success');
    return true;
}

/**
 * Remove a video from a collection
 * 
 * @param {string} collectionId - Collection ID
 * @param {string} videoId - Video ID
 * @returns {boolean} Success
 */
async function removeFromCollection(collectionId, videoId) {
    const collections = getCollections();
    const index = collections.findIndex(c => c.id === collectionId);
    
    if (index === -1) {
        return false;
    }
    
    // Filter out the video
    const originalLength = collections[index].videoIds.length;
    collections[index].videoIds = collections[index].videoIds.filter(id => id !== videoId);
    
    if (collections[index].videoIds.length === originalLength) {
        return false; // Video wasn't in collection
    }
    
    collections[index].updated = Date.now();
    localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(collections));
    
    // If this is the favorites collection and user is authenticated, unsave on Reddit too
    if (collectionId === 'favorites') {
        try {
            await savePost(videoId, false);
        } catch (error) {
            console.warn('Failed to unsave post from Reddit:', error);
            // Continue anyway - we've removed it locally
        }
    }
    
    showToast(`Removed from ${collections[index].name}`, 'success');
    return true;
}

/**
 * Check if a video is in a collection
 * 
 * @param {string} collectionId - Collection ID
 * @param {string} videoId - Video ID
 * @returns {boolean} Is in collection
 */
function isInCollection(collectionId, videoId) {
    const collection = getCollection(collectionId);
    return collection ? collection.videoIds.includes(videoId) : false;
}

/**
 * Get videos in a collection
 * 
 * @param {string} collectionId - Collection ID
 * @param {Array} allVideos - All videos for reference
 * @returns {Array} Videos in collection
 */
function getVideosInCollection(collectionId, allVideos) {
    const collection = getCollection(collectionId);
    
    if (!collection) {
        return [];
    }
    
    return collection.videoIds
        .map(id => allVideos.find(v => v.id === id))
        .filter(v => v); // Filter out undefined (videos no longer available)
}

/**
 * Add video to watch history
 * 
 * @param {Object} video - Video object
 */
function addToWatchHistory(video) {
    const history = JSON.parse(localStorage.getItem(WATCH_HISTORY_KEY) || '[]');
    
    // Remove if already exists to avoid duplicates
    const filteredHistory = history.filter(item => item.id !== video.id);
    
    // Add to front of array with timestamp
    const historyItem = {
        ...video,
        watchedAt: Date.now()
    };
    
    filteredHistory.unshift(historyItem);
    
    // Limit history size
    const limitedHistory = filteredHistory.slice(0, HISTORY_LIMIT);
    
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(limitedHistory));
}

/**
 * Get watch history
 * 
 * @returns {Array} Watch history
 */
function getWatchHistory() {
    return JSON.parse(localStorage.getItem(WATCH_HISTORY_KEY) || '[]');
}

/**
 * Clear watch history
 */
function clearWatchHistory() {
    localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify([]));
    showToast('Watch history cleared', 'success');
}

/**
 * Add to watch later list
 * 
 * @param {Object} video - Video object
 * @returns {boolean} Success
 */
function addToWatchLater(video) {
    return addToCollection('watchLater', video);
}

/**
 * Remove from watch later list
 * 
 * @param {string} videoId - Video ID
 * @returns {boolean} Success
 */
function removeFromWatchLater(videoId) {
    return removeFromCollection('watchLater', videoId);
}

/**
 * Check if video is in watch later list
 * 
 * @param {string} videoId - Video ID
 * @returns {boolean} Is in watch later
 */
function isInWatchLater(videoId) {
    return isInCollection('watchLater', videoId);
}

/**
 * Toggle favorite status
 * 
 * @param {Object} video - Video object
 * @returns {boolean} New status (true = favorited)
 */
async function toggleFavorite(video) {
    const isFavorited = isInCollection('favorites', video.id);
    
    if (isFavorited) {
        await removeFromCollection('favorites', video.id);
        return false;
    } else {
        await addToCollection('favorites', video);
        return true;
    }
}

export {
    initializeCollections,
    getCollections,
    getCollection,
    createCollection,
    updateCollection,
    deleteCollection,
    addToCollection,
    removeFromCollection,
    isInCollection,
    getVideosInCollection,
    addToWatchHistory,
    getWatchHistory,
    clearWatchHistory,
    addToWatchLater,
    removeFromWatchLater,
    isInWatchLater,
    toggleFavorite
};