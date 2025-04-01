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

    // --- Constants ---
    const ZOOM_STEP = 0.2;
    const MAX_ZOOM = 8.0;
    const MIN_ZOOM = 0.1;
    const PAN_THRESHOLD = 5;
    const CONTROLS_BOTTOM_THRESHOLD = 60;
    const PRELOAD_AHEAD = 2;
    const PRELOAD_BEHIND = 1;
    const TRANSITION_DURATION = 250; // ms, should match CSS

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
        fileSelector.style.display = 'none';
        imageDisplayArea.style.display = 'none';
        statusOverlay.style.display = 'flex';
        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = 'Loading Book...';
        errorIndicator.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');
        const reader = new FileReader();
        reader.onload = (e) => loadZip(e.target.result);
        reader.onerror = (e) => { console.error("FileReader error:", e); showError('Error reading file.'); };
        reader.readAsArrayBuffer(file);
    }

    async function loadZip(arrayBuffer) {
        try {
            zip = await JSZip.loadAsync(arrayBuffer);
            sortedImageFiles = [];
            zip.forEach((relativePath, zipEntry) => {
                const lowerCasePath = relativePath.toLowerCase();
                if (!zipEntry.dir && /\.(jpe?g|png|gif|webp)$/.test(lowerCasePath) && !relativePath.startsWith('__MACOSX/')) {
                    sortedImageFiles.push({ path: relativePath, entry: zipEntry });
                }
            });
            sortedImageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
            if (sortedImageFiles.length === 0) { showError('Error: No compatible images found.'); return; }
            currentPageIndex = 0;
            imageDisplayArea.style.display = 'flex';
            await displayPage(currentPageIndex);
            statusOverlay.style.display = 'none';
        } catch (error) {
            console.error("JSZip error:", error);
            showError(`Error loading CBZ: ${error.message || 'Unknown error'}`);
            resetViewer();
            imageDisplayArea.style.display = 'none';
            fileSelector.style.display = 'block';
        }
    }

    async function displayPage(index) {
        if (!zip || index < 0 || index >= sortedImageFiles.length || isTransitioning) return;
        console.log(`Displaying page index ${index}`); // Add simple log
        isTransitioning = true;
        const targetPageIndex = index;
        currentPageIndex = targetPageIndex;

        // --- 1. Get Blob URL ---
        let targetBlobUrl = preloadedBlobs[targetPageIndex];
        let loadedNow = false;
        if (!targetBlobUrl) {
            try {
                const fileEntry = sortedImageFiles[targetPageIndex].entry;
                const blob = await fileEntry.async('blob');
                targetBlobUrl = URL.createObjectURL(blob);
                preloadedBlobs[targetPageIndex] = targetBlobUrl;
                loadedNow = true;
            } catch (error) {
                console.error(`Error loading blob for index ${targetPageIndex}:`, error);
                showError(`Error loading page ${targetPageIndex + 1} data: ${error.message}`);
                isTransitioning = false;
                if(targetBlobUrl && loadedNow) { URL.revokeObjectURL(targetBlobUrl); delete preloadedBlobs[targetPageIndex]; }
                return;
            }
        }

        // --- 2. Create Image Element ---
        const newImage = document.createElement('img');
        newImage.alt = `Comic Page ${targetPageIndex + 1}`;
        newImage.style.opacity = 0; // Start hidden

        const oldImage = currentImageElement;
        currentImageElement = newImage;

        imageContainer.appendChild(newImage);

        // --- 3. Load Image Source & Handle Results ---
        try {
            await new Promise((resolve, reject) => {
                newImage.onload = resolve; // Resolve when loaded
                newImage.onerror = (event) => reject(new Error(`Image source failed to load for page ${targetPageIndex + 1}`));
                newImage.src = targetBlobUrl;
            });

            // --- 4. Image Loaded - Transition and Fit ---
            console.log(`Image ${targetPageIndex + 1} loaded. Starting display logic.`); // Add simple log

            // Add visible class FIRST to start transition
            newImage.classList.add('visible');

            // Apply Fit and center AFTER browser acknowledges visibility change
            requestAnimationFrame(() => {
                console.log(`Applying zoomFit inside rAF for page ${targetPageIndex + 1}`); // Add simple log
                zoomFit(false); // Apply fit state and center

                 // Handle old image fade-out (moved inside rAF for timing consistency)
                 if (oldImage) {
                     oldImage.classList.remove('visible');
                     oldImage.classList.add('fading-out');
                     oldImage.addEventListener('transitionend', () => {
                         if (imageContainer.contains(oldImage)) {
                             imageContainer.removeChild(oldImage);
                         }
                     }, { once: true });
                 }

                 // Consider transition visually complete after CSS duration
                 setTimeout(() => {
                     isTransitioning = false;
                     preloadAdjacentPages(targetPageIndex);
                     updateUIState();
                      console.log(`Transition timeout complete for page ${targetPageIndex + 1}`); // Add simple log
                 }, TRANSITION_DURATION);
            }); // End requestAnimationFrame

        } catch (error) {
            console.error(`Error during image display for index ${targetPageIndex}:`, error);
            showError(error.message || `Error displaying page ${targetPageIndex + 1}`);
            if (imageContainer.contains(newImage)) { imageContainer.removeChild(newImage); }
            currentImageElement = oldImage; // Revert reference
            isTransitioning = false;
            updateUIState();
        }
    }


    function preloadAdjacentPages(currentIndex) {
        const preloadStart = Math.max(0, currentIndex - PRELOAD_BEHIND);
        const preloadEnd = Math.min(sortedImageFiles.length - 1, currentIndex + PRELOAD_AHEAD);
        Object.keys(preloadedBlobs).forEach(keyIndexStr => {
            const keyIndex = parseInt(keyIndexStr, 10);
            if ((keyIndex < preloadStart || keyIndex > preloadEnd) && keyIndex !== currentIndex ) {
                URL.revokeObjectURL(preloadedBlobs[keyIndex]); delete preloadedBlobs[keyIndex];
            }
        });
        for (let i = preloadStart; i <= preloadEnd; i++) {
            if (i !== currentIndex && !preloadedBlobs[i]) {
                const pageIndexToLoad = i;
                sortedImageFiles[pageIndexToLoad].entry.async('blob').then(blob => {
                    const currentPreloadStartNow = Math.max(0, currentPageIndex - PRELOAD_BEHIND);
                    const currentPreloadEndNow = Math.min(sortedImageFiles.length - 1, currentPageIndex + PRELOAD_AHEAD);
                    if (pageIndexToLoad >= currentPreloadStartNow && pageIndexToLoad <= currentPreloadEndNow) {
                        if (!preloadedBlobs[pageIndexToLoad]) preloadedBlobs[pageIndexToLoad] = URL.createObjectURL(blob);
                         else URL.revokeObjectURL(URL.createObjectURL(blob));
                    } else { URL.revokeObjectURL(URL.createObjectURL(blob)); }
                }).catch(err => console.warn(`Preload failed for index ${pageIndexToLoad}:`, err));
            }
        }
    }

    function goToPrevPage() { if (!isTransitioning && currentPageIndex > 0) displayPage(currentPageIndex - 1); }
    function goToNextPage() { if (!isTransitioning && currentPageIndex < sortedImageFiles.length - 1) displayPage(currentPageIndex + 1); }

    function updateUIState() {
        if (sortedImageFiles.length > 0 && currentImageElement) {
            pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${sortedImageFiles.length}`;
            prevPageButton.disabled = currentPageIndex === 0 || isTransitioning;
            nextPageButton.disabled = currentPageIndex === sortedImageFiles.length - 1 || isTransitioning;
        } else { /* ... default state ... */ }
        updateZoomDisplay();
    }

    function updateZoomDisplay() {
        zoomLevelDisplay.textContent = isFitMode ? 'Fit' : `${Math.round(currentZoom * 100)}%`;
        zoomInButton.disabled = isTransitioning || (!isFitMode && currentZoom >= MAX_ZOOM);
        zoomOutButton.disabled = isTransitioning || isFitMode || currentZoom <= MIN_ZOOM;
        zoomFitButton.disabled = isTransitioning || isFitMode;
    }

    function showError(message) {
        console.error("Showing Error:", message);
        statusOverlay.style.display = 'flex'; loadingIndicator.style.display = 'none';
        errorIndicator.textContent = message; errorIndicator.style.display = 'block';
        imageDisplayArea.style.display = 'none'; controlsOverlay.classList.remove('controls-visible');
        resetState(false);
    }

    function resetState(clearFileName = true) {
        zip = null; sortedImageFiles = []; currentPageIndex = 0;
        Object.values(preloadedBlobs).forEach(URL.revokeObjectURL); preloadedBlobs = {};
        currentImageElement = null;
        currentZoom = 1.0; isFitMode = true; isPanning = false; didPan = false; isTransitioning = false;
        if (clearFileName) fileNameDisplay.textContent = 'No file selected';
    }

    function resetViewer() {
        fileSelector.style.display = 'block'; imageDisplayArea.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible'); statusOverlay.style.display = 'none';
        imageContainer.innerHTML = '';
        imageContainer.scrollTop = 0; imageContainer.scrollLeft = 0;
        resetState(true); fileInput.value = ''; updateUIState(); hideControls();
    }

    function applyZoom(centerPoint = null) {
        if (!currentImageElement || !currentImageElement.naturalWidth || isFitMode) return;
        const img = currentImageElement; const container = imageContainer;
        const oldScrollLeft = container.scrollLeft; const oldScrollTop = container.scrollTop;
        const oldWidth = img.offsetWidth; const oldHeight = img.offsetHeight;
        const newWidth = img.naturalWidth * currentZoom; const newHeight = img.naturalHeight * currentZoom;
        let targetX = centerPoint ? centerPoint.x - container.getBoundingClientRect().left : container.clientWidth / 2;
        let targetY = centerPoint ? centerPoint.y - container.getBoundingClientRect().top : container.clientHeight / 2;
        let vpX = Math.max(0, Math.min(container.clientWidth, targetX));
        let vpY = Math.max(0, Math.min(container.clientHeight, targetY));
        let contentX = oldScrollLeft + vpX; let contentY = oldScrollTop + vpY;
        let ratioX = oldWidth > 0 ? contentX / oldWidth : 0.5; let ratioY = oldHeight > 0 ? contentY / oldHeight : 0.5;
        let newScrollLeft = (ratioX * newWidth) - vpX; let newScrollTop = (ratioY * newHeight) - vpY;
        img.style.width = `${newWidth}px`; img.style.height = `${newHeight}px`;
        img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
        container.scrollLeft = newScrollLeft; container.scrollTop = newScrollTop;
        updateUIState();
    }

    function zoomIn(e = null) {
        const oldFitMode = isFitMode; isFitMode = false;
        currentZoom = oldFitMode ? 1.0 + ZOOM_STEP : Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        const centerPoint = e ? { x: e.clientX, y: e.clientY } : null;
        applyZoom(centerPoint);
    }

    function zoomOut(e = null) {
        if (isFitMode) return; isFitMode = false;
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        const centerPoint = e ? { x: e.clientX, y: e.clientY } : null;
        applyZoom(centerPoint);
        if (currentImageElement && currentImageElement.naturalWidth * currentZoom <= imageContainer.clientWidth && currentImageElement.naturalHeight * currentZoom <= imageContainer.clientHeight) {
            zoomFit(false);
        }
    }

    function zoomFit(triggerControlShow = true) {
        if (!currentImageElement) return;
        // console.log("Applying zoomFit");
        isFitMode = true; currentZoom = 1.0;
        const img = currentImageElement;
        img.style.width = ''; img.style.height = ''; // Use CSS auto sizing
        img.style.maxWidth = '100%'; img.style.maxHeight = '100%';

        // Center view needs to happen after layout potentially changes
        // No need for rAF here as it's called from rAF in displayPage or directly by user action
        imageContainer.scrollTop = (imageContainer.scrollHeight - imageContainer.clientHeight) / 2;
        imageContainer.scrollLeft = (imageContainer.scrollWidth - imageContainer.clientWidth) / 2;
        // console.log("zoomFit scroll centered.");
        updateUIState();
        if (triggerControlShow) showControls();
    }

    function getEventCoordinates(e) { /* ... */ }
    function handlePanStart(e) { /* ... */ }
    function handlePanMove(e) { /* ... */ }
    function handlePanEnd(e) { /* ... */ }
    function handleContainerClick(e) { /* ... */ }
    function handleKeyDown(e) { /* ... */ }
    function showControls(force = false) { /* ... */ }
    function hideControls() { /* ... */ }
    function handleMouseMoveForControls(e) { /* ... */ }

    // --- Initial Setup ---
    resetViewer();
    // console.log("CBZ Viewer Initialized.");

}); // End DOMContentLoaded