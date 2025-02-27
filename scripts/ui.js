/**
 * ui.js - UI components and rendering
 */

/**
 * Show error message
 * 
 * @param {string} message - Error message
 */
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => errorDiv.style.display = 'none', 3000);
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
 * Create a video card element
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
    
    const container = document.createElement('div');
    container.className = 'thumbnail-container';
    
    const img = document.createElement('img');
    img.className = 'thumbnail';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.src = video.thumbnail;
    img.alt = video.title;
    
    const playIcon = document.createElement('div');
    playIcon.className = 'play-icon';
    
    // Add favorite button
    const favButton = document.createElement('button');
    favButton.className = `favorite-button ${isFavorite ? 'active' : ''}`;
    favButton.textContent = isFavorite ? '★' : '☆';
    favButton.dataset.id = video.id;
    favButton.onclick = (e) => {
        e.stopPropagation();
        onClickFavorite(video.id);
    };
    
    container.appendChild(img);
    container.appendChild(playIcon);
    container.appendChild(favButton);
    
    const metadata = document.createElement('div');
    metadata.className = 'metadata';
    metadata.innerHTML = `
        <div class="title">${video.title}</div>
        <div class="details">
            <span>r/${video.subreddit}</span>
            <span>↑ ${video.upvotes}</span>
            <span>${video.created}</span>
        </div>
    `;

    card.onclick = (e) => {
        e.preventDefault();
        onClickCard(index);
    };

    card.appendChild(container);
    card.appendChild(metadata);
    return card;
}

/**
 * Render videos to the grid
 * 
 * @param {Array} videos - Videos to render
 * @param {function} onClickFavorite - Callback for clicking favorite
 * @param {function} onClickCard - Callback for clicking the card
 * @param {function} isFavoriteCheck - Function to check if video is favorited
 */
function renderVideos(videos, onClickFavorite, onClickCard, isFavoriteCheck) {
    const grid = document.getElementById('video-grid');
    grid.innerHTML = '';
    
    if (videos.length === 0) {
        grid.innerHTML = '<div style="text-align: center; grid-column: 1/-1; padding: 40px;">No videos found.</div>';
        return;
    }
    
    const fragment = document.createDocumentFragment();
    videos.forEach((video, index) => {
        fragment.appendChild(createVideoCard(
            video, 
            index, 
            onClickFavorite, 
            onClickCard, 
            isFavoriteCheck(video.id)
        ));
    });
    grid.appendChild(fragment);
}

/**
 * Update sort buttons UI
 * 
 * @param {string} currentSort - Current sort type
 * @param {boolean} showingFavorites - Whether showing favorites
 */
function updateSortButtons(currentSort, showingFavorites) {
    const buttons = document.querySelectorAll('.sort-button');
    buttons.forEach(button => {
        button.classList.toggle('active', button.dataset.sort === currentSort);
    });
    
    // Show/hide time filter for "top" sort
    const timeFilter = document.getElementById('time-select');
    timeFilter.style.display = currentSort === 'top' ? 'block' : 'none';
    
    // Disable sort buttons when showing favorites
    buttons.forEach(button => {
        button.disabled = showingFavorites;
        if (showingFavorites) {
            button.classList.add('disabled');
        } else {
            button.classList.remove('disabled');
        }
    });
}

/**
 * Render subreddit tags
 * 
 * @param {Array} userSubreddits - List of user subreddits
 * @param {Array} activeSubreddits - List of active subreddits
 * @param {function} onToggleSubreddit - Callback for toggling subreddit
 * @param {function} onRemoveSubreddit - Callback for removing subreddit
 */
function renderSubredditTags(userSubreddits, activeSubreddits, onToggleSubreddit, onRemoveSubreddit) {
    const container = document.getElementById('subreddit-tags');
    if (!container) return;
    
    container.innerHTML = '';
    
    userSubreddits.forEach(sub => {
        const tag = document.createElement('div');
        tag.className = `subreddit-tag ${activeSubreddits.includes(sub) ? 'active' : ''}`;
        tag.dataset.subreddit = sub;
        
        // Create the name span
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `r/${sub}`;
        nameSpan.className = 'subreddit-name';
        nameSpan.addEventListener('click', () => {
            onToggleSubreddit(sub);
        });
        tag.appendChild(nameSpan);
        
        // Create the remove button
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent tag click
            onRemoveSubreddit(sub);
        });
        tag.appendChild(removeBtn);
        
        container.appendChild(tag);
    });
}

/**
 * Initialize theme toggle button
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
    themeToggle.setAttribute('aria-label', 'Toggle theme');
    themeToggle.textContent = currentTheme === 'dark' ? '☀️' : '🌙';
    
    // Add click listener
    themeToggle.addEventListener('click', onToggleTheme);
    
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
    }
}

/**
 * Apply theme to document
 * 
 * @param {string} theme - Theme to apply
 */
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
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
    applyTheme
};