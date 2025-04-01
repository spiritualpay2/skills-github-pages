document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
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

    // --- State Variables ---
    let zip = null;
    let sortedImageFiles = [];
    let currentPageIndex = 0;
    let currentImageElement = null;
    let preloadedBlobs = {};
    let isTransitioning = false;
    let currentZoom = 1.0;
    let isFitMode = true;
    let isPanning = false;
    let panStartX, panStartY, scrollLeftStart, scrollTopStart;
    let didPan = false;
    let controlsVisible = false;
    let mouseNearBottom = false;
    let isInitialDisplay = false; // Flag for the very first image display

    // --- Constants ---
    const ZOOM_STEP = 0.2;
    const MAX_ZOOM = 8.0;
    const MIN_ZOOM = 0.1;
    const PAN_THRESHOLD = 5;
    const CONTROLS_BOTTOM_THRESHOLD = 60;
    const PRELOAD_AHEAD = 2;
    const PRELOAD_BEHIND = 1;
    const TRANSITION_DURATION = 250; // ms, should match CSS
    const INITIAL_DISPLAY_DELAY = 10; // ms delay for first image display logic

    // --- Event Listeners ---
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

    function handleFileSelect(event) {
        const file = event.target.files[0];
        resetViewer();
        if (!file) return;
        fileNameDisplay.textContent = file.name;
        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError('Error: Please select a .cbz file.');
            fileInput.value = ''; return;
        }
        isInitialDisplay = true; // Set flag for first load
        fileSelector.style.display = 'none';
        imageDisplayArea.style.display = 'none'; // Keep hidden until loadZip finishes
        statusOverlay.style.display = 'flex';
        loadingIndicator.style.display = 'block'; loadingIndicator.textContent = 'Loading Book...';
        errorIndicator.style.display = 'none'; controlsOverlay.classList.remove('controls-visible');
        const reader = new FileReader();
        reader.onload = (e) => loadZip(e.target.result);
        reader.onerror = (e) => { console.error("FileReader error:", e); showError('Error reading file.'); };
        reader.readAsArrayBuffer(file);
    }

    async function loadZip(arrayBuffer) {
        try {
            zip = await JSZip.loadAsync(arrayBuffer);
            sortedImageFiles = [];
            zip.forEach((relativePath, zipEntry) => { /* ... find images ... */
                const lowerCasePath = relativePath.toLowerCase();
                if (!zipEntry.dir && /\.(jpe?g|png|gif|webp)$/.test(lowerCasePath) && !relativePath.startsWith('__MACOSX/')) {
                    sortedImageFiles.push({ path: relativePath, entry: zipEntry });
                }
            });
            sortedImageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
            if (sortedImageFiles.length === 0) { showError('Error: No compatible images found.'); return; }
            currentPageIndex = 0;
            imageDisplayArea.style.display = 'flex'; // Show container *before* loading first page
            await displayPage(currentPageIndex); // Load and display first page
            statusOverlay.style.display = 'none';
        } catch (error) { /* ... error handling ... */ }
    }

    async function displayPage(index) {
        if (!zip || index < 0 || index >= sortedImageFiles.length || isTransitioning) return;
        // console.log(`Displaying page index ${index}`);
        isTransitioning = !isInitialDisplay; // Only flag transition if not initial display
        const isFirst = isInitialDisplay; // Capture flag state for this call
        if (isFirst) { isInitialDisplay = false; } // Reset flag

        const targetPageIndex = index;
        currentPageIndex = targetPageIndex;

        // --- 1. Get Blob URL --- (Same)
        let targetBlobUrl = preloadedBlobs[targetPageIndex];
        let loadedNow = false;
        if (!targetBlobUrl) {
            try { /* ... load blob ... */
                const fileEntry = sortedImageFiles[targetPageIndex].entry;
                const blob = await fileEntry.async('blob');
                targetBlobUrl = URL.createObjectURL(blob);
                preloadedBlobs[targetPageIndex] = targetBlobUrl;
                loadedNow = true;
             } catch (error) { /* ... error handling ... */ isTransitioning = false; return; }
        }

        // --- 2. Create Image Element ---
        const newImage = document.createElement('img');
        newImage.alt = `Comic Page ${targetPageIndex + 1}`;
        // Apply absolute positioning from the start now, rely on opacity/timing
        newImage.style.position = 'absolute';
        newImage.style.top = '0';
        newImage.style.left = '0';
        newImage.style.opacity = 0; // Start hidden

        const oldImage = currentImageElement;
        currentImageElement = newImage;
        imageContainer.appendChild(newImage);

        // --- 3. Load Image Source & Handle Results ---
        try {
            await new Promise((resolve, reject) => {
                newImage.onload = resolve;
                newImage.onerror = (event) => reject(new Error(`Image source failed to load for page ${targetPageIndex + 1}`));
                newImage.src = targetBlobUrl;
            });

            // --- 4. Image Loaded - Apply Styles and Transition ---
            // console.log(`Image ${targetPageIndex + 1} loaded.`);

            // Apply fit state first (sets max-width/height etc.)
            zoomFit(false);

            // Use a short delay for the *initial* display to ensure layout is stable
            // For subsequent displays, use requestAnimationFrame for smoother transition start
            const displayLogic = () => {
                // console.log(`Running displayLogic for page ${targetPageIndex + 1}`);
                newImage.classList.add('visible'); // Make visible (triggers opacity transition)

                if (oldImage) {
                    oldImage.classList.remove('visible');
                    oldImage.classList.add('fading-out');
                    oldImage.addEventListener('transitionend', () => {
                        if (imageContainer.contains(oldImage)) imageContainer.removeChild(oldImage);
                    }, { once: true });
                }

                // Reset transition flag after CSS transition duration
                setTimeout(() => {
                    isTransitioning = false;
                    preloadAdjacentPages(targetPageIndex);
                    updateUIState();
                }, isFirst ? 0 : TRANSITION_DURATION); // No transition delay needed if it was the first image
            };

            if (isFirst) {
                // console.log(`Applying initial display delay for page ${targetPageIndex + 1}`);
                setTimeout(displayLogic, INITIAL_DISPLAY_DELAY);
            } else {
                // console.log(`Using requestAnimationFrame for page ${targetPageIndex + 1}`);
                requestAnimationFrame(displayLogic);
            }

        } catch (error) { /* ... error handling ... */ }
    }

    function preloadAdjacentPages(currentIndex) { /* ... (same as before) ... */ }
    function goToPrevPage() { if (!isTransitioning && currentPageIndex > 0) displayPage(currentPageIndex - 1); }
    function goToNextPage() { if (!isTransitioning && currentPageIndex < sortedImageFiles.length - 1) displayPage(currentPageIndex + 1); }
    function updateUIState() { /* ... (same as before) ... */ }
    function updateZoomDisplay() { /* ... (same as before) ... */ }
    function showError(message) { /* ... (same as before) ... */ }
    function resetState(clearFileName = true) { /* ... (same as before) ... */ }
    function resetViewer() { /* ... (same as before) ... */ }
    function applyZoom(centerPoint = null) { /* ... (same as before) ... */ }
    function zoomIn(e = null) { /* ... (same as before) ... */ }
    function zoomOut(e = null) { /* ... (same as before) ... */ }
    function zoomFit(triggerControlShow = true) { /* ... (same as before, ensures position absolute) ... */
        if (!currentImageElement) return;
        isFitMode = true; currentZoom = 1.0;
        const img = currentImageElement;
        // Ensure consistent positioning for fitting
        img.style.position = 'absolute'; img.style.top = '0'; img.style.left = '0'; img.style.margin = '';
        // Reset dimensions for CSS contain/fit
        img.style.width = ''; img.style.height = '';
        img.style.maxWidth = '100%'; img.style.maxHeight = '100%';
        // Center using requestAnimationFrame
        requestAnimationFrame(() => {
            imageContainer.scrollTop = (imageContainer.scrollHeight - imageContainer.clientHeight) / 2;
            imageContainer.scrollLeft = (imageContainer.scrollWidth - imageContainer.clientWidth) / 2;
            updateUIState();
            if (triggerControlShow) showControls();
        });
     }
    function getEventCoordinates(e) { /* ... (same as before) ... */ }
    function handlePanStart(e) { /* ... (same as before) ... */ }
    function handlePanMove(e) { /* ... (same as before) ... */ }
    function handlePanEnd(e) { /* ... (same as before) ... */ }
    function handleContainerClick(e) { /* ... (same as before) ... */ }
    function handleKeyDown(e) { /* ... (same as before) ... */ }
    function showControls(force = false) { /* ... (same as before) ... */ }
    function hideControls() { /* ... (same as before) ... */ }
    function handleMouseMoveForControls(e) { /* ... (same as before) ... */ }

    // --- Initial Setup ---
    resetViewer();

}); // End DOMContentLoaded