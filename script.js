document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const viewerContainer = document.getElementById('viewerContainer');
    const fileSelector = document.getElementById('fileSelector');
    const fileInput = document.getElementById('fileInput');
    const imageContainer = document.getElementById('imageContainer'); // Container is pannable
    const comicPage = document.getElementById('comicPage'); // The image itself
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
    let currentBlobUrl = null;
    let currentZoom = 1.0;
    let isPanning = false;
    let panStartX, panStartY, scrollLeftStart, scrollTopStart; // Renamed for clarity
    let controlsHideTimeout = null;
    let didPan = false; // Flag to distinguish click from pan/drag end

    // --- Constants ---
    const ZOOM_STEP = 0.2;
    const MAX_ZOOM = 6.0;
    const MIN_ZOOM = 0.1;
    const CONTROLS_HIDE_DELAY = 2500;
    const PAN_THRESHOLD = 5; // Pixels moved before it's considered a pan, not a click

    // --- Event Listeners ---
    fileInput.addEventListener('change', handleFileSelect);
    prevPageButton.addEventListener('click', goToPrevPage);
    nextPageButton.addEventListener('click', goToNextPage);
    zoomInButton.addEventListener('click', zoomIn);
    zoomOutButton.addEventListener('click', zoomOut);
    zoomFitButton.addEventListener('click', zoomFit);
    document.addEventListener('keydown', handleKeyDown);

    // Panning listeners on the CONTAINER
    imageContainer.addEventListener('mousedown', handlePanStart);
    imageContainer.addEventListener('mousemove', handlePanMove);
    imageContainer.addEventListener('mouseup', handlePanEnd);
    imageContainer.addEventListener('mouseleave', handlePanEnd); // End pan if mouse leaves container
    // Touch Panning listeners on the CONTAINER
    imageContainer.addEventListener('touchstart', handlePanStart, { passive: false });
    imageContainer.addEventListener('touchmove', handlePanMove, { passive: false });
    imageContainer.addEventListener('touchend', handlePanEnd);
    imageContainer.addEventListener('touchcancel', handlePanEnd);

    // Click Navigation listener on the CONTAINER
    imageContainer.addEventListener('click', handleContainerClick);

    // Controls auto-hide listeners
    viewerContainer.addEventListener('mousemove', showControlsTemporarily);
    viewerContainer.addEventListener('touchstart', showControlsTemporarily, { passive: true });
    controlsOverlay.addEventListener('mouseenter', cancelControlsHide);
    controlsOverlay.addEventListener('mouseleave', scheduleControlsHide);


    // --- Functions ---

    // handleFileSelect, loadZip: No changes needed
    function handleFileSelect(event) {
        const file = event.target.files[0];
        resetViewer(); // Reset first

        if (!file) {
            return; // No file selected
        }

        fileNameDisplay.textContent = file.name; // Update filename early

        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError('Error: Please select a .cbz file.');
            // Keep file input value visually but show error
            fileInput.value = ''; // Allow re-selection of same file if needed
            return;
        }

        // Show loading state
        fileSelector.style.display = 'none';
        statusOverlay.style.display = 'flex';
        loadingIndicator.style.display = 'block';
        errorIndicator.style.display = 'none';
        imageContainer.style.display = 'none'; // Hide image area while loading zip
        controlsOverlay.style.display = 'none'; // Hide controls initially

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
                showError('Error: No compatible images found in the CBZ file.');
                return;
            }

            currentPageIndex = 0;
            await displayPage(currentPageIndex);
            statusOverlay.style.display = 'none';
            imageContainer.style.display = 'flex'; // Make container visible
            controlsOverlay.style.display = 'flex';
            showControlsTemporarily();

        } catch (error) {
            console.error("JSZip error:", error);
            showError(`Error loading CBZ: ${error.message || 'Unknown error'}`);
        }
    }


    async function displayPage(index) {
        if (!zip || index < 0 || index >= sortedImageFiles.length) return;

        statusOverlay.style.display = 'flex';
        loadingIndicator.style.display = 'block';
        errorIndicator.style.display = 'none';
        comicPage.style.visibility = 'hidden';

        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }

        try {
            const fileEntry = sortedImageFiles[index].entry;
            const blob = await fileEntry.async('blob');
            currentBlobUrl = URL.createObjectURL(blob);

            // Ensure image element is sized correctly before showing
            comicPage.style.width = 'auto';
            comicPage.style.height = 'auto';
            comicPage.style.maxWidth = '100%'; // Reset max size constraints
            comicPage.style.maxHeight = '100%';


            await new Promise((resolve, reject) => {
                comicPage.onload = () => {
                    statusOverlay.style.display = 'none';
                    comicPage.style.visibility = 'visible';
                    resolve();
                };
                comicPage.onerror = () => {
                     showError(`Error loading image: ${fileEntry.name}`);
                     reject(new Error(`Error loading image: ${fileEntry.name}`));
                };
                comicPage.src = currentBlobUrl;
            });

             currentPageIndex = index;
             // Fit page *after* it's loaded and dimensions are known
             zoomFit(false); // Fit the new page initially (false = don't trigger control show)
             updateUIState();
             showControlsTemporarily();

        } catch (error) {
             console.error("Error displaying page:", error);
             statusOverlay.style.display = 'flex';
             loadingIndicator.style.display = 'none';
             if (!errorIndicator.textContent.includes(error.message)) {
                 showError(`Error displaying page ${index + 1}: ${error.message}`);
             }
        }
    }

    function goToPrevPage() {
        if (currentPageIndex > 0) {
            displayPage(currentPageIndex - 1);
        }
    }

    function goToNextPage() {
        if (currentPageIndex < sortedImageFiles.length - 1) {
            displayPage(currentPageIndex + 1);
        }
    }

    // updateUIState, showError, resetState, resetViewer: No major changes needed
    function updateUIState() {
        if (sortedImageFiles.length > 0) {
            pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${sortedImageFiles.length}`;
            prevPageButton.disabled = currentPageIndex === 0;
            nextPageButton.disabled = currentPageIndex === sortedImageFiles.length - 1;
        } else {
            pageIndicator.textContent = 'Page 0 / 0';
            prevPageButton.disabled = true;
            nextPageButton.disabled = true;
        }
        updateZoomDisplay();
    }
     function updateZoomDisplay() {
        zoomLevelDisplay.textContent = `${Math.round(currentZoom * 100)}%`;
        zoomInButton.disabled = currentZoom >= MAX_ZOOM;
        zoomOutButton.disabled = currentZoom <= MIN_ZOOM;
        // Cursor update now primarily handled by CSS on imageContainer
     }
    function showError(message) {
        statusOverlay.style.display = 'flex'; // Show status area
        loadingIndicator.style.display = 'none';
        errorIndicator.textContent = message;
        errorIndicator.style.display = 'block';
        imageContainer.style.display = 'none'; // Hide image area on error
        controlsOverlay.style.display = 'none'; // Hide controls on error
        resetState(false); // Reset logic state but keep filename
    }
    function resetState(clearFileName = true) {
         zip = null;
         sortedImageFiles = [];
         currentPageIndex = 0;
         if (currentBlobUrl) {
             URL.revokeObjectURL(currentBlobUrl);
             currentBlobUrl = null;
         }
         currentZoom = 1.0;
         isPanning = false;
         didPan = false;
         if (clearFileName) {
            fileNameDisplay.textContent = 'No file selected';
         }
    }
    function resetViewer() {
        // Reset UI to initial state
        fileSelector.style.display = 'block'; // Show file input area
        imageContainer.style.display = 'none';
        controlsOverlay.style.display = 'none';
        statusOverlay.style.display = 'none'; // Hide status area
        comicPage.src = ''; // Clear image source
        // Ensure image transform is reset
        comicPage.style.transform = 'scale(1.0)';
        // Reset scroll position of container
        imageContainer.scrollTop = 0;
        imageContainer.scrollLeft = 0;


        resetState(true); // Reset logic state and clear filename
        fileInput.value = ''; // Clear file input selection
        updateUIState(); // Update button states etc.
    }

    // --- Zoom ---
    function applyZoom(triggerControlShow = true) {
        // Set image dimensions based on zoom *before* applying transform
        // This helps the container calculate scroll dimensions correctly
        comicPage.style.width = `${comicPage.naturalWidth * currentZoom}px`;
        comicPage.style.height = `${comicPage.naturalHeight * currentZoom}px`;
        // Ensure max dimensions don't conflict if zoomed out extremely
        comicPage.style.maxWidth = 'none';
        comicPage.style.maxHeight = 'none';

        // Use transform for visual scaling (often smoother than changing width/height directly for rendering)
        // But setting width/height helps the scroll container. Let's stick to width/height for scroll calculation.
        // comicPage.style.transform = `scale(${currentZoom})`; NO - Use width/height

        updateZoomDisplay();
        if (triggerControlShow) {
            showControlsTemporarily();
        }
    }

    function zoomIn() {
        const oldZoom = currentZoom;
        currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        adjustScrollForZoom(oldZoom, currentZoom);
        applyZoom();
    }

    function zoomOut() {
        const oldZoom = currentZoom;
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        adjustScrollForZoom(oldZoom, currentZoom);
        applyZoom();
    }

    function zoomFit(triggerControlShow = true) {
        currentZoom = 1.0;
         // Reset dimensions to auto/contained
        comicPage.style.width = 'auto';
        comicPage.style.height = 'auto';
        comicPage.style.maxWidth = '100%';
        comicPage.style.maxHeight = '100%';
        // comicPage.style.transform = 'scale(1.0)'; // Reset transform if it was used

        // Recenter scrollbars after fitting
        // Needs a slight delay for layout reflow after style changes
        setTimeout(() => {
             imageContainer.scrollTop = (imageContainer.scrollHeight - imageContainer.clientHeight) / 2;
             imageContainer.scrollLeft = (imageContainer.scrollWidth - imageContainer.clientWidth) / 2;
        }, 0);

        updateZoomDisplay();
        if (triggerControlShow) {
            showControlsTemporarily();
        }
    }

     function adjustScrollForZoom(oldZoom, newZoom) {
         // Try to keep the center of the view focused when zooming
         const containerWidth = imageContainer.clientWidth;
         const containerHeight = imageContainer.clientHeight;

         // Point in the *content* that was at the center of the viewport
         const contentCenterX = imageContainer.scrollLeft + containerWidth / 2;
         const contentCenterY = imageContainer.scrollTop + containerHeight / 2;

         // Corresponding point in the *unscaled* image
         const imageX = contentCenterX / oldZoom;
         const imageY = contentCenterY / oldZoom;

         // New scroll position to keep that image point centered
         const newScrollLeft = (imageX * newZoom) - containerWidth / 2;
         const newScrollTop = (imageY * newZoom) - containerHeight / 2;

         imageContainer.scrollLeft = newScrollLeft;
         imageContainer.scrollTop = newScrollTop;
     }


    // --- Panning (Revised) ---
     function getEventCoordinates(e) {
         if (e.touches && e.touches.length > 0) {
             return { x: e.touches[0].clientX, y: e.touches[0].clientY }; // Use clientX/Y
         }
         return { x: e.clientX, y: e.clientY }; // Use clientX/Y
     }

    function handlePanStart(e) {
        // Allow panning only with primary button (left mouse)
        if (e.type === 'mousedown' && e.button !== 0) return;

        // Only pan if image is actually larger than container
        if (imageContainer.scrollWidth <= imageContainer.clientWidth &&
            imageContainer.scrollHeight <= imageContainer.clientHeight) {
            return;
        }

        if (e.type === 'touchstart') { e.preventDefault(); } // Prevent page scroll on touch

        isPanning = true;
        didPan = false; // Reset pan flag
        // No need to change cursor via JS, CSS :active handles it on container
        const coords = getEventCoordinates(e);
        panStartX = coords.x; // Start position of the cursor/touch
        panStartY = coords.y;
        scrollLeftStart = imageContainer.scrollLeft; // Initial scroll position
        scrollTopStart = imageContainer.scrollTop;
        // Don't show controls immediately, wait for move to confirm pan
        cancelControlsHide(); // Prevent hiding while interacting
    }

    function handlePanMove(e) {
        if (!isPanning) return;

        e.preventDefault(); // Prevent text selection or other default drag actions

        const coords = getEventCoordinates(e);
        const deltaX = coords.x - panStartX;
        const deltaY = coords.y - panStartY;

        // Check if movement exceeds threshold to be considered panning
        if (!didPan && (Math.abs(deltaX) > PAN_THRESHOLD || Math.abs(deltaY) > PAN_THRESHOLD)) {
            didPan = true; // It's definitely a pan now
             showControlsTemporarily(); // Show controls once panning starts
        }

         if (didPan) {
             imageContainer.scrollLeft = scrollLeftStart - deltaX;
             imageContainer.scrollTop = scrollTopStart - deltaY;
         }
    }

    function handlePanEnd(e) {
        if (!isPanning) return;
        isPanning = false;
        // If panning occurred, restart the hide timer
        if (didPan) {
            scheduleControlsHide();
        } else {
             // If no significant movement (i.e., it was potentially a click),
             // let the click handler decide navigation. Don't immediately hide controls.
             // The click event will fire shortly after mouseup/touchend if no pan occurred.
             cancelControlsHide(); // Keep controls shown briefly after a potential click
             setTimeout(scheduleControlsHide, 100); // Schedule hide shortly after potential click handled
        }
        // Cursor reverts via CSS :active removal
    }

    // --- Click Navigation (NEW) ---
    function handleContainerClick(e) {
        // Ignore clicks if panning occurred between mousedown and mouseup
        if (didPan) {
            didPan = false; // Reset flag
            return;
        }

        // Ignore clicks directly on the image itself or controls
        if (e.target === comicPage || controlsOverlay.contains(e.target)) {
            return;
        }

         // Check if a comic is loaded
         if (sortedImageFiles.length === 0) return;

        const containerRect = imageContainer.getBoundingClientRect();
        const imageRect = comicPage.getBoundingClientRect();
        const clickX = e.clientX; // Click position relative to viewport

        // Calculate approximate empty space boundaries
        // Adjust slightly inwards from container edge to avoid misclicks near scrollbars
        const buffer = 10; // Pixels buffer
        const leftBound = containerRect.left + buffer;
        const rightBound = containerRect.right - buffer;
        const imageLeft = imageRect.left;
        const imageRight = imageRect.right;

        // Click was in the container background, to the left of the image
        if (clickX >= leftBound && clickX < imageLeft) {
            goToPrevPage();
            showControlsTemporarily();
        }
        // Click was in the container background, to the right of the image
        else if (clickX > imageRight && clickX <= rightBound) {
            goToNextPage();
            showControlsTemporarily();
        }
    }

    // --- Keyboard Navigation (No changes) ---
    function handleKeyDown(e) {
        if (!zip || sortedImageFiles.length === 0 || controlsOverlay.style.display === 'none') return;
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')) {
            return;
        }
        let handled = true;
        switch (e.key) {
            case 'ArrowLeft': case 'PageUp': if (currentPageIndex > 0) goToPrevPage(); break;
            case 'ArrowRight': case 'PageDown': if (currentPageIndex < sortedImageFiles.length - 1) goToNextPage(); break;
            case 'Home': if (currentPageIndex !== 0) displayPage(0); break;
            case 'End': if (currentPageIndex !== sortedImageFiles.length - 1) displayPage(sortedImageFiles.length - 1); break;
            case '+': case '=': zoomIn(); break;
            case '-': case '_': zoomOut(); break;
            case '0': zoomFit(); break;
            default: handled = false; break;
        }
        if (handled) { e.preventDefault(); showControlsTemporarily(); }
    }

     // --- Controls Auto-Hide (No changes) ---
    function showControlsTemporarily() { /* ... */ }
    function scheduleControlsHide() { /* ... */ }
    function cancelControlsHide() { /* ... */ }


    // --- Initial Setup ---
    resetViewer();

}); // End DOMContentLoaded