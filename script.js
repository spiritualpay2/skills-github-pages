document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements --- (Same)
    const viewerContainer = document.getElementById('viewerContainer'); /* ... */
    const imageContainer = document.getElementById('imageContainer'); /* ... */
    // --- State Variables --- (Same, remove isTransitioning?)
    let zip = null; let sortedImageFiles = []; let currentPageIndex = 0;
    let currentImageElement = null; let preloadedBlobs = {};
    // let isTransitioning = false; // REMOVED
    let currentZoom = 1.0; let isFitMode = true;
    let isPanning = false; let panStartX, panStartY, scrollLeftStart, scrollTopStart;
    let didPan = false; let controlsVisible = false; let mouseNearBottom = false;

    // --- Constants --- (Same, remove TRANSITION_DURATION?)
    const ZOOM_STEP = 0.2; const MAX_ZOOM = 8.0; const MIN_ZOOM = 0.1; /* ... */
    // const TRANSITION_DURATION = 250; // REMOVED

    // --- Event Listeners --- (Same)
    openFileButton.addEventListener('click', () => fileInput.click()); /* ... */

    // --- Functions ---

    function handleFileSelect(event) { /* ... (Same logic, no change to isInitialDisplay needed now) ... */
        const file = event.target.files[0]; resetViewer(); if (!file) return;
        fileNameDisplay.textContent = file.name;
        if (!file.name.toLowerCase().endsWith('.cbz')) { /* ... show error ... */ return; }
        fileSelector.style.display = 'none'; imageDisplayArea.style.display = 'none';
        statusOverlay.style.display = 'flex'; loadingIndicator.style.display = 'block'; loadingIndicator.textContent = 'Loading Book...';
        errorIndicator.style.display = 'none'; controlsOverlay.classList.remove('controls-visible');
        const reader = new FileReader(); reader.onload = (e) => loadZip(e.target.result);
        reader.onerror = (e) => { console.error("FileReader error:", e); showError('Error reading file.'); };
        reader.readAsArrayBuffer(file);
     }

    async function loadZip(arrayBuffer) { /* ... (Same logic) ... */
        try {
            zip = await JSZip.loadAsync(arrayBuffer); sortedImageFiles = [];
            zip.forEach((relativePath, zipEntry) => { /* find images */ }); sortedImageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
            if (sortedImageFiles.length === 0) { showError('Error: No compatible images found.'); return; }
            currentPageIndex = 0;
            imageDisplayArea.style.display = 'flex'; // Show container
            await displayPage(currentPageIndex); // Display first page
            statusOverlay.style.display = 'none';
        } catch (error) { /* ... error handling ... */ }
    }

    // --- displayPage (SIMPLIFIED) ---
    async function displayPage(index) {
        // Basic checks (removed isTransitioning)
        if (!zip || index < 0 || index >= sortedImageFiles.length) return;

        const targetPageIndex = index;
        currentPageIndex = targetPageIndex;

        // --- 1. Get Blob URL --- (Same logic)
        let targetBlobUrl = preloadedBlobs[targetPageIndex];
        let loadedNow = false;
        if (!targetBlobUrl) { try { /* ... load blob ... */ } catch (error) { /* ... error handling ... */ return; } }

        // --- 2. Remove Old Image Immediately ---
        if (currentImageElement && imageContainer.contains(currentImageElement)) {
            imageContainer.removeChild(currentImageElement);
            currentImageElement = null; // Clear reference
        }

        // --- 3. Create New Image Element ---
        const newImage = document.createElement('img');
        newImage.alt = `Comic Page ${targetPageIndex + 1}`;
        // Opacity is 1 by default via CSS now

        currentImageElement = newImage; // Set new reference
        imageContainer.appendChild(newImage);

        // --- 4. Load Image Source & Handle Results ---
        try {
            await new Promise((resolve, reject) => {
                newImage.onload = resolve;
                newImage.onerror = (event) => reject(new Error(`Image source failed to load for page ${targetPageIndex + 1}`));
                newImage.src = targetBlobUrl;
            });

            // --- 5. Image Loaded - Apply Fit ---
            // Apply fit state directly, no transition or rAF needed here
            zoomFit(false); // false = don't trigger control show

            // Update UI immediately
            updateUIState();
            preloadAdjacentPages(targetPageIndex); // Preload next pages

        } catch (error) {
            console.error(`Error during image display for index ${targetPageIndex}:`, error);
            showError(error.message || `Error displaying page ${targetPageIndex + 1}`);
            if (imageContainer.contains(newImage)) imageContainer.removeChild(newImage); // Clean up failed new image
            currentImageElement = null; // Ensure reference is cleared on error
            updateUIState();
        }
    }


    function preloadAdjacentPages(currentIndex) { /* ... (same as before) ... */ }
    function goToPrevPage() { if (currentPageIndex > 0) displayPage(currentPageIndex - 1); } // Removed isTransitioning check
    function goToNextPage() { if (currentPageIndex < sortedImageFiles.length - 1) displayPage(currentPageIndex + 1); } // Removed isTransitioning check

    function updateUIState() { // Removed isTransitioning checks from disabled logic
        if (sortedImageFiles.length > 0 && currentImageElement) {
            pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${sortedImageFiles.length}`;
            prevPageButton.disabled = currentPageIndex === 0; // Simpler check
            nextPageButton.disabled = currentPageIndex === sortedImageFiles.length - 1; // Simpler check
        } else { /* ... default state ... */ }
        updateZoomDisplay();
    }

    function updateZoomDisplay() { // Removed isTransitioning checks
        zoomLevelDisplay.textContent = isFitMode ? 'Fit' : `${Math.round(currentZoom * 100)}%`;
        zoomInButton.disabled = (!isFitMode && currentZoom >= MAX_ZOOM);
        zoomOutButton.disabled = isFitMode || currentZoom <= MIN_ZOOM;
        zoomFitButton.disabled = isFitMode;
    }

    function showError(message) { /* ... (same as before) ... */ }
    function resetState(clearFileName = true) { /* ... (same as before, ensure isTransitioning is removed if var exists) ... */
        zip = null; sortedImageFiles = []; currentPageIndex = 0;
        Object.values(preloadedBlobs).forEach(URL.revokeObjectURL); preloadedBlobs = {};
        currentImageElement = null;
        currentZoom = 1.0; isFitMode = true; isPanning = false; didPan = false; // isTransitioning = false;
        if (clearFileName) fileNameDisplay.textContent = 'No file selected';
     }
    function resetViewer() { /* ... (same as before) ... */ }
    function applyZoom(centerPoint = null) { /* ... (same as before) ... */ }
    function zoomIn(e = null) { /* ... (same as before) ... */ }
    function zoomOut(e = null) { /* ... (same as before) ... */ }
    function zoomFit(triggerControlShow = true) { /* ... (same calculation logic as previous attempt) ... */
        if (!currentImageElement || !currentImageElement.naturalWidth) return;
        isFitMode = true; currentZoom = 1.0;
        const img = currentImageElement; const container = imageContainer;
        const containerW = container.clientWidth; const containerH = container.clientHeight;
        const imgW = img.naturalWidth; const imgH = img.naturalHeight;
        if (containerW <= 0 || containerH <= 0 || imgW <= 0 || imgH <= 0) return;
        const containerRatio = containerW / containerH; const imgRatio = imgW / imgH;
        let targetW, targetH;
        if (imgRatio > containerRatio) { targetW = containerW; targetH = targetW / imgRatio; }
        else { targetH = containerH; targetW = targetH * imgRatio; }
        img.style.width = `${targetW}px`; img.style.height = `${targetH}px`;
        img.style.maxWidth = 'none'; img.style.maxHeight = 'none';
        img.style.position = 'absolute'; img.style.top = '50%'; img.style.left = '50%';
        img.style.transform = 'translate(-50%, -50%)';
        container.scrollTop = 0; container.scrollLeft = 0;
        updateUIState(); if (triggerControlShow) showControls();
     }
    function getEventCoordinates(e) { /* ... */ }
    function handlePanStart(e) { /* ... (same logic) ... */ }
    function handlePanMove(e) { /* ... */ }
    function handlePanEnd(e) { /* ... */ }
    function handleContainerClick(e) { /* ... (same logic, remove isTransitioning check) ... */
        if (didPan) { didPan = false; return; } // Removed isTransitioning
        if (e.target !== imageContainer || controlsOverlay.contains(e.target)) { return; }
        /* ... rest of click logic ... */
     }
    function handleKeyDown(e) { /* ... (same logic, remove isTransitioning check) ... */
        // Removed isTransitioning check
        if (!zip || sortedImageFiles.length === 0) return;
        /* ... rest of keydown logic ... */
     }
    function showControls(force = false) { /* ... */ }
    function hideControls() { /* ... */ }
    function handleMouseMoveForControls(e) { /* ... */ }

    // --- Initial Setup ---
    resetViewer();

}); // End DOMContentLoaded