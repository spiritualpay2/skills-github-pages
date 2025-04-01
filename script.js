document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements --- (Same)
    const viewerContainer = document.getElementById('viewerContainer');
    const fileSelector = document.getElementById('fileSelector');
    const openFileButton = document.getElementById('openFileButton');
    const fileInput = document.getElementById('fileInput');
    const imageDisplayArea = document.getElementById('imageDisplayArea');
    const imageContainer = document.getElementById('imageContainer');
    const controlsOverlay = document.getElementById('controlsOverlay');
    const statusOverlay = document.getElementById('statusOverlay');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorIndicator = document.getElementById('errorIndicator');
    const fileNameDisplay = document.getElementById('fileName');
    const prevPageButton = document.getElementById('prevPage');
    const nextPageButton = document.getElementById('nextPage');
    const pageIndicator = document.getElementById('pageIndicator');
    const zoomInButton = document.getElementById('zoomIn');
    const zoomOutButton = document.getElementById('zoomOut');
    const zoomFitButton = document.getElementById('zoomFit');
    const zoomLevelDisplay = document.getElementById('zoomLevel');

    // --- State Variables --- (Same)
    let zip = null; let sortedImageFiles = []; let currentPageIndex = 0;
    let currentImageElement = null; let preloadedBlobs = {};
    let currentZoom = 1.0; let isFitMode = true;
    let isPanning = false; let panStartX, panStartY, scrollLeftStart, scrollTopStart;
    let didPan = false; let controlsVisible = false; let mouseNearBottom = false;

    // --- Constants --- (Same)
    const ZOOM_STEP = 0.2; const MAX_ZOOM = 8.0; const MIN_ZOOM = 0.1; /* ... */
    const PRELOAD_AHEAD = 2; const PRELOAD_BEHIND = 1;

    // --- Event Listeners --- (Same)
    openFileButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    prevPageButton.addEventListener('click', goToPrevPage);
    nextPageButton.addEventListener('click', goToNextPage);
    zoomInButton.addEventListener('click', zoomIn);
    zoomOutButton.addEventListener('click', zoomOut);
    zoomFitButton.addEventListener('click', () => zoomFit(true));
    document.addEventListener('keydown', handleKeyDown);
    imageContainer.addEventListener('mousedown', handlePanStart);
    imageContainer.addEventListener('mousemove', handlePanMove);
    imageContainer.addEventListener('mouseup', handlePanEnd);
    imageContainer.addEventListener('mouseleave', handlePanEnd);
    imageContainer.addEventListener('touchstart', handlePanStart, { passive: false });
    imageContainer.addEventListener('touchmove', handlePanMove, { passive: false });
    imageContainer.addEventListener('touchend', handlePanEnd);
    imageContainer.addEventListener('touchcancel', handlePanEnd);
    imageContainer.addEventListener('click', handleContainerClick);
    document.addEventListener('mousemove', handleMouseMoveForControls);
    controlsOverlay.addEventListener('mouseenter', () => showControls(true));
    controlsOverlay.addEventListener('mouseleave', () => { if (!mouseNearBottom) hideControls(); });


    // --- Functions ---

    function handleFileSelect(event) { /* ... (Same logic) ... */ }
    async function loadZip(arrayBuffer) { /* ... (Same logic) ... */ }

    // --- displayPage (Simplified - No Transition) ---
    async function displayPage(index) {
        if (!zip || index < 0 || index >= sortedImageFiles.length) return;

        const targetPageIndex = index;
        currentPageIndex = targetPageIndex;

        // Get Blob URL (Same logic)
        let targetBlobUrl = preloadedBlobs[targetPageIndex];
        if (!targetBlobUrl) { try { /* ... load blob ... */ } catch (error) { /* ... error handling ... */ return; } }

        // Remove Old Image Immediately
        if (currentImageElement && imageContainer.contains(currentImageElement)) {
            imageContainer.removeChild(currentImageElement);
            currentImageElement = null;
        }

        // Create New Image Element
        const newImage = document.createElement('img');
        newImage.alt = `Comic Page ${targetPageIndex + 1}`;
        currentImageElement = newImage;
        imageContainer.appendChild(newImage);

        // Load Image Source & Handle Results
        try {
            await new Promise((resolve, reject) => {
                newImage.onload = resolve;
                newImage.onerror = (event) => reject(new Error(`Image source failed to load for page ${targetPageIndex + 1}`));
                newImage.src = targetBlobUrl;
            });
            // Image Loaded - Apply Fit
            zoomFit(false); // Apply fit state
            updateUIState();
            preloadAdjacentPages(targetPageIndex);
        } catch (error) { /* ... error handling ... */ }
    }


    function preloadAdjacentPages(currentIndex) { /* ... (same as before) ... */ }
    function goToPrevPage() { if (currentPageIndex > 0) displayPage(currentPageIndex - 1); }
    function goToNextPage() { if (currentPageIndex < sortedImageFiles.length - 1) displayPage(currentPageIndex + 1); }
    function updateUIState() { /* ... (Simplified disabled logic) ... */ }
    function updateZoomDisplay() { /* ... (Simplified disabled logic) ... */ }
    function showError(message) { /* ... (same as before) ... */ }
    function resetState(clearFileName = true) { /* ... (same as before) ... */ }

    // --- resetViewer (FIXED) ---
    function resetViewer() {
        fileSelector.style.display = 'block';
        imageDisplayArea.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible'); // ***** ADD THIS LINE BACK *****
        statusOverlay.style.display = 'none';
        imageContainer.innerHTML = ''; // Clear image elements
        imageContainer.scrollTop = 0; imageContainer.scrollLeft = 0;
        resetState(true); // Reset state variables
        fileInput.value = ''; // Clear file input
        updateUIState(); // Update button states (will disable them)
        hideControls(); // Ensure controls logic state is also reset
    }

    function applyZoom(centerPoint = null) { /* ... (same as before) ... */ }
    function zoomIn(e = null) { /* ... (same as before) ... */ }
    function zoomOut(e = null) { /* ... (same as before) ... */ }
    function zoomFit(triggerControlShow = true) { /* ... (same calculation logic) ... */ }
    function getEventCoordinates(e) { /* ... */ }
    function handlePanStart(e) { /* ... */ }
    function handlePanMove(e) { /* ... */ }
    function handlePanEnd(e) { /* ... */ }
    function handleContainerClick(e) { /* ... (Simplified check) ... */ }
    function handleKeyDown(e) { /* ... (Simplified check) ... */ }
    function showControls(force = false) { /* ... */ }
    function hideControls() { /* ... */ }
    function handleMouseMoveForControls(e) { /* ... */ }

    // --- Initial Setup ---
    resetViewer(); // Call reset on load

}); // End DOMContentLoaded