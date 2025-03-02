/**
 * profile-ui.js - User profile and collections UI components
 */
import { isAuthenticated, initiateLogin, logout, getUserData } from './auth.js';
import { 
    getCollections, 
    createCollection, 
    updateCollection, 
    deleteCollection,
    getVideosInCollection,
    getWatchHistory,
    clearWatchHistory
} from './content-manager.js';
import { showToast } from './ui.js';

/**
 * Create the user profile UI
 * 
 * @returns {HTMLElement} Profile UI element
 */
function createProfileUI() {
    const profileContainer = document.createElement('div');
    profileContainer.className = 'profile-section';
    
    updateProfileUI(profileContainer);
    
    // Listen for auth changes
    document.addEventListener('reddit-logout', () => {
        updateProfileUI(profileContainer);
    });
    
    return profileContainer;
}

/**
 * Update the profile UI
 * 
 * @param {HTMLElement} container - Container element
 */
function updateProfileUI(container) {
    if (isAuthenticated()) {
        const userData = getUserData();
        
        container.innerHTML = `
            <div class="profile-header">
                <div class="profile-info">
                    <img src="${userData.icon_img || 'https://www.redditstatic.com/avatars/defaults/v2/avatar_default_0.png'}" 
                         alt="Profile" class="profile-avatar">
                    <div class="profile-details">
                        <div class="profile-name">${userData.name}</div>
                        <div class="profile-karma">${formatCount(userData.total_karma)} karma</div>
                    </div>
                </div>
                <button id="logout-button" class="secondary-button">Logout</button>
            </div>
        `;
        
        // Add event listener for logout
        container.querySelector('#logout-button').addEventListener('click', () => {
            logout();
            showToast('Logged out successfully', 'info');
        });
    } else {
        container.innerHTML = `
            <div class="login-prompt">
                <p>Sign in with Reddit to sync your favorites and access your subscribed subreddits.</p>
                <button id="login-button" class="primary-button">Login with Reddit</button>
            </div>
        `;
        
        // Add event listener for login
        container.querySelector('#login-button').addEventListener('click', () => {
            initiateLogin();
        });
    }
}

/**
 * Format large numbers with K/M suffix
 * 
 * @param {number} count - Number to format
 * @returns {string} Formatted count
 */
function formatCount(count) {
    if (!count && count !== 0) return '';
    
    const num = parseInt(count, 10);
    if (isNaN(num)) return '';
    
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
}

/**
 * Create the collections UI component
 * 
 * @param {function} onSelectCollection - Callback when a collection is selected
 * @returns {HTMLElement} Collections UI element
 */
function createCollectionsUI(onSelectCollection) {
    const collectionsContainer = document.createElement('div');
    collectionsContainer.className = 'collections-section';
    
    updateCollectionsUI(collectionsContainer, onSelectCollection);
    
    return collectionsContainer;
}

/**
 * Update the collections UI
 * 
 * @param {HTMLElement} container - Container element
 * @param {function} onSelectCollection - Callback when a collection is selected
 */
function updateCollectionsUI(container, onSelectCollection) {
    const collections = getCollections();
    
    container.innerHTML = `
        <div class="section-header">
            <h2>Your Collections</h2>
            <button id="create-collection-button" class="icon-button" aria-label="Create new collection">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
            </button>
        </div>
        <div class="collections-list">
            ${collections.map(collection => `
                <div class="collection-item" data-id="${collection.id}">
                    <div class="collection-icon">${collection.icon}</div>
                    <div class="collection-info">
                        <div class="collection-name">${collection.name}</div>
                        <div class="collection-count">${collection.videoIds.length} videos</div>
                    </div>
                    ${collection.id !== 'favorites' && collection.id !== 'watchLater' ? 
                        `<button class="icon-button collection-menu-button" aria-label="Collection options">⋮</button>` : 
                        ''}
                </div>
            `).join('')}
        </div>
    `;
    
    // Add event listeners for collection items
    container.querySelectorAll('.collection-item').forEach(item => {
        item.addEventListener('click', () => {
            const collectionId = item.dataset.id;
            onSelectCollection(collectionId);
        });
    });
    
    // Add event listener for create collection button
    container.querySelector('#create-collection-button').addEventListener('click', () => {
        showCreateCollectionDialog(collection => {
            updateCollectionsUI(container, onSelectCollection);
        });
    });
    
    // Add event listeners for collection menu buttons
    container.querySelectorAll('.collection-menu-button').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent collection selection
            const collectionItem = button.closest('.collection-item');
            const collectionId = collectionItem.dataset.id;
            showCollectionMenuDialog(collectionId, () => {
                updateCollectionsUI(container, onSelectCollection);
            });
        });
    });
}

/**
 * Show dialog to create a new collection
 * 
 * @param {function} onComplete - Callback when collection is created
 */
function showCreateCollectionDialog(onComplete) {
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    overlay.innerHTML = `
        <div class="dialog">
            <div class="dialog-header">
                <h2>Create Collection</h2>
                <button class="close-dialog-button">×</button>
            </div>
            <div class="dialog-content">
                <form id="collection-form">
                    <div class="form-group">
                        <label for="collection-name">Name</label>
                        <input type="text" id="collection-name" placeholder="Collection name" required>
                    </div>
                    <div class="form-group">
                        <label for="collection-description">Description (optional)</label>
                        <input type="text" id="collection-description" placeholder="Collection description">
                    </div>
                    <div class="form-group">
                        <label for="collection-icon">Icon</label>
                        <select id="collection-icon">
                            <option value="📁">📁 Folder</option>
                            <option value="🎬">🎬 Movie</option>
                            <option value="🎮">🎮 Gaming</option>
                            <option value="🎵">🎵 Music</option>
                            <option value="📺">📺 TV</option>
                            <option value="🎯">🎯 Sports</option>
                            <option value="🔍">🔍 Learn</option>
                            <option value="😂">😂 Funny</option>
                            <option value="🐱">🐱 Animals</option>
                            <option value="💡">💡 Ideas</option>
                        </select>
                    </div>
                    <div class="dialog-buttons">
                        <button type="button" class="secondary-button cancel-button">Cancel</button>
                        <button type="submit" class="primary-button">Create</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Focus the name input
    overlay.querySelector('#collection-name').focus();
    
    // Add event listeners
    const closeDialog = () => {
        overlay.remove();
    };
    
    overlay.querySelector('.close-dialog-button').addEventListener('click', closeDialog);
    overlay.querySelector('.cancel-button').addEventListener('click', closeDialog);
    
    // Handle form submission
    overlay.querySelector('#collection-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = overlay.querySelector('#collection-name').value;
        const description = overlay.querySelector('#collection-description').value;
        const icon = overlay.querySelector('#collection-icon').value;
        
        createCollection(name, description, icon);
        closeDialog();
        
        if (onComplete) {
            onComplete();
        }
    });
}

/**
 * Show dialog with collection options (edit, delete)
 * 
 * @param {string} collectionId - Collection ID
 * @param {function} onComplete - Callback after action is taken
 */
function showCollectionMenuDialog(collectionId, onComplete) {
    const collection = getCollections().find(c => c.id === collectionId);
    
    if (!collection) {
        return;
    }
    
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    overlay.innerHTML = `
        <div class="dialog dialog-menu">
            <div class="dialog-header">
                <h2>${collection.name}</h2>
                <button class="close-dialog-button">×</button>
            </div>
            <div class="dialog-content">
                <div class="menu-options">
                    <button class="menu-option edit-collection">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        Edit Collection
                    </button>
                    <button class="menu-option delete-collection">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            <line x1="10" y1="11" x2="10" y2="17"></line>
                            <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                        Delete Collection
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listeners
    const closeDialog = () => {
        overlay.remove();
    };
    
    overlay.querySelector('.close-dialog-button').addEventListener('click', closeDialog);
    
    // Handle edit option
    overlay.querySelector('.edit-collection').addEventListener('click', () => {
        closeDialog();
        showEditCollectionDialog(collectionId, onComplete);
    });
    
    // Handle delete option
    overlay.querySelector('.delete-collection').addEventListener('click', () => {
        closeDialog();
        showDeleteConfirmationDialog(collectionId, onComplete);
    });
    
    // Close on click outside the dialog
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeDialog();
        }
    });
}

/**
 * Show dialog to edit a collection
 * 
 * @param {string} collectionId - Collection ID
 * @param {function} onComplete - Callback when done
 */
function showEditCollectionDialog(collectionId, onComplete) {
    const collection = getCollections().find(c => c.id === collectionId);
    
    if (!collection) {
        return;
    }
    
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    overlay.innerHTML = `
        <div class="dialog">
            <div class="dialog-header">
                <h2>Edit Collection</h2>
                <button class="close-dialog-button">×</button>
            </div>
            <div class="dialog-content">
                <form id="edit-collection-form">
                    <div class="form-group">
                        <label for="collection-name">Name</label>
                        <input type="text" id="collection-name" placeholder="Collection name" required value="${collection.name}">
                    </div>
                    <div class="form-group">
                        <label for="collection-description">Description (optional)</label>
                        <input type="text" id="collection-description" placeholder="Collection description" value="${collection.description || ''}">
                    </div>
                    <div class="form-group">
                        <label for="collection-icon">Icon</label>
                        <select id="collection-icon">
                            <option value="📁" ${collection.icon === '📁' ? 'selected' : ''}>📁 Folder</option>
                            <option value="🎬" ${collection.icon === '🎬' ? 'selected' : ''}>🎬 Movie</option>
                            <option value="🎮" ${collection.icon === '🎮' ? 'selected' : ''}>🎮 Gaming</option>
                            <option value="🎵" ${collection.icon === '🎵' ? 'selected' : ''}>🎵 Music</option>
                            <option value="📺" ${collection.icon === '📺' ? 'selected' : ''}>📺 TV</option>
                            <option value="🎯" ${collection.icon === '🎯' ? 'selected' : ''}>🎯 Sports</option>
                            <option value="🔍" ${collection.icon === '🔍' ? 'selected' : ''}>🔍 Learn</option>
                            <option value="😂" ${collection.icon === '😂' ? 'selected' : ''}>😂 Funny</option>
                            <option value="🐱" ${collection.icon === '🐱' ? 'selected' : ''}>🐱 Animals</option>
                            <option value="💡" ${collection.icon === '💡' ? 'selected' : ''}>💡 Ideas</option>
                        </select>
                    </div>
                    <div class="dialog-buttons">
                        <button type="button" class="secondary-button cancel-button">Cancel</button>
                        <button type="submit" class="primary-button">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Focus the name input
    overlay.querySelector('#collection-name').focus();
    
    // Add event listeners
    const closeDialog = () => {
        overlay.remove();
    };
    
    overlay.querySelector('.close-dialog-button').addEventListener('click', closeDialog);
    overlay.querySelector('.cancel-button').addEventListener('click', closeDialog);
    
    // Handle form submission
    overlay.querySelector('#edit-collection-form').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const name = overlay.querySelector('#collection-name').value;
        const description = overlay.querySelector('#collection-description').value;
        const icon = overlay.querySelector('#collection-icon').value;
        
        updateCollection(collectionId, { name, description, icon });
        closeDialog();
        
        showToast('Collection updated', 'success');
        
        if (onComplete) {
            onComplete();
        }
    });
}

/**
 * Show confirmation dialog for deleting a collection
 * 
 * @param {string} collectionId - Collection ID
 * @param {function} onComplete - Callback when done
 */
function showDeleteConfirmationDialog(collectionId, onComplete) {
    const collection = getCollections().find(c => c.id === collectionId);
    
    if (!collection) {
        return;
    }
    
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    overlay.innerHTML = `
        <div class="dialog">
            <div class="dialog-header">
                <h2>Delete Collection</h2>
                <button class="close-dialog-button">×</button>
            </div>
            <div class="dialog-content">
                <p>Are you sure you want to delete "${collection.name}"? This cannot be undone.</p>
                <div class="dialog-buttons">
                    <button type="button" class="secondary-button cancel-button">Cancel</button>
                    <button type="button" class="danger-button confirm-delete-button">Delete</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listeners
    const closeDialog = () => {
        overlay.remove();
    };
    
    overlay.querySelector('.close-dialog-button').addEventListener('click', closeDialog);
    overlay.querySelector('.cancel-button').addEventListener('click', closeDialog);
    
    // Handle delete confirmation
    overlay.querySelector('.confirm-delete-button').addEventListener('click', () => {
        deleteCollection(collectionId);
        closeDialog();
        
        if (onComplete) {
            onComplete();
        }
    });
}

/**
 * Create watch history UI
 * 
 * @param {function} onSelectVideo - Callback when a video is selected
 * @param {Array} allVideos - All videos for reference
 * @returns {HTMLElement} Watch history UI element
 */
function createWatchHistoryUI(onSelectVideo, allVideos) {
    const historyContainer = document.createElement('div');
    historyContainer.className = 'watch-history-section';
    
    updateWatchHistoryUI(historyContainer, onSelectVideo, allVideos);
    
    return historyContainer;
}

/**
 * Update watch history UI
 * 
 * @param {HTMLElement} container - Container element
 * @param {function} onSelectVideo - Callback when a video is selected
 * @param {Array} allVideos - All videos for reference
 */
function updateWatchHistoryUI(container, onSelectVideo, allVideos) {
    const history = getWatchHistory();
    
    container.innerHTML = `
        <div class="section-header">
            <h2>Watch History</h2>
            <button id="clear-history-button" class="icon-button" aria-label="Clear watch history">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                </svg>
            </button>
        </div>
        ${history.length === 0 ? `
            <div class="empty-state">
                <div class="empty-icon">📺</div>
                <p>No watch history yet</p>
                <p class="empty-subtext">Videos you watch will appear here</p>
            </div>
        ` : `
            <div class="history-list">
                ${history.slice(0, 10).map(video => `
                    <div class="history-item" data-id="${video.id}">
                        <div class="history-thumbnail">
                            <img src="${video.thumbnail}" alt="${video.title}" loading="lazy">
                        </div>
                        <div class="history-info">
                            <div class="history-title">${video.title}</div>
                            <div class="history-meta">
                                <span>r/${video.subreddit}</span>
                                <span>${formatTimeAgo(video.watchedAt)}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
                ${history.length > 10 ? `
                    <button class="view-all-button">View all (${history.length})</button>
                ` : ''}
            </div>
        `}
    `;
    
    // Add event listeners for history items
    container.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const videoId = item.dataset.id;
            const video = history.find(v => v.id === videoId);
            
            if (video && onSelectVideo) {
                onSelectVideo(video);
            }
        });
    });
    
    // Add event listener for clear history button
    const clearButton = container.querySelector('#clear-history-button');
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            showClearHistoryConfirmationDialog(() => {
                updateWatchHistoryUI(container, onSelectVideo, allVideos);
            });
        });
    }
    
    // Add event listener for view all button
    const viewAllButton = container.querySelector('.view-all-button');
    if (viewAllButton) {
        viewAllButton.addEventListener('click', () => {
            showFullHistoryDialog(history, onSelectVideo);
        });
    }
}

/**
 * Show confirmation dialog for clearing watch history
 * 
 * @param {function} onComplete - Callback when done
 */
function showClearHistoryConfirmationDialog(onComplete) {
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    overlay.innerHTML = `
        <div class="dialog">
            <div class="dialog-header">
                <h2>Clear Watch History</h2>
                <button class="close-dialog-button">×</button>
            </div>
            <div class="dialog-content">
                <p>Are you sure you want to clear your watch history? This cannot be undone.</p>
                <div class="dialog-buttons">
                    <button type="button" class="secondary-button cancel-button">Cancel</button>
                    <button type="button" class="danger-button confirm-clear-button">Clear</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listeners
    const closeDialog = () => {
        overlay.remove();
    };
    
    overlay.querySelector('.close-dialog-button').addEventListener('click', closeDialog);
    overlay.querySelector('.cancel-button').addEventListener('click', closeDialog);
    
    // Handle clear confirmation
    overlay.querySelector('.confirm-clear-button').addEventListener('click', () => {
        clearWatchHistory();
        closeDialog();
        
        if (onComplete) {
            onComplete();
        }
    });
}

/**
 * Show full watch history dialog
 * 
 * @param {Array} history - Watch history
 * @param {function} onSelectVideo - Callback when a video is selected
 */
function showFullHistoryDialog(history, onSelectVideo) {
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    
    overlay.innerHTML = `
        <div class="dialog full-dialog">
            <div class="dialog-header">
                <h2>Watch History</h2>
                <button class="close-dialog-button">×</button>
            </div>
            <div class="dialog-content">
                <div class="full-history-list">
                    ${history.map(video => `
                        <div class="history-item" data-id="${video.id}">
                            <div class="history-thumbnail">
                                <img src="${video.thumbnail}" alt="${video.title}" loading="lazy">
                            </div>
                            <div class="history-info">
                                <div class="history-title">${video.title}</div>
                                <div class="history-meta">
                                    <span>r/${video.subreddit}</span>
                                    <span>${formatTimeAgo(video.watchedAt)}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(overlay);
    
    // Add event listeners
    const closeDialog = () => {
        overlay.remove();
    };
    
    overlay.querySelector('.close-dialog-button').addEventListener('click', closeDialog);
    
    // Add event listeners for history items
    overlay.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const videoId = item.dataset.id;
            const video = history.find(v => v.id === videoId);
            
            if (video && onSelectVideo) {
                onSelectVideo(video);
                closeDialog();
            }
        });
    });
}

/**
 * Format timestamp as relative time
 * 
 * @param {number} timestamp - Timestamp in milliseconds
 * @returns {string} Relative time
 */
function formatTimeAgo(timestamp) {
    const now = Date.now();
    const secondsAgo = Math.floor((now - timestamp) / 1000);
    
    if (secondsAgo < 60) {
        return 'just now';
    }
    
    const minutesAgo = Math.floor(secondsAgo / 60);
    if (minutesAgo < 60) {
        return `${minutesAgo}m ago`;
    }
    
    const hoursAgo = Math.floor(minutesAgo / 60);
    if (hoursAgo < 24) {
        return `${hoursAgo}h ago`;
    }
    
    const daysAgo = Math.floor(hoursAgo / 24);
    if (daysAgo < 7) {
        return `${daysAgo}d ago`;
    }
    
    const weeksAgo = Math.floor(daysAgo / 7);
    if (weeksAgo < 4) {
        return `${weeksAgo}w ago`;
    }
    
    const monthsAgo = Math.floor(daysAgo / 30);
    if (monthsAgo < 12) {
        return `${monthsAgo}mo ago`;
    }
    
    const yearsAgo = Math.floor(daysAgo / 365);
    return `${yearsAgo}y ago`;
}

export {
    createProfileUI,
    createCollectionsUI,
    createWatchHistoryUI,
    updateProfileUI,
    updateCollectionsUI,
    updateWatchHistoryUI
};