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
    let currentImageElement = null; // The currently visible <img>
    let preloadedBlobs = {}; // Cache: { index: blobUrl }
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
    const PRELOAD_AHEAD = 2; // How many pages ahead to preload
    const PRELOAD_BEHIND = 1; // How many pages behind to preload

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
        resetViewer(); // Reset everything first

        if (!file) { return; }
        fileNameDisplay.textContent = file.name; // Show filename immediately

        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError('Error: Please select a .cbz file.');
            fileInput.value = ''; // Allow re-selection
            return;
        }

        // Show initial loading indicator
        fileSelector.style.display = 'none';
        imageDisplayArea.style.display = 'none'; // Keep hidden until first page loads
        statusOverlay.style.display = 'flex';
        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = 'Loading Book...';
        errorIndicator.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');

        const reader = new FileReader();
        reader.onload = (e) => loadZip(e.target.result);
        reader.onerror = (e) => {
            console.error("File reading error:", e);
            showError('Error reading file.');
        };
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

            if (sortedImageFiles.length === 0) {
                showError('Error: No compatible images found in the CBZ file.'); return;
            }

            console.log(`Found ${sortedImageFiles.length} images.`);
            currentPageIndex = 0;

            // Make the image area ready *before* displaying the first page
            imageDisplayArea.style.display = 'flex';

            // Display the first page
            await displayPage(currentPageIndex); // No longer needs 'isInitialLoad' flag

            // Hide loading overlay *after* first page is ready
            statusOverlay.style.display = 'none';
            console.log("First page displayed.");
            // Controls remain hidden until mouse interaction

        } catch (error) {
            console.error("JSZip error:", error);
            showError(`Error loading CBZ: ${error.message || 'Unknown error'}`);
            // Ensure UI is reset if loading fails partway
            resetViewer(); // Or at least reset the display part
            imageDisplayArea.style.display = 'none';
            fileSelector.style.display = 'block';
        }
    }

    // --- Page Display & Preloading (Revised) ---
    async function displayPage(index) {
        if (!zip || index < 0 || index >= sortedImageFiles.length || isTransitioning) {
            console.warn("DisplayPage prevented:", { index, isTransitioning });
            return;
        }
        console.log(`Attempting to display page index: ${index}`);
        isTransitioning = true;
        currentPageIndex = index; // Update index immediately

        // Get blob URL (from cache or load)
        let targetBlobUrl = preloadedBlobs[index];
        let loadedNow = false;
        if (!targetBlobUrl) {
            try {
                console.log(`Loading blob for index: ${index}`);
                const fileEntry = sortedImageFiles[index].entry;
                const blob = await fileEntry.async('blob');
                targetBlobUrl = URL.createObjectURL(blob);
                preloadedBlobs[index] = targetBlobUrl; // Add to cache
                loadedNow = true;
                console.log(`Blob loaded for index: ${index}`);
            } catch (error) {
                console.error(`Error loading page ${index + 1} blob:`, error);
                showError(`Error loading page ${index + 1}: ${error.message}`);
                isTransitioning = false;
                // Attempt to clean up partially loaded blob if created
                if (targetBlobUrl && loadedNow) {
                    URL.revokeObjectURL(targetBlobUrl);
                    delete preloadedBlobs[index];
                }
                return; // Stop transition
            }
        } else {
             console.log(`Using cached blob for index: ${index}`);
        }

        // Create the new image element
        const newImage = document.createElement('img');
        newImage.alt = `Comic Page ${index + 1}`;
        newImage.style.opacity = 0; // Start hidden

        const oldImage = currentImageElement;
        currentImageElement = newImage; // Update global reference *before* load starts

        // Add new image to container (it's hidden initially)
        imageContainer.appendChild(newImage);

        try {
            // Wait for image to decode and be ready
            await new Promise((resolve, reject) => {
                newImage.onload = () => {
                     console.log(`Image ${index + 1} loaded successfully.`);
                     resolve(); // Image data is ready
                 };
                newImage.onerror = (err) => {
                     console.error(`Error loading image src for page ${index + 1}:`, err);
                     reject(new Error(`Failed to load image for page ${index + 1}`));
                 };
                 newImage.src = targetBlobUrl; // Set src AFTER attaching handlers
             });

             // Image loaded successfully, proceed with display logic

             // Apply fit mode by default to the new image BEFORE making visible
             zoomFit(false); // false = don't trigger control visibility logic

             // --- Transition ---
             requestAnimationFrame(() => {
                 newImage.classList.add('visible'); // Start fade-in transition
                 console.log(`Added 'visible' class to image ${index + 1}`);

                 if (oldImage) {
                     console.log("Fading out old image.");
                     oldImage.classList.remove('visible');
                     oldImage.classList.add('fading-out');
                     // Clean up old image after transition
                     oldImage.addEventListener('transitionend', () => {
                         if (imageContainer.contains(oldImage)) {
                             imageContainer.removeChild(oldImage);
                             console.log("Removed old image from DOM.");
                         }
                     }, { once: true });
                 }
                 // Transition complete (visually) after opacity change duration
                  setTimeout(() => {
                      isTransitioning = false;
                      console.log(`Transition complete for page ${index + 1}.`);
                      // Start preloading *after* transition seems complete
                      preloadAdjacentPages(index);
                      // Update UI state (buttons, page number)
                      updateUIState();
                  }, 250); // Match CSS opacity transition duration

             }); // End requestAnimationFrame

        } catch (error) {
            // Handle errors from the promise (e.g., onerror)
            console.error("Error during image display promise:", error);
            showError(error.message || `Error displaying page ${index + 1}`);
            // Clean up the failed new image element
            if (imageContainer.contains(newImage)) {
                imageContainer.removeChild(newImage);
            }
             // Try to restore the previous image if possible
             if(oldImage) currentImageElement = oldImage;
             else currentImageElement = null;

            isTransitioning = false;
            updateUIState(); // Update UI to reflect possible state change
        }
    }

    function preloadAdjacentPages(currentIndex) {
        // Determine range of pages to preload
        const preloadStart = Math.max(0, currentIndex - PRELOAD_BEHIND);
        const preloadEnd = Math.min(sortedImageFiles.length - 1, currentIndex + PRELOAD_AHEAD);

        // Prune blobs outside the new preload window
        Object.keys(preloadedBlobs).forEach(keyIndexStr => {
             const keyIndex = parseInt(keyIndexStr, 10);
             if (keyIndex < preloadStart || keyIndex > preloadEnd) {
                  console.log(`Pruning blob cache for index: ${keyIndex}`);
                  URL.revokeObjectURL(preloadedBlobs[keyIndex]);
                  delete preloadedBlobs[keyIndex];
             }
         });


        // Preload pages within the window if not already cached
        for (let i = preloadStart; i <= preloadEnd; i++) {
            if (i !== currentIndex && !preloadedBlobs[i]) {
                // Avoid preloading the current page again
                const pageIndexToLoad = i; // Capture index for async context
                console.log(`Preloading page index: ${pageIndexToLoad}`);
                sortedImageFiles[pageIndexToLoad].entry.async('blob')
                    .then(blob => {
                        // Double-check if still needed (user might have moved fast)
                         const currentPreloadStart = Math.max(0, currentPageIndex - PRELOAD_BEHIND);
                         const currentPreloadEnd = Math.min(sortedImageFiles.length - 1, currentPageIndex + PRELOAD_AHEAD);
                         if (pageIndexToLoad >= currentPreloadStart && pageIndexToLoad <= currentPreloadEnd) {
                             if (!preloadedBlobs[pageIndexToLoad]) { // Check again before adding
                                  preloadedBlobs[pageIndexToLoad] = URL.createObjectURL(blob);
                                  console.log(`Preload complete for index: ${pageIndexToLoad}`);
                             } else {
                                 URL.revokeObjectURL(URL.createObjectURL(blob)); // Already cached, discard new blob
                             }
                         } else {
                              console.log(`Preload for ${pageIndexToLoad} no longer needed, discarding.`);
                              URL.revokeObjectURL(URL.createObjectURL(blob)); // Revoke the newly created blob URL
                         }
                    })
                    .catch(err => console.warn(`Preload failed for index ${pageIndexToLoad}:`, err));
            }
        }
    }

    // --- Navigation ---
    function goToPrevPage() { if (!isTransitioning && currentPageIndex > 0) displayPage(currentPageIndex - 1); }
    function goToNextPage() { if (!isTransitioning && currentPageIndex < sortedImageFiles.length - 1) displayPage(currentPageIndex + 1); }

    // --- UI Updates ---
    function updateUIState() {
        if (sortedImageFiles.length > 0 && currentImageElement) { // Check if an image is actually displayed
            pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${sortedImageFiles.length}`;
            prevPageButton.disabled = currentPageIndex === 0 || isTransitioning;
            nextPageButton.disabled = currentPageIndex === sortedImageFiles.length - 1 || isTransitioning;
        } else {
            pageIndicator.textContent = 'Page 0 / 0';
            prevPageButton.disabled = true;
            nextPageButton.disabled = true;
        }
        // Always update zoom display
        updateZoomDisplay();
    }
    function updateZoomDisplay() {
         zoomLevelDisplay.textContent = isFitMode ? 'Fit' : `${Math.round(currentZoom * 100)}%`;
         zoomInButton.disabled = isTransitioning || (!isFitMode && currentZoom >= MAX_ZOOM);
         zoomOutButton.disabled = isTransitioning || isFitMode || currentZoom <= MIN_ZOOM;
         zoomFitButton.disabled = isTransitioning || isFitMode;
    }

    // --- Error Handling & Reset ---
    function showError(message) { /* ... same ... */
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
        console.log("Resetting state...");
        zip = null;
        sortedImageFiles = [];
        currentPageIndex = 0;
        // Revoke all cached blobs
        Object.values(preloadedBlobs).forEach(URL.revokeObjectURL);
        preloadedBlobs = {};
        currentImageElement = null; // Reference cleared
        currentZoom = 1.0; isFitMode = true; isPanning = false; didPan = false; isTransitioning = false;
        if (clearFileName) fileNameDisplay.textContent = 'No file selected';
        // Clear image container in resetViewer instead
    }
    function resetViewer() {
        console.log("Resetting viewer UI...");
        fileSelector.style.display = 'block';
        imageDisplayArea.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');
        statusOverlay.style.display = 'none';
        imageContainer.innerHTML = ''; // Clear any leftover image elements reliably
        imageContainer.scrollTop = 0; imageContainer.scrollLeft = 0;
        resetState(true);
        fileInput.value = '';
        updateUIState();
        hideControls();
    }

    // --- Zoom (Revised Fit logic) ---
    function applyZoom(centerPoint = null) { /* ... same logic for calculating scroll adjustment ... */
        if (!currentImageElement || !currentImageElement.naturalWidth) return;
        isFitMode = false;
        // ... (rest of calculation same as before: get old/new dimensions, calc ratios, set width/height, set scroll) ...
         const img = currentImageElement;
         const container = imageContainer;
         const oldScrollLeft = container.scrollLeft;
         const oldScrollTop = container.scrollTop;
         const oldWidth = img.offsetWidth;
         const oldHeight = img.offsetHeight;

         const newWidth = img.naturalWidth * currentZoom;
         const newHeight = img.naturalHeight * currentZoom;

         let targetX = centerPoint ? centerPoint.x - container.getBoundingClientRect().left : container.clientWidth / 2;
         let targetY = centerPoint ? centerPoint.y - container.getBoundingClientRect().top : container.clientHeight / 2;

         let vpX = Math.max(0, Math.min(container.clientWidth, targetX));
         let vpY = Math.max(0, Math.min(container.clientHeight, targetY));

         let contentX = oldScrollLeft + vpX;
         let contentY = oldScrollTop + vpY;

         let ratioX = oldWidth > 0 ? contentX / oldWidth : 0.5;
         let ratioY = oldHeight > 0 ? contentY / oldHeight : 0.5;

         let newScrollLeft = (ratioX * newWidth) - vpX;
         let newScrollTop = (ratioY * newHeight) - vpY;

         img.style.width = `${newWidth}px`;
         img.style.height = `${newHeight}px`;
         img.style.maxWidth = 'none';
         img.style.maxHeight = 'none';

         container.scrollLeft = newScrollLeft;
         container.scrollTop = newScrollTop;

        updateUIState();
    }
    function zoomIn(e = null) { /* ... same ... */
        const oldZoom = currentZoom;
        currentZoom = Math.min(isFitMode ? 1.0 + ZOOM_STEP : currentZoom + ZOOM_STEP, MAX_ZOOM);
        const centerPoint = e ? { x: e.clientX, y: e.clientY } : null;
        applyZoom(centerPoint);
    }
    function zoomOut(e = null) { /* ... same ... */
        if (isFitMode) return;
        const oldZoom = currentZoom;
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        const centerPoint = e ? { x: e.clientX, y: e.clientY } : null;
        applyZoom(centerPoint);
        if (currentImageElement && currentImageElement.naturalWidth * currentZoom <= imageContainer.clientWidth && currentImageElement.naturalHeight * currentZoom <= imageContainer.clientHeight) {
            zoomFit(false);
        }
    }
    function zoomFit(triggerControlShow = true) {
        if (!currentImageElement) return;
        console.log("Applying zoomFit");
        isFitMode = true;
        currentZoom = 1.0; // Reset logical zoom

        const img = currentImageElement;
        // Reset styles to allow CSS contain to work
        img.style.width = '';
        img.style.height = '';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';

        // Center the view - use requestAnimationFrame for layout update
        requestAnimationFrame(() => {
            imageContainer.scrollTop = (imageContainer.scrollHeight - imageContainer.clientHeight) / 2;
            imageContainer.scrollLeft = (imageContainer.scrollWidth - imageContainer.clientWidth) / 2;
            console.log("zoomFit scroll centered.");
            updateUIState();
            if (triggerControlShow) showControls();
        });
    }

    // --- Panning --- (No significant changes needed)
    function getEventCoordinates(e) { /* ... same ... */ }
    function handlePanStart(e) { /* ... same ... */
        if (e.type === 'mousedown' && e.button !== 0) return;
        if (imageContainer.scrollWidth <= imageContainer.clientWidth && imageContainer.scrollHeight <= imageContainer.clientHeight) { return; }
        if (e.type === 'touchstart') e.preventDefault();
        isPanning = true; didPan = false;
        const coords = getEventCoordinates(e);
        panStartX = coords.x; panStartY = coords.y;
        scrollLeftStart = imageContainer.scrollLeft; scrollTopStart = imageContainer.scrollTop;
        imageContainer.style.cursor = 'grabbing';
    }
    function handlePanMove(e) { /* ... same ... */
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
    function handlePanEnd(e) { /* ... same ... */
         if (!isPanning) return; isPanning = false;
         imageContainer.style.cursor = 'grab';
         // Click handler deals with !didPan case
    }

    // --- Click Navigation --- (No significant changes needed)
    function handleContainerClick(e) { /* ... same logic ... */
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

    // --- Keyboard Navigation --- (No changes needed)
    function handleKeyDown(e) { /* ... same ... */ }

    // --- Controls Visibility --- (No changes needed)
    function showControls(force = false) { /* ... same ... */ }
    function hideControls() { /* ... same ... */ }
    function handleMouseMoveForControls(e) { /* ... same ... */ }

    // --- Initial Setup ---
    resetViewer();
    console.log("CBZ Viewer Initialized.");

}); // End DOMContentLoaded