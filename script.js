document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    // ... (same as before)
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
    // ... (same as before)
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
    // ... (same as before)
    const ZOOM_STEP = 0.2;
    const MAX_ZOOM = 8.0;
    const MIN_ZOOM = 0.1;
    const PAN_THRESHOLD = 5;
    const CONTROLS_BOTTOM_THRESHOLD = 60;
    const PRELOAD_AHEAD = 2;
    const PRELOAD_BEHIND = 1;


    // --- Event Listeners ---
    // ... (same as before)
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
        console.log("handleFileSelect triggered."); // LOG 1
        const file = event.target.files[0];
        resetViewer();

        if (!file) {
            console.log("No file selected."); // LOG 2
            return;
        }
        fileNameDisplay.textContent = file.name;
        console.log(`File selected: ${file.name}, type: ${file.type}, size: ${file.size}`); // LOG 3

        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError('Error: Please select a .cbz file.');
            fileInput.value = '';
            return;
        }

        fileSelector.style.display = 'none';
        imageDisplayArea.style.display = 'none'; // Keep hidden for now
        statusOverlay.style.display = 'flex';
        loadingIndicator.style.display = 'block';
        loadingIndicator.textContent = 'Loading Book...';
        errorIndicator.style.display = 'none';
        controlsOverlay.classList.remove('controls-visible');
        console.log("Showing loading indicator."); // LOG 4

        const reader = new FileReader();
        reader.onload = (e) => {
            console.log("FileReader onload triggered."); // LOG 5
            loadZip(e.target.result);
        };
        reader.onerror = (e) => {
            console.error("FileReader onerror:", e); // LOG 6 (Error)
            showError('Error reading file.');
        };
        reader.readAsArrayBuffer(file);
        console.log("FileReader readAsArrayBuffer called."); // LOG 7
    }

    async function loadZip(arrayBuffer) {
        console.log("loadZip called."); // LOG 8
        try {
            zip = await JSZip.loadAsync(arrayBuffer);
            console.log("JSZip loadAsync successful."); // LOG 9
            sortedImageFiles = [];
            zip.forEach((relativePath, zipEntry) => {
                const lowerCasePath = relativePath.toLowerCase();
                if (!zipEntry.dir && /\.(jpe?g|png|gif|webp)$/.test(lowerCasePath) && !relativePath.startsWith('__MACOSX/')) {
                    sortedImageFiles.push({ path: relativePath, entry: zipEntry });
                }
            });
             sortedImageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));

            console.log(`Found ${sortedImageFiles.length} images.`); // LOG 10

            if (sortedImageFiles.length === 0) {
                showError('Error: No compatible images found in the CBZ file.'); return;
            }

            console.log(`First image path: ${sortedImageFiles[0]?.path}`); // LOG 11
            currentPageIndex = 0;

            // Ensure the display area is visible BEFORE trying to display
            console.log("Making imageDisplayArea visible."); // LOG 12
            imageDisplayArea.style.display = 'flex'; // ***** Make visible here *****

            // Display the first page
            await displayPage(currentPageIndex);

            // Hide loading overlay only AFTER attempt to display
            statusOverlay.style.display = 'none';
            console.log("Hid loading overlay."); // LOG 13

        } catch (error) {
            console.error("JSZip error:", error); // LOG 14 (Error)
            showError(`Error loading CBZ: ${error.message || 'Unknown error'}`);
            resetViewer();
            imageDisplayArea.style.display = 'none';
            fileSelector.style.display = 'block';
        }
    }

    async function displayPage(index) {
        // Basic checks
        if (!zip || index < 0 || index >= sortedImageFiles.length || isTransitioning) {
             console.warn("displayPage prevented:", { index, isTransitioning, zipExists: !!zip, filesLength: sortedImageFiles.length }); // LOG 15 (Warn)
             if (isTransitioning) { // If prevented by transition, reset flag after a delay
                 setTimeout(() => { isTransitioning = false; }, 100);
             }
             return;
         }
         console.log(`displayPage: Starting for index ${index}`); // LOG 16
         isTransitioning = true; // Set flag early
         const targetPageIndex = index; // Use a local variable for safety in async ops
         currentPageIndex = targetPageIndex; // Update global state

         // --- 1. Get Blob URL ---
         let targetBlobUrl = preloadedBlobs[targetPageIndex];
         let loadedNow = false;
         if (!targetBlobUrl) {
             try {
                 console.log(`displayPage: Loading blob for index ${targetPageIndex}`); // LOG 17
                 const fileEntry = sortedImageFiles[targetPageIndex].entry;
                 const blob = await fileEntry.async('blob');
                 targetBlobUrl = URL.createObjectURL(blob);
                 preloadedBlobs[targetPageIndex] = targetBlobUrl; // Cache it
                 loadedNow = true;
                 console.log(`displayPage: Blob created for index ${targetPageIndex}: ${targetBlobUrl}`); // LOG 18
             } catch (error) {
                 console.error(`displayPage: Error loading blob for index ${targetPageIndex}:`, error); // LOG 19 (Error)
                 showError(`Error loading page ${targetPageIndex + 1} data: ${error.message}`);
                 isTransitioning = false; // Reset flag on error
                 // Clean up partial blob if needed
                 if(targetBlobUrl && loadedNow) { URL.revokeObjectURL(targetBlobUrl); delete preloadedBlobs[targetPageIndex]; }
                 return;
             }
         } else {
             console.log(`displayPage: Using cached blob for index ${targetPageIndex}`); // LOG 20
         }

         // --- 2. Create Image Element ---
         const newImage = document.createElement('img');
         newImage.alt = `Comic Page ${targetPageIndex + 1}`;
         newImage.style.opacity = 0; // Start invisible

         const oldImage = currentImageElement;
         currentImageElement = newImage; // Update global reference

         console.log(`displayPage: Adding new image element for index ${targetPageIndex} to DOM (initially hidden).`); // LOG 21
         imageContainer.appendChild(newImage);

         // --- 3. Load Image Source & Handle Results ---
         try {
             await new Promise((resolve, reject) => {
                 newImage.onload = () => {
                     console.log(`displayPage: newImage.onload triggered for index ${targetPageIndex}. Natural dims: ${newImage.naturalWidth}x${newImage.naturalHeight}`); // LOG 22
                     resolve(); // Success
                 };
                 newImage.onerror = (event) => {
                     console.error(`displayPage: newImage.onerror triggered for index ${targetPageIndex}. Event:`, event); // LOG 23 (Error)
                     reject(new Error(`Image source failed to load for page ${targetPageIndex + 1}`));
                 };
                 console.log(`displayPage: Setting src for new image index ${targetPageIndex} to ${targetBlobUrl}`); // LOG 24
                 newImage.src = targetBlobUrl;
             });

             // --- 4. Image Loaded - Apply Fit & Transition ---
             console.log(`displayPage: Image ${targetPageIndex + 1} promise resolved. Applying fit.`); // LOG 25
             zoomFit(false); // Apply fit state BEFORE making visible

             requestAnimationFrame(() => {
                 newImage.classList.add('visible'); // Start fade-in
                 console.log(`displayPage: Added 'visible' class to image ${targetPageIndex + 1}`); // LOG 26

                 if (oldImage) {
                     console.log("displayPage: Fading out old image."); // LOG 27
                     oldImage.classList.remove('visible');
                     oldImage.classList.add('fading-out');
                     oldImage.addEventListener('transitionend', () => {
                         if (imageContainer.contains(oldImage)) {
                             imageContainer.removeChild(oldImage);
                             console.log("displayPage: Removed old image from DOM."); // LOG 28
                         }
                     }, { once: true });
                 }

                 // Consider transition complete visually
                 setTimeout(() => {
                     console.log(`displayPage: Transition visually complete for ${targetPageIndex + 1}. Resetting flag.`); // LOG 29
                     isTransitioning = false; // Reset flag HERE
                     preloadAdjacentPages(targetPageIndex); // Preload AFTER transition done
                     updateUIState(); // Update buttons/page#
                 }, 250); // Match CSS transition time
             });

         } catch (error) {
             // Handle errors from the image loading promise
             console.error(`displayPage: Error during image loading/display for index ${targetPageIndex}:`, error); // LOG 30 (Error)
             showError(error.message || `Error displaying page ${targetPageIndex + 1}`);
             if (imageContainer.contains(newImage)) { // Clean up the failed element
                 imageContainer.removeChild(newImage);
             }
             currentImageElement = oldImage; // Attempt to revert reference
             isTransitioning = false; // Reset flag on error
             updateUIState();
         }
    }

    function preloadAdjacentPages(currentIndex) { /* ... (same as before, logging already added) ... */
         const preloadStart = Math.max(0, currentIndex - PRELOAD_BEHIND);
         const preloadEnd = Math.min(sortedImageFiles.length - 1, currentIndex + PRELOAD_AHEAD);

         Object.keys(preloadedBlobs).forEach(keyIndexStr => {
              const keyIndex = parseInt(keyIndexStr, 10);
              if ((keyIndex < preloadStart || keyIndex > preloadEnd) && keyIndex !== currentIndex ) { // Keep current page blob
                   console.log(`Pruning blob cache for index: ${keyIndex}`);
                   URL.revokeObjectURL(preloadedBlobs[keyIndex]);
                   delete preloadedBlobs[keyIndex];
              }
          });

         for (let i = preloadStart; i <= preloadEnd; i++) {
             if (i !== currentIndex && !preloadedBlobs[i]) {
                 const pageIndexToLoad = i;
                 console.log(`Preloading page index: ${pageIndexToLoad}`);
                 sortedImageFiles[pageIndexToLoad].entry.async('blob')
                     .then(blob => {
                          const currentPreloadStart = Math.max(0, currentPageIndex - PRELOAD_BEHIND);
                          const currentPreloadEnd = Math.min(sortedImageFiles.length - 1, currentPageIndex + PRELOAD_AHEAD);
                          if (pageIndexToLoad >= currentPreloadStart && pageIndexToLoad <= currentPreloadEnd) {
                              if (!preloadedBlobs[pageIndexToLoad]) {
                                   preloadedBlobs[pageIndexToLoad] = URL.createObjectURL(blob);
                                   console.log(`Preload complete for index: ${pageIndexToLoad}`);
                              } else { URL.revokeObjectURL(URL.createObjectURL(blob)); }
                          } else {
                               console.log(`Preload for ${pageIndexToLoad} no longer needed, discarding.`);
                               URL.revokeObjectURL(URL.createObjectURL(blob));
                          }
                     })
                     .catch(err => console.warn(`Preload failed for index ${pageIndexToLoad}:`, err));
             }
         }
    }

    // --- Navigation --- (No changes needed)
    function goToPrevPage() { if (!isTransitioning && currentPageIndex > 0) displayPage(currentPageIndex - 1); }
    function goToNextPage() { if (!isTransitioning && currentPageIndex < sortedImageFiles.length - 1) displayPage(currentPageIndex + 1); }

    // --- UI Updates --- (No changes needed)
    function updateUIState() { /* ... */ }
    function updateZoomDisplay() { /* ... */ }

    // --- Error Handling & Reset --- (No changes needed)
    function showError(message) { /* ... */ }
    function resetState(clearFileName = true) { /* ... */ }
    function resetViewer() { /* ... */ }

    // --- Zoom --- (No changes needed)
    function applyZoom(centerPoint = null) { /* ... */ }
    function zoomIn(e = null) { /* ... */ }
    function zoomOut(e = null) { /* ... */ }
    function zoomFit(triggerControlShow = true) { /* ... */ }

    // --- Panning --- (No changes needed)
    function getEventCoordinates(e) { /* ... */ }
    function handlePanStart(e) { /* ... */ }
    function handlePanMove(e) { /* ... */ }
    function handlePanEnd(e) { /* ... */ }

    // --- Click Navigation --- (No changes needed)
    function handleContainerClick(e) { /* ... */ }

    // --- Keyboard Navigation --- (No changes needed)
    function handleKeyDown(e) { /* ... */ }

    // --- Controls Visibility --- (No changes needed)
    function showControls(force = false) { /* ... */ }
    function hideControls() { /* ... */ }
    function handleMouseMoveForControls(e) { /* ... */ }

    // --- Initial Setup ---
    resetViewer();
    console.log("CBZ Viewer Initialized.");

}); // End DOMContentLoaded