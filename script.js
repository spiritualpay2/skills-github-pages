document.addEventListener('DOMContentLoaded', () => {
    const redditUrlInput = document.getElementById('redditUrlInput');
    const addVideoButton = document.getElementById('addVideoButton');
    const videoGallery = document.getElementById('videoGallery');
    const clearAllButton = document.getElementById('clearAllButton');

    const LS_KEY = 'redditVideoGalleryItems';
    let videos = [];

    function isValidRedditPostUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.hostname.includes('reddit.com') && parsedUrl.pathname.includes('/comments/');
        } catch (error) {
            return false;
        }
    }

    function getPermalinkFromUrl(url) {
        // Extracts the permalink part like "/r/aww/comments/xyz/something_cute/"
        try {
            const parsedUrl = new URL(url);
            // Ensure it ends with a slash for consistency with reddit embed format
            return parsedUrl.pathname.endsWith('/') ? parsedUrl.pathname : parsedUrl.pathname + '/';
        } catch {
            return null;
        }
    }
    
    function renderVideos() {
        videoGallery.innerHTML = ''; // Clear existing videos

        if (videos.length === 0) {
            videoGallery.innerHTML = '<p style="color: var(--secondary-text); text-align: center;">No videos added yet. Paste a Reddit post URL above!</p>';
            return;
        }

        videos.forEach(videoInfo => {
            const videoItem = document.createElement('div');
            videoItem.classList.add('video-item');

            // Create the blockquote structure for Reddit embed
            // data-card-controls="false" hides the upvote/comment buttons on the embed
            // data-embed-parent="true" makes it play inline (sometimes needed)
            // data-embed-created is required by Reddit's widget
            // data-theme="dark" for dark themed embeds
            const blockquote = document.createElement('blockquote');
            blockquote.classList.add('reddit-embed-bq');
            blockquote.setAttribute('data-embed-height', '420'); // Suggest height
            blockquote.setAttribute('data-card-controls', 'false');
            blockquote.setAttribute('data-embed-parent', 'false'); // false seems to work better for new reddit embeds
            blockquote.setAttribute('data-embed-live', 'false');
            blockquote.setAttribute('data-embed-created', Date.now().toString()); // Unique timestamp
            
            const link = document.createElement('a');
            // Append ?embed=true&theme=dark to the permalink for styling and embed mode
            link.href = `https://www.reddit.com${videoInfo.permalink}?embed=true&theme=dark`;
            link.textContent = `Post from ${videoInfo.permalink.split('/')[2]}`; // e.g., "Post from aww"
            
            blockquote.appendChild(link);
            videoItem.appendChild(blockquote);
            videoGallery.appendChild(videoItem);
        });

        // VERY IMPORTANT: After adding new blockquotes, tell Reddit's script to render them.
        // This check is to ensure the script has loaded.
        if (window.redditEmbed) {
            window.redditEmbed.render();
        } else {
            // If the script hasn't loaded yet, it will pick them up when it does.
            // You might add a small delay and retry if needed, but usually not.
            console.warn("Reddit embed script not yet loaded. Embeds will render once it loads.");
        }
    }

    function saveVideosToLocalStorage() {
        localStorage.setItem(LS_KEY, JSON.stringify(videos));
    }

    function loadVideosFromLocalStorage() {
        const storedVideos = localStorage.getItem(LS_KEY);
        if (storedVideos) {
            videos = JSON.parse(storedVideos);
        }
        renderVideos();
    }

    addVideoButton.addEventListener('click', () => {
        const url = redditUrlInput.value.trim();
        if (!url) {
            alert('Please enter a Reddit post URL.');
            return;
        }

        if (!isValidRedditPostUrl(url)) {
            alert('Invalid Reddit post URL. It should look like: https://www.reddit.com/r/subreddit/comments/post_id/title/');
            return;
        }

        const permalink = getPermalinkFromUrl(url);
        if (!permalink) {
             alert('Could not parse the URL to get a permalink.');
            return;
        }

        // Check for duplicates
        if (videos.some(video => video.permalink === permalink)) {
            alert('This video is already in your gallery!');
            return;
        }

        videos.push({ originalUrl: url, permalink: permalink });
        saveVideosToLocalStorage();
        renderVideos();
        redditUrlInput.value = ''; // Clear input
    });

    clearAllButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all videos from the gallery?')) {
            videos = [];
            saveVideosToLocalStorage();
            renderVideos();
        }
    });

    // Initial load
    loadVideosFromLocalStorage();
});
