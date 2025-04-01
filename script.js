document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const viewerContainer = document.getElementById('viewerContainer');
    const fileSelector = document.getElementById('fileSelector');
    const openFileButton = document.getElementById('openFileButton'); // The button
    const fileInput = document.getElementById('fileInput');        // The hidden input
    const imageDisplayArea = document.getElementById('imageDisplayArea');
    const imageContainer = document.getElementById('imageContainer'); // Pannable area
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
    let currentImageElement = null; // The currently visible <img> element
    let preloadedNextBlobUrl = null;
    let preloadedPrevBlobUrl = null;
    let isTransitioning = false; // Prevent actions during page transition
    let currentZoom = 1.0;
    let isFitMode = true; // Track if we are in 'fit' state
    let isPanning = false;
    let panStartX, panStartY, scrollLeftStart, scrollTopStart;
    let didPan = false;
    let controlsVisible = false;
    let mouseNearBottom = false;

    // --- Constants ---
    const ZOOM_STEP = 0.2;
    const MAX_ZOOM = 8.0; // Increased max zoom
    const MIN_ZOOM = 0.1;
    const PAN_THRESHOLD = 5;
    const CONTROLS_BOTTOM_THRESHOLD = 60; // Pixels from bottom edge to show controls

    // --- Event Listeners ---
    openFileButton.addEventListener('click', () => fileInput.click()); // Trigger hidden input
    fileInput.addEventListener('change', handleFileSelect);
    prevPageButton.addEventListener('click', goToPrevPage);
    nextPageButton.addEventListener('click', goToNextPage);
    zoomInButton.addEventListener('click', zoomIn);
    zoomOutButton.addEventListener('click', zoomOut);
    zoomFitButton.addEventListener('click', () => zoomFit(true)); // Explicitly trigger UI update
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

    // Controls Visibility Listeners
    document.addEventListener('mousemove', handleMouseMoveForControls);
    controlsOverlay.addEventListener('mouseenter', () => showControls(true)); // Force show on hover
    controlsOverlay.addEventListener('mouseleave', () => { if (!mouseNearBottom) hideControls(); });


    // --- Functions ---

    function handleFileSelect(event) { /* ... (same as before, ensures resetViewer called) ... */
        const file = event.target.files[0];
        resetViewer(); // Reset first

        if (!file) { return; }
        fileNameDisplay.textContent = file.name;

        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError('Error: Please select a .cbz file.');
            fileInput.value = '';
            return;
        }
        fileSelector.style.display = 'none';
        statusOverlay.style.display = 'flex'; // Show initial loading
        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = 'Loading Book...'; // Specific message
        errorIndicator.style.display = 'none';
        imageDisplayArea.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');

        const reader = new FileReader();
        reader.onload = (e) => loadZip(e.target.result);
        reader.onerror = (e) => { console.error("File reading error:", e); showError('Error reading file.'); };
        reader.readAsArrayBuffer(file);
    }

    async function loadZip(arrayBuffer) { /* ... (zip loading/sorting same as before) ... */
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

            currentPageIndex = 0;
            // Load the first page directly, don't wait for preload here
            await displayPage(currentPageIndex, true); // true = initial load

            statusOverlay.style.display = 'none';
            imageDisplayArea.style.display = 'flex'; // Show image area
            // Don't show controls immediately, wait for mouse interaction

        } catch (error) { /* ... (error handling same) ... */
             console.error("JSZip error:", error);
             showError(`Error loading CBZ: ${error.message || 'Unknown error'}`);
        }
    }

    // --- Page Display & Preloading ---
    async function displayPage(index, isInitialLoad = false) {
        if (!zip || index < 0 || index >= sortedImageFiles.length || isTransitioning) return;

        isTransitioning = true;
        currentPageIndex = index;

        // Determine which blob URL to use (preloaded or load now)
        let targetBlobUrl = null;
        let blobSource = 'load'; // 'preload-next', 'preload-prev', 'load'

        if (!isInitialLoad && index === currentPageIndex + 1 && preloadedNextBlobUrl) {
            targetBlobUrl = preloadedNextBlobUrl;
            blobSource = 'preload-next';
            preloadedNextBlobUrl = null; // Consume preloaded URL
        } else if (!isInitialLoad && index === currentPageIndex - 1 && preloadedPrevBlobUrl) {
            targetBlobUrl = preloadedPrevBlobUrl;
            blobSource = 'preload-prev';
            preloadedPrevBlobUrl = null; // Consume preloaded URL
        } else {
            // Load needed page now (if not preloaded or initial)
            try {
                 // Show subtle loading state *only* if loading takes time? Maybe not needed with preload.
                 const fileEntry = sortedImageFiles[index].entry;
                 const blob = await fileEntry.async('blob');
                 targetBlobUrl = URL.createObjectURL(blob);
                 blobSource = 'load';
            } catch (error) {
                 console.error("Error loading page blob:", error);
                 showError(`Error loading page ${index + 1}: ${error.message}`);
                 isTransitioning = false;
                 return; // Stop transition on error
            }
        }

         // Create the new image element
         const newImage = document.createElement('img');
         newImage.alt = `Comic Page ${index + 1}`;
         newImage.style.opacity = 0; // Start hidden for fade-in

         // Keep track of the old image for fade-out
         const oldImage = currentImageElement;

         currentImageElement = newImage; // Update global reference

         // Add the new image to the container
         imageContainer.appendChild(newImage);

         // --- Image Load Promise ---
         await new Promise((resolve, reject) => {
             newImage.onload = () => {
                 // Apply Fit mode AFTER image dimensions are known
                 zoomFit(false); // Apply fit styles without triggering UI show immediately
                 resolve();
             };
             newImage.onerror = () => {
                 console.error(`Error rendering image: ${sortedImageFiles[index]?.path}`);
                 showError(`Error rendering page ${index + 1}`);
                 // Clean up failed image element
                 if (imageContainer.contains(newImage)) {
                     imageContainer.removeChild(newImage);
                 }
                 // Attempt to restore old image if possible
                 currentImageElement = oldImage;
                 if (oldImage) oldImage.classList.add('visible');
                 reject(new Error(`Error rendering image`));
             };
             newImage.src = targetBlobUrl; // Set src AFTER attaching handlers
         });
         // --- End Image Load Promise ---


         // --- Transition ---
         // Fade in the new image
         requestAnimationFrame(() => { // Ensure styles are applied before transition starts
            newImage.classList.add('visible');
         });

         // Fade out the old image (if exists)
         if (oldImage) {
            oldImage.classList.remove('visible');
            oldImage.classList.add('fading-out');
            // Remove old image after transition completes
            oldImage.addEventListener('transitionend', () => {
                if (imageContainer.contains(oldImage)) {
                    imageContainer.removeChild(oldImage);
                }
                // Revoke old blob URL *unless* it's needed for preload
                const oldBlobSrc = oldImage.src;
                if (oldBlobSrc && oldBlobSrc !== preloadedNextBlobUrl && oldBlobSrc !== preloadedPrevBlobUrl) {
                    URL.revokeObjectURL(oldBlobSrc);
                }
            }, { once: true });
         }

         // Update UI elements
         updateUIState();
         isTransitioning = false; // Allow actions again

         // Start preloading next/prev pages *after* current page is displayed
         preloadAdjacentPages(index);

         // Don't revoke the targetBlobUrl immediately if it came from preload cache
         if (blobSource === 'load' && targetBlobUrl) {
             // We might need this if user immediately goes back/forth
             // Let's manage it via the preload cache instead
             // URL.revokeObjectURL(targetBlobUrl); // Delay revoke
         }
    }

    function preloadAdjacentPages(currentIndex) {
        // Clear previous preloads first
        if (preloadedNextBlobUrl) URL.revokeObjectURL(preloadedNextBlobUrl);
        if (preloadedPrevBlobUrl) URL.revokeObjectURL(preloadedPrevBlobUrl);
        preloadedNextBlobUrl = null;
        preloadedPrevBlobUrl = null;

        // Preload next page
        const nextIndex = currentIndex + 1;
        if (nextIndex < sortedImageFiles.length) {
            sortedImageFiles[nextIndex].entry.async('blob').then(blob => {
                // Check if still relevant (user might have navigated quickly)
                if (currentPageIndex === currentIndex) {
                    preloadedNextBlobUrl = URL.createObjectURL(blob);
                } else {
                    URL.revokeObjectURL(URL.createObjectURL(blob)); // Not needed, revoke immediately
                }
            }).catch(err => console.warn("Preload next failed:", err));
        }

        // Preload previous page
        const prevIndex = currentIndex - 1;
        if (prevIndex >= 0) {
            sortedImageFiles[prevIndex].entry.async('blob').then(blob => {
                // Check if still relevant
                 if (currentPageIndex === currentIndex) {
                     preloadedPrevBlobUrl = URL.createObjectURL(blob);
                 } else {
                     URL.revokeObjectURL(URL.createObjectURL(blob));
                 }
            }).catch(err => console.warn("Preload prev failed:", err));
        }
    }


    function goToPrevPage() { if (!isTransitioning && currentPageIndex > 0) displayPage(currentPageIndex - 1); }
    function goToNextPage() { if (!isTransitioning && currentPageIndex < sortedImageFiles.length - 1) displayPage(currentPageIndex + 1); }

    function updateUIState() { /* ... (same logic as before, disable buttons at ends) ... */
        if (sortedImageFiles.length > 0) {
            pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${sortedImageFiles.length}`;
            prevPageButton.disabled = currentPageIndex === 0;
            nextPageButton.disabled = currentPageIndex === sortedImageFiles.length - 1;
        } else { /* ... */ }
        updateZoomDisplay(); // Update zoom state too
    }
    function updateZoomDisplay() { /* ... (same logic, update text/button disabled state) ... */
         zoomLevelDisplay.textContent = isFitMode ? 'Fit' : `${Math.round(currentZoom * 100)}%`;
         zoomInButton.disabled = isFitMode ? false : currentZoom >= MAX_ZOOM; // Always allow zoom in from fit
         zoomOutButton.disabled = isFitMode ? true : currentZoom <= MIN_ZOOM; // Disable zoom out in fit mode
         zoomFitButton.disabled = isFitMode; // Disable fit button if already fitted
    }

    function showError(message) { /* ... (same logic) ... */
        statusOverlay.style.display = 'flex';
        loadingIndicator.style.display = 'none';
        errorIndicator.textContent = message;
        errorIndicator.style.display = 'block';
        imageDisplayArea.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');
        resetState(false);
    }
    function resetState(clearFileName = true) { /* ... (clear state vars, revoke blobs) ... */
         zip = null;
         sortedImageFiles = [];
         currentPageIndex = 0;
         if (currentImageElement && imageContainer.contains(currentImageElement)) {
              imageContainer.removeChild(currentImageElement);
              if (currentImageElement.src.startsWith('blob:')) URL.revokeObjectURL(currentImageElement.src);
         }
         currentImageElement = null;
         if (preloadedNextBlobUrl) URL.revokeObjectURL(preloadedNextBlobUrl);
         if (preloadedPrevBlobUrl) URL.revokeObjectURL(preloadedPrevBlobUrl);
         preloadedNextBlobUrl = null; preloadedPrevBlobUrl = null;
         currentZoom = 1.0; isFitMode = true; isPanning = false; didPan = false;
         if (clearFileName) fileNameDisplay.textContent = 'No file selected';
    }
    function resetViewer() { /* ... (reset UI to initial file select state) ... */
        fileSelector.style.display = 'block';
        imageDisplayArea.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');
        statusOverlay.style.display = 'none';
        imageContainer.innerHTML = ''; // Clear any leftover images
        imageContainer.scrollTop = 0; imageContainer.scrollLeft = 0;
        resetState(true);
        fileInput.value = '';
        updateUIState();
        hideControls(); // Ensure controls start hidden
    }


    // --- Zoom ---
    function applyZoom(centerPoint = null) {
        if (!currentImageElement || !currentImageElement.naturalWidth) return; // Need image dimensions

        isFitMode = false; // Any manual zoom exits fit mode

        const img = currentImageElement;
        const container = imageContainer;
        const oldScrollLeft = container.scrollLeft;
        const oldScrollTop = container.scrollTop;
        const oldWidth = img.offsetWidth;
        const oldHeight = img.offsetHeight;

        // Calculate new dimensions
        const newWidth = img.naturalWidth * currentZoom;
        const newHeight = img.naturalHeight * currentZoom;

        // --- Calculate scroll adjustment to keep point under cursor stable ---
        let targetX = centerPoint ? centerPoint.x : container.clientWidth / 2;
        let targetY = centerPoint ? centerPoint.y : container.clientHeight / 2;

        // Point relative to the container viewport
        let vpX = targetX;
        let vpY = targetY;

        // Point relative to the scaled image content
        let contentX = oldScrollLeft + vpX;
        let contentY = oldScrollTop + vpY;

        // Point relative to the unscaled image (percentage)
        let ratioX = contentX / oldWidth;
        let ratioY = contentY / oldHeight;

        // New scroll position to keep that point at the same viewport position
        let newScrollLeft = (ratioX * newWidth) - vpX;
        let newScrollTop = (ratioY * newHeight) - vpY;

        // Apply new dimensions (important for scroll calculation)
        img.style.width = `${newWidth}px`;
        img.style.height = `${newHeight}px`;
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';

        // Apply new scroll position *after* dimensions change layout
        container.scrollLeft = newScrollLeft;
        container.scrollTop = newScrollTop;

        updateUIState(); // Update zoom % display and button states
        // No need to trigger control show, zoom actions imply user interaction
    }

    function zoomIn(e = null) {
        const oldZoom = currentZoom;
        currentZoom = Math.min(isFitMode ? 1.0 + ZOOM_STEP : currentZoom + ZOOM_STEP, MAX_ZOOM); // Start from 1.0 if fitting
        const centerPoint = e ? { x: e.clientX, y: e.clientY } : null; // Zoom towards cursor if event available
        applyZoom(centerPoint);
    }

    function zoomOut(e = null) {
        if (isFitMode) return; // Cannot zoom out further than fit
        const oldZoom = currentZoom;
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        const centerPoint = e ? { x: e.clientX, y: e.clientY } : null;
        applyZoom(centerPoint);
        // Check if zoomed out enough to trigger 'fit' again
        if (currentImageElement &&
            currentImageElement.naturalWidth * currentZoom <= imageContainer.clientWidth &&
            currentImageElement.naturalHeight * currentZoom <= imageContainer.clientHeight) {
            zoomFit(false); // Re-fit if zoomed out sufficiently
        }
    }

    function zoomFit(triggerControlShow = true) {
        if (!currentImageElement) return;
        isFitMode = true;
        currentZoom = 1.0; // Reset logical zoom level

        const img = currentImageElement;
        img.style.width = ''; // Reset to CSS defaults
        img.style.height = '';
        img.style.maxWidth = '100%';
        img.style.maxHeight = '100%';

        // Center the view after fit
        requestAnimationFrame(() => { // Ensure layout is updated
            imageContainer.scrollTop = (imageContainer.scrollHeight - imageContainer.clientHeight) / 2;
            imageContainer.scrollLeft = (imageContainer.scrollWidth - imageContainer.clientWidth) / 2;
             updateUIState(); // Update display after centering
             if (triggerControlShow) showControls();
        });
    }


    // --- Panning ---
    function getEventCoordinates(e) { /* ... (same as before) ... */
         if (e.touches && e.touches.length > 0) { return { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
         return { x: e.clientX, y: e.clientY };
    }

    function handlePanStart(e) { /* ... (same checks, grab start pos/scroll) ... */
        if (e.type === 'mousedown' && e.button !== 0) return;
        // Only pan if image is actually scrollable
        if (imageContainer.scrollWidth <= imageContainer.clientWidth &&
            imageContainer.scrollHeight <= imageContainer.clientHeight) { return; }
        if (e.type === 'touchstart') e.preventDefault();

        isPanning = true;
        didPan = false;
        const coords = getEventCoordinates(e);
        panStartX = coords.x; panStartY = coords.y;
        scrollLeftStart = imageContainer.scrollLeft; scrollTopStart = imageContainer.scrollTop;
        imageContainer.style.cursor = 'grabbing'; // Set cursor immediately
        // Don't show controls on pan start, wait for move
    }

    function handlePanMove(e) { /* ... (calculate delta, apply scroll, set didPan flag) ... */
        if (!isPanning) return;
        e.preventDefault();

        const coords = getEventCoordinates(e);
        const deltaX = coords.x - panStartX;
        const deltaY = coords.y - panStartY;

        if (!didPan && (Math.abs(deltaX) > PAN_THRESHOLD || Math.abs(deltaY) > PAN_THRESHOLD)) {
            didPan = true;
            showControls(); // Show controls once pan confirmed
        }
        if (didPan) {
            imageContainer.scrollLeft = scrollLeftStart - deltaX;
            imageContainer.scrollTop = scrollTopStart - deltaY;
        }
    }

    function handlePanEnd(e) { /* ... (reset flags, reset cursor) ... */
        if (!isPanning) return;
        isPanning = false;
        imageContainer.style.cursor = 'grab'; // Reset cursor
        // Click handling logic takes care of navigation if !didPan
    }

    // --- Click Navigation ---
    function handleContainerClick(e) { /* ... (same logic, check didPan, check target, check bounds) ... */
        if (didPan || isTransitioning) { didPan = false; return; }
        if (e.target !== imageContainer || controlsOverlay.contains(e.target)) { return; } // Click must be on container background
        if (sortedImageFiles.length === 0 || !currentImageElement) return;

        const containerRect = imageContainer.getBoundingClientRect();
        const imageRect = currentImageElement.getBoundingClientRect(); // Get current image bounds
        const clickX = e.clientX;

        // Buffer calculation might need adjustment depending on layout
        const buffer = 5;
        const leftNavZoneEnd = Math.max(containerRect.left + buffer, imageRect.left - buffer);
        const rightNavZoneStart = Math.min(containerRect.right - buffer, imageRect.right + buffer);

        if (clickX >= containerRect.left && clickX < leftNavZoneEnd) {
            goToPrevPage();
            showControls();
        } else if (clickX > rightNavZoneStart && clickX <= containerRect.right) {
            goToNextPage();
            showControls();
        }
    }

    // --- Keyboard Navigation ---
    function handleKeyDown(e) { /* ... (same logic, ensure isTransitioning check added) ... */
        if (isTransitioning || !zip || sortedImageFiles.length === 0) return;
        if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '_', '0'].includes(e.key)) return; // Allow browser zoom

        let handled = true;
        switch (e.key) {
            case 'ArrowLeft': case 'PageUp': goToPrevPage(); break;
            case 'ArrowRight': case 'PageDown': goToNextPage(); break;
            case 'Home': if (currentPageIndex !== 0) displayPage(0); break;
            case 'End': if (currentPageIndex !== sortedImageFiles.length - 1) displayPage(sortedImageFiles.length - 1); break;
            case '+': case '=': zoomIn(); break;
            case '-': case '_': zoomOut(); break;
            case '0': zoomFit(true); break;
            default: handled = false; break;
        }
        if (handled) { e.preventDefault(); showControls(); }
    }

    // --- Controls Visibility ---
    function showControls(force = false) {
        if (force || mouseNearBottom || controlsOverlay.matches(':hover')) {
            controlsOverlay.classList.add('controls-visible');
            controlsVisible = true;
        }
    }
    function hideControls() {
         // Only hide if mouse isn't near bottom AND not hovering controls
        if (!mouseNearBottom && !controlsOverlay.matches(':hover')) {
            controlsOverlay.classList.remove('controls-visible');
            controlsVisible = false;
        }
    }
    function handleMouseMoveForControls(e) {
        const mouseY = e.clientY;
        const threshold = window.innerHeight - CONTROLS_BOTTOM_THRESHOLD;
        mouseNearBottom = (mouseY >= threshold);

        if (mouseNearBottom) {
            showControls();
        } else {
            // Don't hide immediately, only if mouse leaves hover area too
            if (!controlsOverlay.matches(':hover')) {
                 hideControls();
            }
        }
    }

    // --- Initial Setup ---
    resetViewer();

}); // End DOMContentLoaded