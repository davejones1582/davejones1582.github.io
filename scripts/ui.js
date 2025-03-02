/**
 * ui.js - Enhanced UI components and rendering with better performance
 */
import { createThumbnailPreview, optimizeVideoMemory } from './video.js';

/**
 * Show error message with enhanced visibility
 * 
 * @param {string} message - Error message
 * @param {number} duration - Duration in ms (0 for persistent)
 */
function showError(message, duration = 3000) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    
    // Animate in
    errorDiv.style.opacity = '0';
    errorDiv.style.transform = 'translateY(-10px)';
    
    // Force reflow
    void errorDiv.offsetWidth;
    
    errorDiv.style.transition = 'opacity 0.3s, transform 0.3s';
    errorDiv.style.opacity = '1';
    errorDiv.style.transform = 'translateY(0)';
    
    if (duration > 0) {
        setTimeout(() => {
            // Animate out
            errorDiv.style.opacity = '0';
            errorDiv.style.transform = 'translateY(-10px)';
            
            setTimeout(() => {
                errorDiv.style.display = 'none';
            }, 300);
        }, duration);
    }
}

/**
 * Show loading spinner
 */
function showLoading() {
    document.getElementById('loading-spinner').style.display = 'block';
}

/**
 * Hide loading spinner
 */
function hideLoading() {
    document.getElementById('loading-spinner').style.display = 'none';
}

/**
 * Create a video card element with enhanced layout and accessibility
 * 
 * @param {Object} video - Video data
 * @param {number} index - Video index
 * @param {function} onClickFavorite - Callback for clicking favorite
 * @param {function} onClickCard - Callback for clicking the card
 * @param {boolean} isFavorite - Whether video is favorited
 * @returns {HTMLElement} Card element
 */
function createVideoCard(video, index, onClickFavorite, onClickCard, isFavorite) {
    const card = document.createElement('div');
    card.className = 'video-card';
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Video: ${video.title}`);
    card.tabIndex = 0; // Make it keyboard focusable
    
    const container = document.createElement('div');
    container.className = 'thumbnail-container';
    
    // Use enhanced thumbnail with preview capability
    const img = createThumbnailPreview(
        video.fallbackUrl || video.url, 
        video.thumbnail, 
        container
    );
    
    const playIcon = document.createElement('div');
    playIcon.className = 'play-icon';
    playIcon.setAttribute('aria-hidden', 'true');
    
    // Add favorite button with improved accessibility
    const favButton = document.createElement('button');
    favButton.className = `favorite-button ${isFavorite ? 'active' : ''}`;
    favButton.textContent = isFavorite ? '★' : '☆';
    favButton.dataset.id = video.id;
    favButton.setAttribute('aria-label', isFavorite ? 'Remove from favorites' : 'Add to favorites');
    favButton.onclick = (e) => {
        e.stopPropagation();
        onClickFavorite(video.id);
        
        // Update aria-label after toggling
        const newState = favButton.classList.contains('active');
        favButton.setAttribute('aria-label', newState ? 'Remove from favorites' : 'Add to favorites');
    };
    
    container.appendChild(img);
    container.appendChild(playIcon);
    container.appendChild(favButton);
    
    const metadata = document.createElement('div');
    metadata.className = 'metadata';
    
    // Add comment count and better formatting
    const formattedUpvotes = formatCount(video.upvotes);
    const formattedComments = video.comments ? formatCount(video.comments) : '';
    const authorDisplay = video.author ? `by ${video.author}` : '';
    
    metadata.innerHTML = `
        <div class="title">${video.title}</div>
        <div class="details">
            <span>r/${video.subreddit}</span>
            <span>↑ ${formattedUpvotes}</span>
            ${video.comments ? `<span>💬 ${formattedComments}</span>` : ''}
            <span>${video.created}</span>
        </div>
    `;
    
    // Set up a11y keyboard handling
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClickCard(index);
        }
    });
    
    card.onclick = (e) => {
        e.preventDefault();
        onClickCard(index);
    };
    
    card.appendChild(container);
    card.appendChild(metadata);
    return card;
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
 * Render videos to the grid with optimized performance
 * 
 * @param {Array} videos - Videos to render
 * @param {function} onClickFavorite - Callback for clicking favorite
 * @param {function} onClickCard - Callback for clicking the card
 * @param {function} isFavoriteCheck - Function to check if video is favorited
 */
function renderVideos(videos, onClickFavorite, onClickCard, isFavoriteCheck) {
    const grid = document.getElementById('video-grid');
    
    // Preserve scroll position
    const scrollPos = window.scrollY;
    
    // Only clear grid if we're adding new content (not appending)
    if (videos.length === 0 || videos[0].newContent) {
        grid.innerHTML = '';
    }
    
    if (videos.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 32px; margin-bottom: 16px;">📭</div>
                <div>No videos found.</div>
                <div style="margin-top: 8px; font-size: 14px;">Try selecting different subreddits or changing the sort method.</div>
            </div>
        `;
        return;
    }
    
    // Use fragment for better performance
    const fragment = document.createDocumentFragment();
    
    // Create array of cards to render
    const cardsToCreate = videos.filter(video => {
        // Check if this video is already rendered
        return !document.querySelector(`.video-card [data-id="${video.id}"]`);
    });
    
    // Batch DOM operations for better performance
    cardsToCreate.forEach((video, index) => {
        const actualIndex = videos.indexOf(video);
        fragment.appendChild(createVideoCard(
            video, 
            actualIndex, 
            onClickFavorite, 
            onClickCard, 
            isFavoriteCheck(video.id)
        ));
    });
    
    grid.appendChild(fragment);
    
    // Optimize memory usage for videos
    optimizeVideoMemory();
    
    // Restore scroll position if needed
    if (scrollPos > 0 && videos[0].newContent !== true) {
        window.scrollTo(0, scrollPos);
    }
    
    // Update favorite buttons to ensure they're in sync
    videos.forEach(video => {
        const isFavorited = isFavoriteCheck(video.id);
        const buttons = document.querySelectorAll(`.favorite-button[data-id="${video.id}"]`);
        buttons.forEach(btn => {
            btn.classList.toggle('active', isFavorited);
            btn.textContent = isFavorited ? '★' : '☆';
        });
    });
}

/**
 * Update sort buttons UI with improved state handling
 * 
 * @param {string} currentSort - Current sort type
 * @param {boolean} showingFavorites - Whether showing favorites
 */
function updateSortButtons(currentSort, showingFavorites) {
    const buttons = document.querySelectorAll('.sort-button');
    
    buttons.forEach(button => {
        // Reset classes first
        button.classList.remove('active', 'disabled');
        
        // Set active class
        if (button.dataset.sort === currentSort) {
            button.classList.add('active');
        }
        
        // Set aria attributes for accessibility
        button.setAttribute('aria-pressed', button.dataset.sort === currentSort);
        
        // Disable buttons when showing favorites
        if (showingFavorites) {
            button.classList.add('disabled');
            button.disabled = true;
            button.setAttribute('aria-disabled', 'true');
        } else {
            button.disabled = false;
            button.removeAttribute('aria-disabled');
        }
    });
    
    // Show/hide time filter for "top" sort
    const timeFilter = document.getElementById('time-select');
    timeFilter.style.display = currentSort === 'top' ? 'block' : 'none';
    
    // Update filter label for screen readers
    if (currentSort === 'top') {
        timeFilter.setAttribute('aria-label', 'Time range for top posts');
    }
}

/**
 * Render subreddit tags with improved interaction
 * 
 * @param {Array} userSubreddits - List of user subreddits
 * @param {Array} activeSubreddits - List of active subreddits
 * @param {function} onToggleSubreddit - Callback for toggling subreddit
 * @param {function} onRemoveSubreddit - Callback for removing subreddit
 */
function renderSubredditTags(userSubreddits, activeSubreddits, onToggleSubreddit, onRemoveSubreddit) {
    const container = document.getElementById('subreddit-tags');
    if (!container) return;
    
    // Clear existing content
    container.innerHTML = '';
    
    // Get counts for each subreddit if available
    const getSubInfo = (name) => {
        // Look up from any possible settings data
        if (window.currentSettings && window.currentSettings.subreddits) {
            const subInfo = window.currentSettings.subreddits.find(s => s.name === name);
            return subInfo || { name, subscribers: 0 };
        }
        return { name, subscribers: 0 };
    };
    
    // Sort subreddits - active first, then alphabetically
    const sortedSubs = [...userSubreddits].sort((a, b) => {
        const aActive = activeSubreddits.includes(a);
        const bActive = activeSubreddits.includes(b);
        
        // Active subreddits first
        if (aActive && !bActive) return -1;
        if (!aActive && bActive) return 1;
        
        // Then alphabetically
        return a.localeCompare(b);
    });
    
    // Create fragment for better performance
    const fragment = document.createDocumentFragment();
    
    sortedSubs.forEach(sub => {
        const subInfo = getSubInfo(sub);
        const tag = document.createElement('div');
        tag.className = `subreddit-tag ${activeSubreddits.includes(sub) ? 'active' : ''}`;
        tag.dataset.subreddit = sub;
        
        // Create the name span with subscriber count tooltip
        const nameSpan = document.createElement('span');
        nameSpan.className = 'subreddit-name';
        nameSpan.textContent = `r/${sub}`;
        
        if (subInfo.subscribers > 0) {
            const formattedCount = formatCount(subInfo.subscribers);
            nameSpan.title = `${formattedCount} subscribers`;
        }
        
        nameSpan.setAttribute('role', 'button');
        nameSpan.setAttribute('aria-pressed', activeSubreddits.includes(sub));
        nameSpan.tabIndex = 0;
        
        // Add keyboard support
        nameSpan.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggleSubreddit(sub);
            }
        });
        
        nameSpan.addEventListener('click', () => {
            onToggleSubreddit(sub);
        });
        
        tag.appendChild(nameSpan);
        
        // Create the remove button
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('role', 'button');
        removeBtn.setAttribute('aria-label', `Remove ${sub} subreddit`);
        removeBtn.tabIndex = 0;
        
        // Add keyboard support
        removeBtn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation(); // Prevent tag click
                onRemoveSubreddit(sub);
            }
        });
        
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent tag click
            onRemoveSubreddit(sub);
        });
        
        tag.appendChild(removeBtn);
        fragment.appendChild(tag);
    });
    
    container.appendChild(fragment);
    
    // Scroll active tags into view if needed
    const firstActiveTag = container.querySelector('.subreddit-tag.active');
    if (firstActiveTag) {
        container.scrollLeft = firstActiveTag.offsetLeft - 20;
    }
}

/**
 * Initialize theme toggle button with enhanced accessibility
 * 
 * @param {string} currentTheme - Current theme
 * @param {function} onToggleTheme - Theme toggle callback
 */
function initThemeToggle(currentTheme, onToggleTheme) {
    // Create theme toggle button
    const headerButtons = document.querySelector('.header-buttons');
    const themeToggle = document.createElement('button');
    themeToggle.id = 'theme-toggle';
    themeToggle.className = 'icon-button';
    themeToggle.setAttribute('aria-label', currentTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    
    // Add click listener
    themeToggle.addEventListener('click', () => {
        onToggleTheme();
        // Update button state after toggle
        updateThemeButton(themeToggle, currentTheme === 'dark' ? 'light' : 'dark');
    });
    
    // Add to DOM
    headerButtons.appendChild(themeToggle);
    
    return themeToggle;
}

/**
 * Update theme toggle button
 * 
 * @param {HTMLElement} button - Button element
 * @param {string} theme - Current theme
 */
function updateThemeButton(button, theme) {
    if (!button) button = document.getElementById('theme-toggle');
    if (button) {
        button.textContent = theme === 'dark' ? '☀️' : '🌙';
        button.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    }
}

/**
 * Apply theme to document with smooth transitions
 * 
 * @param {string} theme - Theme to apply
 */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update meta theme-color for browser UI
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.content = theme === 'dark' ? '#121212' : '#f7f7f7';
    }
    
    // Dispatch event for other components to react
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
}

/**
 * Create a toast notification
 * 
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, info)
 * @param {number} duration - Duration in ms
 */
function showToast(message, type = 'info', duration = 3000) {
    // Remove any existing toasts
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => toast.remove());
    
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.style.position = 'fixed';
        toastContainer.style.bottom = '20px';
        toastContainer.style.left = '50%';
        toastContainer.style.transform = 'translateX(-50%)';
        toastContainer.style.zIndex = '1000';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.textContent = message;
    
    // Style the toast
    toast.style.padding = '12px 20px';
    toast.style.marginBottom = '10px';
    toast.style.backgroundColor = type === 'success' ? 'var(--success-color)' : 
                                 type === 'error' ? 'var(--error-color)' : 
                                 'var(--primary-color)';
    toast.style.color = 'white';
    toast.style.borderRadius = '100px';
    toast.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    
    toastContainer.appendChild(toast);
    
    // Animate in
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);
    
    // Remove after duration
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        
        // Remove from DOM after animation
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

export {
    showError,
    showLoading,
    hideLoading,
    renderVideos,
    updateSortButtons,
    renderSubredditTags,
    initThemeToggle,
    updateThemeButton,
    applyTheme,
    showToast,
    formatCount
};