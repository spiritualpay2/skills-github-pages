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
        // console.log("handleFileSelect triggered.");
        const file = event.target.files[0];
        resetViewer();
        if (!file) return;

        fileNameDisplay.textContent = file.name;
        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError('Error: Please select a .cbz file.');
            fileInput.value = '';
            return;
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
        // console.log("loadZip called.");
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

            // console.log(`Found ${sortedImageFiles.length} images.`);
            currentPageIndex = 0;
            imageDisplayArea.style.display = 'flex'; // Show container *before* loading first page

            await displayPage(currentPageIndex); // Load and display first page

            statusOverlay.style.display = 'none'; // Hide loading *after* display attempt
            // console.log("Hid loading overlay.");

        } catch (error) {
            console.error("JSZip error:", error);
            showError(`Error loading CBZ: ${error.message || 'Unknown error'}`);
            resetViewer(); // Ensure cleanup on error
            imageDisplayArea.style.display = 'none';
            fileSelector.style.display = 'block';
        }
    }

    async function displayPage(index) {
        if (!zip || index < 0 || index >= sortedImageFiles.length || isTransitioning) {
            // console.warn("displayPage prevented:", { index, isTransitioning });
            return;
        }
        // console.log(`displayPage: Starting for index ${index}`);
        isTransitioning = true;
        const targetPageIndex = index;
        currentPageIndex = targetPageIndex;

        // --- 1. Get Blob URL ---
        let targetBlobUrl = preloadedBlobs[targetPageIndex];
        let loadedNow = false;
        if (!targetBlobUrl) {
            try {
                // console.log(`displayPage: Loading blob for index ${targetPageIndex}`);
                const fileEntry = sortedImageFiles[targetPageIndex].entry;
                const blob = await fileEntry.async('blob');
                targetBlobUrl = URL.createObjectURL(blob);
                preloadedBlobs[targetPageIndex] = targetBlobUrl;
                loadedNow = true;
                // console.log(`displayPage: Blob created for index ${targetPageIndex}`);
            } catch (error) {
                console.error(`displayPage: Error loading blob for index ${targetPageIndex}:`, error);
                showError(`Error loading page ${targetPageIndex + 1} data: ${error.message}`);
                isTransitioning = false;
                if(targetBlobUrl && loadedNow) { URL.revokeObjectURL(targetBlobUrl); delete preloadedBlobs[targetPageIndex]; }
                return;
            }
        } else {
            // console.log(`displayPage: Using cached blob for index ${targetPageIndex}`);
        }

        // --- 2. Create Image Element ---
        const newImage = document.createElement('img');
        newImage.alt = `Comic Page ${targetPageIndex + 1}`;
        newImage.style.opacity = 0; // Start hidden for transition

        const oldImage = currentImageElement;
        currentImageElement = newImage;

        // console.log(`displayPage: Adding new image element for index ${targetPageIndex} to DOM.`);
        imageContainer.appendChild(newImage);

        // --- 3. Load Image Source & Handle Results ---
        try {
            await new Promise((resolve, reject) => {
                newImage.onload = () => {
                    // console.log(`displayPage: newImage.onload triggered for index ${targetPageIndex}.`);
                    resolve(); // Success
                };
                newImage.onerror = (event) => {
                    console.error(`displayPage: newImage.onerror triggered for index ${targetPageIndex}. Event:`, event);
                    reject(new Error(`Image source failed to load for page ${targetPageIndex + 1}`));
                };
                // console.log(`displayPage: Setting src for new image index ${targetPageIndex} to ${targetBlobUrl}`);
                newImage.src = targetBlobUrl;
            });

            // --- 4. Image Loaded - Apply Fit & Transition ---
            // console.log(`displayPage: Image ${targetPageIndex + 1} promise resolved. Applying fit.`);
            zoomFit(false); // Apply fit state *before* making visible

            requestAnimationFrame(() => {
                newImage.classList.add('visible'); // Start fade-in
                // console.log(`displayPage: Added 'visible' class to image ${targetPageIndex + 1}`);

                if (oldImage) {
                    // console.log("displayPage: Fading out old image.");
                    oldImage.classList.remove('visible');
                    oldImage.classList.add('fading-out');
                    oldImage.addEventListener('transitionend', () => {
                        if (imageContainer.contains(oldImage)) {
                            imageContainer.removeChild(oldImage);
                            // console.log("displayPage: Removed old image from DOM.");
                        }
                    }, { once: true });
                }

                // Consider transition complete after CSS duration
                setTimeout(() => {
                    // console.log(`displayPage: Transition visually complete for ${targetPageIndex + 1}. Resetting flag.`);
                    isTransitioning = false; // Reset flag HERE
                    preloadAdjacentPages(targetPageIndex);
                    updateUIState();
                }, TRANSITION_DURATION);
            });

        } catch (error) {
            console.error(`displayPage: Error during image loading/display for index ${targetPageIndex}:`, error);
            showError(error.message || `Error displaying page ${targetPageIndex + 1}`);
            if (imageContainer.contains(newImage)) { imageContainer.removeChild(newImage); }
            currentImageElement = oldImage;
            isTransitioning = false;
            updateUIState();
        }
    }


    function preloadAdjacentPages(currentIndex) {
        const preloadStart = Math.max(0, currentIndex - PRELOAD_BEHIND);
        const preloadEnd = Math.min(sortedImageFiles.length - 1, currentIndex + PRELOAD_AHEAD);

        // Prune blobs outside the needed window (excluding current)
        Object.keys(preloadedBlobs).forEach(keyIndexStr => {
            const keyIndex = parseInt(keyIndexStr, 10);
            if ((keyIndex < preloadStart || keyIndex > preloadEnd) && keyIndex !== currentIndex ) {
                // console.log(`Pruning blob cache for index: ${keyIndex}`);
                URL.revokeObjectURL(preloadedBlobs[keyIndex]);
                delete preloadedBlobs[keyIndex];
            }
        });

        // Preload needed pages
        for (let i = preloadStart; i <= preloadEnd; i++) {
            if (i !== currentIndex && !preloadedBlobs[i]) {
                const pageIndexToLoad = i;
                // console.log(`Preloading page index: ${pageIndexToLoad}`);
                sortedImageFiles[pageIndexToLoad].entry.async('blob')
                .then(blob => {
                    // Check if still relevant before caching
                    const currentPreloadStartNow = Math.max(0, currentPageIndex - PRELOAD_BEHIND);
                    const currentPreloadEndNow = Math.min(sortedImageFiles.length - 1, currentPageIndex + PRELOAD_AHEAD);
                    if (pageIndexToLoad >= currentPreloadStartNow && pageIndexToLoad <= currentPreloadEndNow) {
                        if (!preloadedBlobs[pageIndexToLoad]) {
                            preloadedBlobs[pageIndexToLoad] = URL.createObjectURL(blob);
                            // console.log(`Preload complete for index: ${pageIndexToLoad}`);
                        } else { URL.revokeObjectURL(URL.createObjectURL(blob)); } // Already loaded elsewhere? Discard.
                    } else {
                        // console.log(`Preload for ${pageIndexToLoad} no longer needed, discarding.`);
                        URL.revokeObjectURL(URL.createObjectURL(blob));
                    }
                })
                .catch(err => console.warn(`Preload failed for index ${pageIndexToLoad}:`, err));
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
        } else {
            pageIndicator.textContent = 'Page 0 / 0';
            prevPageButton.disabled = true;
            nextPageButton.disabled = true;
        }
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
        statusOverlay.style.display = 'flex';
        loadingIndicator.style.display = 'none';
        errorIndicator.textContent = message;
        errorIndicator.style.display = 'block';
        imageDisplayArea.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');
        resetState(false);
    }

    function resetState(clearFileName = true) {
        // console.log("Resetting state...");
        zip = null; sortedImageFiles = []; currentPageIndex = 0;
        Object.values(preloadedBlobs).forEach(URL.revokeObjectURL); preloadedBlobs = {};
        currentImageElement = null;
        currentZoom = 1.0; isFitMode = true; isPanning = false; didPan = false; isTransitioning = false;
        if (clearFileName) fileNameDisplay.textContent = 'No file selected';
    }

    function resetViewer() {
        // console.log("Resetting viewer UI...");
        fileSelector.style.display = 'block';
        imageDisplayArea.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');
        statusOverlay.style.display = 'none';
        imageContainer.innerHTML = ''; // Clear image elements reliably
        imageContainer.scrollTop = 0; imageContainer.scrollLeft = 0;
        resetState(true);
        fileInput.value = '';
        updateUIState();
        hideControls();
    }

    function applyZoom(centerPoint = null) {
        if (!currentImageElement || !currentImageElement.naturalWidth || isFitMode) return;

        const img = currentImageElement;
        const container = imageContainer;
        const oldScrollLeft = container.scrollLeft; const oldScrollTop = container.scrollTop;
        const oldWidth = img.offsetWidth; const oldHeight = img.offsetHeight;
        const newWidth = img.naturalWidth * currentZoom; const newHeight = img.naturalHeight * currentZoom;

        // Calculate target point relative to container viewport
        let targetX = centerPoint ? centerPoint.x - container.getBoundingClientRect().left : container.clientWidth / 2;
        let targetY = centerPoint ? centerPoint.y - container.getBoundingClientRect().top : container.clientHeight / 2;
        // Clamp target point within viewport bounds
        let vpX = Math.max(0, Math.min(container.clientWidth, targetX));
        let vpY = Math.max(0, Math.min(container.clientHeight, targetY));
        // Calculate the point within the scrollable content
        let contentX = oldScrollLeft + vpX; let contentY = oldScrollTop + vpY;
        // Calculate the ratio of the target point within the old content size
        let ratioX = oldWidth > 0 ? contentX / oldWidth : 0.5;
        let ratioY = oldHeight > 0 ? contentY / oldHeight : 0.5;
        // Calculate new scroll position to keep the ratio point at the viewport point
        let newScrollLeft = (ratioX * newWidth) - vpX;
        let newScrollTop = (ratioY * newHeight) - vpY;

        // Apply new dimensions FIRST
        img.style.width = `${newWidth}px`; img.style.height = `${newHeight}px`;
        img.style.maxWidth = 'none'; img.style.maxHeight = 'none'; // Allow explicit size
        // img.style.border = ''; // Optionally remove debug border on zoom

        // Apply new scroll position AFTER layout potentially changes
        container.scrollLeft = newScrollLeft; container.scrollTop = newScrollTop;

        updateUIState(); // Update zoom % display and button states
    }

    function zoomIn(e = null) {
        const oldFitMode = isFitMode;
        isFitMode = false; // Exit fit mode
        currentZoom = oldFitMode ? 1.0 + ZOOM_STEP : Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        const centerPoint = e ? { x: e.clientX, y: e.clientY } : null;
        applyZoom(centerPoint);
    }

    function zoomOut(e = null) {
        if (isFitMode) return; // Cannot zoom out from fit mode using button
        isFitMode = false;
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        const centerPoint = e ? { x: e.clientX, y: e.clientY } : null;
        applyZoom(centerPoint);
        // Check if we should revert to fit mode automatically
        if (currentImageElement && currentImageElement.naturalWidth * currentZoom <= imageContainer.clientWidth && currentImageElement.naturalHeight * currentZoom <= imageContainer.clientHeight) {
            zoomFit(false); // Auto-fit if zoomed out enough
        }
    }

    function zoomFit(triggerControlShow = true) {
        if (!currentImageElement) return;
        // console.log("Applying zoomFit");
        isFitMode = true;
        currentZoom = 1.0; // Reset logical zoom

        const img = currentImageElement;
        // Reset styles to allow CSS containment via max-width/height
        img.style.width = ''; img.style.height = '';
        img.style.maxWidth = '100%'; img.style.maxHeight = '100%';
        // img.style.border = ''; // Optionally remove debug border when fitting

        // Center the view using requestAnimationFrame
        requestAnimationFrame(() => {
            imageContainer.scrollTop = (imageContainer.scrollHeight - imageContainer.clientHeight) / 2;
            imageContainer.scrollLeft = (imageContainer.scrollWidth - imageContainer.clientWidth) / 2;
            // console.log("zoomFit scroll centered.");
            updateUIState();
            if (triggerControlShow) showControls();
        });
    }

    function getEventCoordinates(e) {
         if (e.touches && e.touches.length > 0) { return { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
         return { x: e.clientX, y: e.clientY };
    }

    function handlePanStart(e) {
        if (e.type === 'mousedown' && e.button !== 0) return;
        // Allow panning only if NOT in fit mode AND image is scrollable
        if (isFitMode || (imageContainer.scrollWidth <= imageContainer.clientWidth && imageContainer.scrollHeight <= imageContainer.clientHeight)) { return; }
        if (e.type === 'touchstart') e.preventDefault();
        isPanning = true; didPan = false;
        const coords = getEventCoordinates(e);
        panStartX = coords.x; panStartY = coords.y;
        scrollLeftStart = imageContainer.scrollLeft; scrollTopStart = imageContainer.scrollTop;
        imageContainer.style.cursor = 'grabbing';
    }

    function handlePanMove(e) {
        if (!isPanning) return; e.preventDefault();
        const coords = getEventCoordinates(e);
        const deltaX = coords.x - panStartX; const deltaY = coords.y - panStartY;
        if (!didPan && (Math.abs(deltaX) > PAN_THRESHOLD || Math.abs(deltaY) > PAN_THRESHOLD)) {
            didPan = true; showControls();
        }
        if (didPan) {
            imageContainer.scrollLeft = scrollLeftStart - deltaX; imageContainer.scrollTop = scrollTopStart - deltaY;
        }
    }

    function handlePanEnd(e) {
         if (!isPanning) return; isPanning = false;
         imageContainer.style.cursor = 'grab'; // Reset cursor
    }

    function handleContainerClick(e) {
        if (didPan || isTransitioning) { didPan = false; return; }
        if (e.target !== imageContainer || controlsOverlay.contains(e.target)) { return; }
        if (sortedImageFiles.length === 0 || !currentImageElement) return;
        const containerRect = imageContainer.getBoundingClientRect();
        const imageRect = currentImageElement.getBoundingClientRect();
        const clickX = e.clientX;
        const buffer = 5;
        const leftNavZoneEnd = Math.max(containerRect.left + buffer, imageRect.left - buffer);
        const rightNavZoneStart = Math.min(containerRect.right - buffer, imageRect.right + buffer);
        if (clickX >= containerRect.left && clickX < leftNavZoneEnd) {
            goToPrevPage(); showControls();
        } else if (clickX > rightNavZoneStart && clickX <= containerRect.right) {
            goToNextPage(); showControls();
        }
    }

    function handleKeyDown(e) {
        if (isTransitioning || !zip || sortedImageFiles.length === 0) return;
        if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) return; // Allow browser zoom

        let handled = true;
        switch (e.key) {
            case 'ArrowLeft': case 'PageUp': goToPrevPage(); break;
            case 'ArrowRight': case 'PageDown': goToNextPage(); break;
            case 'Home': if (currentPageIndex !== 0) displayPage(0); break;
            case 'End': if (currentPageIndex !== sortedImageFiles.length - 1) displayPage(sortedImageFiles.length - 1); break;
            case '+': case '=': zoomIn(e); break; // Pass event for potential cursor zoom
            case '-': case '_': zoomOut(e); break;// Pass event for potential cursor zoom
            case '0': zoomFit(true); break;
            default: handled = false; break;
        }
        if (handled) { e.preventDefault(); showControls(); }
    }

    function showControls(force = false) {
        if (force || mouseNearBottom || controlsOverlay.matches(':hover')) {
            controlsOverlay.classList.add('controls-visible');
            controlsVisible = true;
        }
    }

    function hideControls() {
        if (!mouseNearBottom && !controlsOverlay.matches(':hover')) {
            controlsOverlay.classList.remove('controls-visible');
            controlsVisible = false;
        }
    }

    function handleMouseMoveForControls(e) {
        const mouseY = e.clientY;
        const threshold = window.innerHeight - CONTROLS_BOTTOM_THRESHOLD;
        mouseNearBottom = (mouseY >= threshold);
        if (mouseNearBottom) { showControls(); }
        else { if (!controlsOverlay.matches(':hover')) { hideControls(); } }
    }

    // --- Initial Setup ---
    resetViewer();
    // console.log("CBZ Viewer Initialized.");

}); // End DOMContentLoaded