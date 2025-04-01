document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const viewerContainer = document.getElementById('viewerContainer');
    const fileSelector = document.getElementById('fileSelector');
    const fileInput = document.getElementById('fileInput');
    const imageContainer = document.getElementById('imageContainer');
    const comicPage = document.getElementById('comicPage');
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
    let startX, startY, scrollLeftStart, scrollTopStart;
    let controlsHideTimeout = null;

    // --- Constants ---
    const ZOOM_STEP = 0.2; // Slightly larger step
    const MAX_ZOOM = 6.0;
    const MIN_ZOOM = 0.1; // Allow zooming out further
    const CONTROLS_HIDE_DELAY = 2500; // ms

    // --- Event Listeners ---
    fileInput.addEventListener('change', handleFileSelect);
    prevPageButton.addEventListener('click', goToPrevPage);
    nextPageButton.addEventListener('click', goToNextPage);
    zoomInButton.addEventListener('click', zoomIn);
    zoomOutButton.addEventListener('click', zoomOut);
    zoomFitButton.addEventListener('click', zoomFit);
    document.addEventListener('keydown', handleKeyDown);
    // Panning listeners
    comicPage.addEventListener('mousedown', handlePanStart);
    imageContainer.addEventListener('mousemove', handlePanMove); // Attach to container
    imageContainer.addEventListener('mouseup', handlePanEnd);
    imageContainer.addEventListener('mouseleave', handlePanEnd); // End pan if mouse leaves container
    // Touch Panning listeners (basic)
    comicPage.addEventListener('touchstart', handlePanStart, { passive: false }); // Prevent scroll bounce sometimes
    imageContainer.addEventListener('touchmove', handlePanMove, { passive: false }); // Prevent default scroll
    imageContainer.addEventListener('touchend', handlePanEnd);
    imageContainer.addEventListener('touchcancel', handlePanEnd);
    // Controls auto-hide listeners
    viewerContainer.addEventListener('mousemove', showControlsTemporarily);
    viewerContainer.addEventListener('touchstart', showControlsTemporarily, { passive: true }); // Show on tap
    controlsOverlay.addEventListener('mouseenter', cancelControlsHide); // Keep visible if hovering controls
    controlsOverlay.addEventListener('mouseleave', scheduleControlsHide); // Hide when leaving controls


    // --- Functions ---

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
                // Basic image filtering, ignore macOS hidden files and directories
                if (!zipEntry.dir && /\.(jpe?g|png|gif|webp)$/.test(lowerCasePath) && !relativePath.startsWith('__MACOSX/')) {
                    sortedImageFiles.push({ path: relativePath, entry: zipEntry });
                }
            });

            // Natural sort for filenames (e.g., page1, page2, page10)
             sortedImageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

            if (sortedImageFiles.length === 0) {
                showError('Error: No compatible images found in the CBZ file.');
                return; // Stay in error state
            }

            // Successful load
            currentPageIndex = 0;
            await displayPage(currentPageIndex); // Load the first page
            // Now show the UI
            statusOverlay.style.display = 'none'; // Hide loading
            imageContainer.style.display = 'flex'; // Show image area
            controlsOverlay.style.display = 'flex'; // Show controls
            showControlsTemporarily(); // Start the hide timer

        } catch (error) {
            console.error("JSZip error:", error);
            showError(`Error loading CBZ: ${error.message || 'Unknown error'}`);
        }
    }

    async function displayPage(index) {
        if (!zip || index < 0 || index >= sortedImageFiles.length) return;

        statusOverlay.style.display = 'flex'; // Show loading indicator
        loadingIndicator.style.display = 'block';
        errorIndicator.style.display = 'none';
        comicPage.style.visibility = 'hidden'; // Hide image element until loaded

        // Clean up previous blob URL
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }

        try {
            const fileEntry = sortedImageFiles[index].entry;
            const blob = await fileEntry.async('blob');
            currentBlobUrl = URL.createObjectURL(blob);

            // Wait for image dimensions to be known before applying zoom etc.
            await new Promise((resolve, reject) => {
                comicPage.onload = () => {
                    statusOverlay.style.display = 'none'; // Hide loading
                    comicPage.style.visibility = 'visible';
                    resolve();
                };
                comicPage.onerror = () => {
                     showError(`Error loading image: ${fileEntry.name}`);
                     reject(new Error(`Error loading image: ${fileEntry.name}`));
                };
                comicPage.src = currentBlobUrl; // Set src AFTER attaching onload/onerror
            });

             currentPageIndex = index; // Update index only after successful load
             zoomFit(false); // Fit the new page initially (false = don't trigger control show)
             updateUIState();
             showControlsTemporarily(); // Re-show controls after page change

        } catch (error) {
             console.error("Error displaying page:", error);
             // Don't call showError here if called in onload/onerror
             statusOverlay.style.display = 'flex'; // Ensure status overlay is visible
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

        // Update cursor based on zoom and overflow
        const overflowsX = comicPage.offsetWidth * currentZoom > imageContainer.clientWidth + 2; // Add tolerance
        const overflowsY = comicPage.offsetHeight * currentZoom > imageContainer.clientHeight + 2;
        comicPage.style.cursor = (overflowsX || overflowsY) ? 'grab' : 'default';
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
         // Don't reset UI elements here, handled by showError or resetViewer
         zip = null;
         sortedImageFiles = [];
         currentPageIndex = 0;
         if (currentBlobUrl) {
             URL.revokeObjectURL(currentBlobUrl);
             currentBlobUrl = null;
         }
         currentZoom = 1.0;
         isPanning = false;
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

        resetState(true); // Reset logic state and clear filename
        fileInput.value = ''; // Clear file input selection
        updateUIState(); // Update button states etc.
    }

    // --- Zoom ---
    function applyZoom(triggerControlShow = true) {
        comicPage.style.transform = `scale(${currentZoom})`;
        updateZoomDisplay();
        if (triggerControlShow) {
            showControlsTemporarily();
        }
    }

    function zoomIn() {
        // Zoom towards center
        currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        applyZoom();
    }

    function zoomOut() {
        // Zoom out from center
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        applyZoom();
    }

    function zoomFit(triggerControlShow = true) {
        // Reset zoom and center image
        currentZoom = 1.0;
        applyZoom(triggerControlShow);
        // Recenter scrollbars after applying zoom
        imageContainer.scrollTop = (imageContainer.scrollHeight - imageContainer.clientHeight) / 2;
        imageContainer.scrollLeft = (imageContainer.scrollWidth - imageContainer.clientWidth) / 2;
    }


    // --- Panning ---
     function getEventCoordinates(e) {
         // Handles both mouse and touch events
         if (e.touches && e.touches.length > 0) {
             return { x: e.touches[0].pageX, y: e.touches[0].pageY };
         }
         return { x: e.pageX, y: e.pageY };
     }

    function handlePanStart(e) {
        const overflowsX = comicPage.offsetWidth * currentZoom > imageContainer.clientWidth + 2;
        const overflowsY = comicPage.offsetHeight * currentZoom > imageContainer.clientHeight + 2;
        if (!(overflowsX || overflowsY)) return; // Only pan if overflowing

        if (e.type === 'touchstart') { e.preventDefault(); } // Prevent page scroll on touch

        isPanning = true;
        comicPage.style.cursor = 'grabbing';
        const coords = getEventCoordinates(e);
        startX = coords.x - imageContainer.offsetLeft;
        startY = coords.y - imageContainer.offsetTop;
        scrollLeftStart = imageContainer.scrollLeft;
        scrollTopStart = imageContainer.scrollTop;
        showControlsTemporarily(); // Keep controls visible while panning
    }

    function handlePanMove(e) {
        if (!isPanning) return;
         if (e.type === 'touchmove') { e.preventDefault(); } // Prevent page scroll on touch

        const coords = getEventCoordinates(e);
        const x = coords.x - imageContainer.offsetLeft;
        const y = coords.y - imageContainer.offsetTop;
        const walkX = (x - startX);
        const walkY = (y - startY);
        imageContainer.scrollLeft = scrollLeftStart - walkX;
        imageContainer.scrollTop = scrollTopStart - walkY;
    }

    function handlePanEnd() {
        if (!isPanning) return;
        isPanning = false;
        // Cursor update handled by updateZoomDisplay after zoom/load
        // Re-check cursor state in case zoom changed during pan interaction (unlikely but possible)
         updateZoomDisplay();
         scheduleControlsHide(); // Start hide timer again after panning stops
    }

    // --- Keyboard Navigation ---
    function handleKeyDown(e) {
        // Only process if a comic is loaded (controls are visible/potentially visible)
        if (!zip || sortedImageFiles.length === 0 || controlsOverlay.style.display === 'none') return;

        // Allow default browser zoom, but handle +/- for application zoom
        if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')) {
            return;
        }

        let handled = true; // Assume we handle it unless default needed
        switch (e.key) {
            case 'ArrowLeft':
            case 'PageUp':
                 if (currentPageIndex > 0) goToPrevPage();
                break;
            case 'ArrowRight':
            case 'PageDown':
                 if (currentPageIndex < sortedImageFiles.length - 1) goToNextPage();
                break;
            case 'Home':
                 if (currentPageIndex !== 0) displayPage(0);
                break;
            case 'End':
                 if (currentPageIndex !== sortedImageFiles.length - 1) displayPage(sortedImageFiles.length - 1);
                break;
            case '+':
            case '=':
                zoomIn();
                break;
            case '-':
            case '_':
                zoomOut();
                break;
            case '0': // Fit to screen
                 zoomFit();
                 break;
            default:
                handled = false; // Don't prevent default for other keys
                break;
        }

        if (handled) {
            e.preventDefault(); // Prevent default browser action (like scrolling)
            showControlsTemporarily(); // Show controls on interaction
        }
    }

     // --- Controls Auto-Hide ---
    function showControlsTemporarily() {
         cancelControlsHide(); // Clear any existing hide timer
         controlsOverlay.classList.add('controls-visible'); // Force visible state if needed (though CSS handles hover)
         controlsOverlay.classList.remove('controls-hidden');
         scheduleControlsHide(); // Start a new timer
     }

    function scheduleControlsHide() {
         cancelControlsHide(); // Clear previous timer
         // Don't hide if mouse is over the controls or if panning
         if (!isPanning && !controlsOverlay.matches(':hover')) {
              controlsHideTimeout = setTimeout(() => {
                  controlsOverlay.classList.add('controls-hidden');
                  controlsOverlay.classList.remove('controls-visible');
              }, CONTROLS_HIDE_DELAY);
         }
    }

    function cancelControlsHide() {
        if (controlsHideTimeout) {
            clearTimeout(controlsHideTimeout);
            controlsHideTimeout = null;
        }
    }


    // --- Initial Setup ---
    resetViewer(); // Start with the file selector visible

}); // End DOMContentLoaded