/**
 * storage.js - Local storage utilities
 */

/**
 * Save data to localStorage
 * 
 * @param {string} key - Storage key
 * @param {*} data - Data to store
 * @returns {boolean} - Success status
 */
function saveToStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error(`Error saving to storage (${key}):`, error);
        return false;
    }
}

/**
 * Load data from localStorage
 * 
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found
 * @returns {*} - Retrieved data or default value
 */
function loadFromStorage(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (error) {
        console.error(`Error loading from storage (${key}):`, error);
        return defaultValue;
    }
}

/**
 * Save application settings
 * 
 * @param {Object} settings - Application settings
 * @returns {boolean} - Success status
 */
function saveSettings(settings) {
    return saveToStorage('appSettings', settings);
}

/**
 * Load application settings
 * 
 * @param {Object} defaultSettings - Default settings
 * @returns {Object} - Application settings
 */
function loadSettings(defaultSettings) {
    const settings = loadFromStorage('appSettings', defaultSettings);
    
    // Migrate old format (array of strings) to new format
    if (settings.subreddits && settings.subreddits.length > 0 && typeof settings.subreddits[0] === 'string') {
        settings.subreddits = settings.subreddits.map(name => ({
            name,
            subscribers: 0
        }));
    }
    
    return settings;
}

/**
 * Save favorite videos
 * 
 * @param {Array} favorites - Favorite videos
 * @returns {boolean} - Success status
 */
function saveFavorites(favorites) {
    return saveToStorage('favoriteVideos', favorites);
}

/**
 * Load favorite videos
 * 
 * @returns {Array} - Favorite videos
 */
function loadFavorites() {
    return loadFromStorage('favoriteVideos', []);
}

/**
 * Save theme preference
 * 
 * @param {string} theme - Theme name ('dark' or 'light')
 * @returns {boolean} - Success status
 */
function saveTheme(theme) {
    return saveToStorage('theme', theme);
}

/**
 * Load theme preference
 * 
 * @param {string} defaultTheme - Default theme
 * @returns {string} - Theme name
 */
function loadTheme(defaultTheme = 'dark') {
    return loadFromStorage('theme', defaultTheme);
}

export {
    saveSettings,
    loadSettings,
    saveFavorites,
    loadFavorites,
    saveTheme,
    loadTheme
};