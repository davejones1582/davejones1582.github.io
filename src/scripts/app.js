// Configuration
const batchSize = 25;
let allImages = [];
let userSubreddits = [];
let currentImageIndex = 0;
let afterToken = null;
let isLoading = false;
let hasMore = true;
let currentSettings = {
    sort: 'hot',
    time: 'week',
    subreddits: []
};
let searchTimeout;
let observer;

// Error handling
function showError(message) {
    const errorDiv = document.getElementById('error-message');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    setTimeout(() => errorDiv.style.display = 'none', 3000);
}

// Loading states
function showLoading() {
    document.getElementById('loading-spinner').style.display = 'block';
}

function hideLoading() {
    document.getElementById('loading-spinner').style.display = 'none';
}

function getRedgifsEmbedUrl(url) {
    const id = url.split('/').pop();
    return `https://www.redgifs.com/ifr/${id}?autoplay=1&controls=1`;
}

// Settings management
function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    const backdrop = document.getElementById('settings-backdrop');
    panel.classList.toggle('active');
    backdrop.classList.toggle('active');
}

function handleSortChange() {
    const timeSelect = document.getElementById('time-select');
    timeSelect.style.display = document.getElementById('sort-select').value === 'top' 
        ? 'inline-block' 
        : 'none';
    saveSettings();
}

function handleKeyDown(e) {
    if (document.getElementById('lightbox').style.display === 'flex') {
        if (e.key === 'ArrowLeft') navigate(-1);
        if (e.key === 'ArrowRight') navigate(1);
        if (e.key === 'Escape') closeLightbox();
    }
}

function navigate(direction) {
    currentImageIndex += direction;
    if (currentImageIndex < 0) currentImageIndex = allImages.length - 1;
    if (currentImageIndex >= allImages.length) currentImageIndex = 0;
    showLightbox(allImages[currentImageIndex]);
}

function showLightbox(item) {
    const container = document.getElementById('media-container');
    container.innerHTML = item.isVideo 
        ? `<iframe class="lightbox-iframe" src="${item.url}" allowfullscreen frameborder="0" scrolling="no"></iframe>`
        : `<img class="lightbox-image" src="${item.url}">`;

    const metadata = document.getElementById('lightbox-metadata');
    metadata.innerHTML = `
        <div>r/${item.subreddit}</div>
        <div>↑ ${item.upvotes} • ${item.created}</div>
        <div>${item.title}</div>
        <a class="lightbox-link" href="https://reddit.com${item.permalink}" target="_blank">View Post</a>
    `;

    document.getElementById('lightbox').style.display = 'flex';
    document.addEventListener('keydown', handleKeyDown);
}

function closeLightbox() {
    document.getElementById('lightbox').style.display = 'none';
    document.removeEventListener('keydown', handleKeyDown);
}

function saveSettings() {
    currentSettings.sort = document.getElementById('sort-select').value;
    currentSettings.time = document.getElementById('time-select').value;
    localStorage.setItem('appSettings', JSON.stringify(currentSettings));
    refreshContent();
}

function loadSettings() {
    const saved = localStorage.getItem('appSettings');
    if (saved) {
        currentSettings = JSON.parse(saved);
        document.getElementById('sort-select').value = currentSettings.sort;
        document.getElementById('time-select').value = currentSettings.time;
        handleSortChange();
    }
}

function saveSubreddits() {
    const textarea = document.getElementById('subreddit-list');
    userSubreddits = textarea.value
        .split('\n')
        .map(s => s.trim().replace(/^r\//i, '').toLowerCase())
        .filter(s => s.length > 0);
    
    textarea.value = userSubreddits.join('\n');
    currentSettings.subreddits = userSubreddits;
    localStorage.setItem('appSettings', JSON.stringify(currentSettings));
    refreshContent();
}

function loadDefaultSubreddits() {
    const textarea = document.getElementById('subreddit-list');
    textarea.value = [
        'cumsluts',
        'anal',
        'blowjobs',
        'asshole',
        'gangbang',
        'girlsfinishingthejob'        
    ].join('\n');
    saveSubreddits();
}

async function fetchRedditImages() {
    try {
        if (!hasMore || isLoading || userSubreddits.length === 0) return [];
        
        isLoading = true;
        const multiSub = userSubreddits.join('+');
        const sort = currentSettings.sort;
        const timeParam = sort === 'top' ? `&t=${currentSettings.time}` : '';

        let url = `https://corsproxy.io/?${encodeURIComponent(
            `https://www.reddit.com/r/${multiSub}/${sort}.json?limit=${batchSize}&raw_json=1`
        )}${timeParam}${afterToken ? `&after=${afterToken}` : ''}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        
        // Update pagination state
        const newAfterToken = data.data.after;
        hasMore = newAfterToken !== null;
        afterToken = newAfterToken;

        const newImages = await Promise.all(data.data.children
            .filter(post => post.data.preview && !post.data.is_self)
            .map(async post => {
                const isRedgifs = post.data.url.includes('redgifs.com');
                return {
                    id: post.data.id,
                    title: post.data.title,
                    subreddit: post.data.subreddit,
                    url: isRedgifs ? getRedgifsEmbedUrl(post.data.url) : post.data.url,
                    thumbnail: post.data.preview.images[0].source.url.replace(/&amp;/g, '&'),
                    upvotes: post.data.ups,
                    created: new Date(post.data.created_utc * 1000).toLocaleDateString(),
                    isVideo: isRedgifs,
                    permalink: post.data.permalink
                };
            }));

        isLoading = false;
        return newImages;
    } catch (error) {
        console.error('Error fetching content:', error);
        showError(`Failed to load content: ${error.message}`);
        isLoading = false;
        return [];
    }
}

function refreshContent() {
    afterToken = null;
    hasMore = true;
    allImages = [];
    loadMoreImages();
}

function createImageCard(image, index) {
    const card = document.createElement('div');
    card.className = 'image-card';
    
    const container = document.createElement('div');
    container.className = 'thumbnail-container';
    
    if (image.isVideo) {
        const thumbnailImg = document.createElement('img');
        thumbnailImg.loading = "lazy";
        thumbnailImg.decoding = "async";
        thumbnailImg.className = 'thumbnail';
        thumbnailImg.src = image.thumbnail;
        thumbnailImg.alt = image.title;

        const playIcon = document.createElement('div');
        playIcon.className = 'play-icon';

        container.appendChild(thumbnailImg);
        container.appendChild(playIcon);
    } else {
        const img = document.createElement('img');
        img.className = 'thumbnail';
        img.loading = 'lazy';
        img.src = image.thumbnail;
        img.alt = image.title;
        container.appendChild(img);
    }

    const metadata = document.createElement('div');
    metadata.className = 'metadata';
    metadata.innerHTML = `
        <div class="filename">${image.title}</div>
        <div class="details">
            <span>r/${image.subreddit}</span>
            <span>↑ ${image.upvotes}</span>
            <span>${image.created}</span>
        </div>
    `;

    card.onclick = (e) => {
        e.preventDefault();
        currentImageIndex = index;
        showLightbox(image);
    };

    card.appendChild(container);
    card.appendChild(metadata);
    return card;
}

async function loadMoreImages() {
    if (!hasMore || isLoading) return;
    
    const newImages = await fetchRedditImages();
    if (newImages.length === 0) return;
    
    allImages = [...allImages, ...newImages];
    renderImages(allImages);
}


function renderImages(images) {
    const grid = document.getElementById('image-grid');
    grid.innerHTML = '';
    images.forEach((image, index) => {
        grid.appendChild(createImageCard(image, index));
    });
}

document.getElementById('search').addEventListener('input', function(e) {
    const query = e.target.value.toLowerCase();
    const filtered = allImages.filter(img => 
        img.title.toLowerCase().includes(query) ||
        img.subreddit.toLowerCase().includes(query)
    );
    renderImages(filtered);
});

function initObserver() {
    observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && hasMore && !isLoading) {
                loadMoreImages();
            }
        });
    }, { threshold: 0.1 }); // Lower threshold

    const sentinel = document.createElement('div');
    sentinel.style.height = '1px'; // Make sentinel detectable
    document.body.appendChild(sentinel);
    observer.observe(sentinel);
}

// Initialization
function initializeApp() {
    initObserver();
    loadSettings();
    document.getElementById('subreddit-list').value = currentSettings.subreddits.join('\n');
    userSubreddits = currentSettings.subreddits;
    loadMoreImages();
}

// Start the application
initializeApp();
