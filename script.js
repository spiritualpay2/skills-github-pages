document.addEventListener('DOMContentLoaded', () => {
    // Existing element refs
    const fileInput = document.getElementById('fileInput');
    const statusElement = document.getElementById('status');
    const viewerElement = document.getElementById('viewer');
    const pageImageElement = document.getElementById('pageImage');
    // Buttons removed: const prevButton = document.getElementById('prevButton');
    // Buttons removed: const nextButton = document.getElementById('nextButton');
    const pageInfoElement = document.getElementById('pageInfo');
    const initialViewElement = document.getElementById('initialView'); // Get the wrapper
    const closeButton = document.getElementById('closeButton');
    const imageContainer = document.getElementById('imageContainer'); // Get image container
    const viewerUiOverlay = document.getElementById('viewerUiOverlay'); // Get UI overlay

    // State variables
    let zip = null;
    let imageFiles = [];
    let currentPageIndex = 0;
    let panzoomInstance = null; // To hold the Panzoom object

    // --- Helpers (naturalSort, getMimeType - unchanged) ---
    function naturalSort(a, b) { /* ... (keep existing code) ... */ }
    function getMimeType(filename) { /* ... (keep existing code) ... */ }

    // --- File Handling (handleFileSelect, loadCbz - mostly unchanged) ---
    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect(event) { /* ... (keep existing code, uses updateStatus, resetViewer, loadCbz) ... */ }

    function loadCbz(arrayBuffer) {
        JSZip.loadAsync(arrayBuffer)
            .then(loadedZip => {
                zip = loadedZip;
                imageFiles = [];
                // ... (filtering logic remains the same) ...
                 const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
                 zip.forEach((relativePath, zipEntry) => {
                    if (!zipEntry.dir && !relativePath.startsWith('__MACOSX/') && imageExtensions.some(ext => relativePath.toLowerCase().endsWith(ext))) {
                         const pathParts = relativePath.split('/').filter(p => p);
                         if (pathParts.length <= 2) { // Allow root or one level deep
                            imageFiles.push(relativePath);
                         }
                    }
                });

                if (imageFiles.length === 0) { /* ... (error handling) ... */ }

                imageFiles.sort(naturalSort);
                currentPageIndex = 0;

                // Important: Display first page *then* setup UI
                displayPage(currentPageIndex).then(() => {
                     updateStatus(`Loaded ${imageFiles.length} pages.`);
                     initialViewElement.classList.add('hidden');
                     viewerElement.classList.remove('hidden');
                     updateNavigation(); // Update page info immediately
                }).catch(error => {
                     // Handle error during initial page load if necessary
                     console.error("Error displaying first page:", error);
                     updateStatus(`Error: Could not display first page.`, true);
                     resetViewer();
                });

            })
            .catch(error => { /* ... (error handling) ... */ });
    }


    // --- Page Display & Panzoom Integration ---
    // Make displayPage async to allow waiting for image load potentially
    async function displayPage(index) {
        if (!zip || index < 0 || index >= imageFiles.length) {
            console.error("Invalid page index or zip not loaded");
            return Promise.reject("Invalid page index or zip not loaded"); // Return a rejected promise
        }

        currentPageIndex = index;
        const filename = imageFiles[index];
        const mimeType = getMimeType(filename);

        updateStatus("Loading page...");
        pageImageElement.style.opacity = '0.5'; // Indicate loading visually

        // Destroy previous Panzoom instance if it exists
        if (panzoomInstance) {
            panzoomInstance.destroy();
            panzoomInstance = null;
        }
        // Reset image transform before loading new image
        pageImageElement.style.transform = '';


        try {
            const base64Data = await zip.file(filename).async('base64');
            // Set src *before* initializing Panzoom
            pageImageElement.src = `data:${mimeType};base64,${base64Data}`;

            // Return a promise that resolves when the image is loaded
            return new Promise((resolve, reject) => {
                pageImageElement.onload = () => {
                    pageImageElement.style.opacity = '1';
                    updateStatus(''); // Clear loading status

                    // Initialize Panzoom *after* image is loaded
                    panzoomInstance = Panzoom(pageImageElement, {
                        maxScale: 5,
                        minScale: 0.5, // Allow zooming out slightly
                        contain: 'outside', // Keep image within bounds initially
                        canvas: true, // Recommended for performance
                         pinchAndPan: true // Enable touch panning
                    });
                    // Add wheel listener to the container for zooming
                    imageContainer.addEventListener('wheel', (event) => {
                       if (panzoomInstance) {
                           // Prevent page scroll
                           event.preventDefault();
                           panzoomInstance.zoomWithWheel(event);
                       }
                    });


                    updateNavigation(); // Update page count etc.
                    resolve(); // Signal success
                };
                pageImageElement.onerror = (err) => {
                    console.error(`Error loading image data for page ${index} (${filename}):`, err);
                    updateStatus(`Error loading page ${index + 1}`, true);
                    pageImageElement.alt = `Error loading page ${index + 1}`;
                    pageImageElement.src = "#"; // Clear broken image link
                    pageImageElement.style.opacity = '1';
                     updateNavigation(); // Still update nav state
                    reject(`Error loading image data`); // Signal failure
                };
            });

        } catch (error) {
            console.error(`Error loading page file ${index} (${filename}):`, error);
            updateStatus(`Error reading page ${index + 1}`, true);
            pageImageElement.style.opacity = '1';
             updateNavigation(); // Still update nav state
             return Promise.reject(error); // Propagate error
        }
    }

    // --- Navigation (Click Zones & Keyboard) ---
    function updateNavigation() {
        if (imageFiles.length === 0) {
            pageInfoElement.textContent = 'Page 0 / 0';
            // Disable click zones? Maybe not necessary if page check happens first
        } else {
            pageInfoElement.textContent = `Page ${currentPageIndex + 1} / ${imageFiles.length}`;
        }
        // No buttons to disable/enable
    }

    function showPrevPage() {
        // Only turn page if not zoomed in significantly
        if (panzoomInstance && panzoomInstance.getScale() > 1.1) return;

        if (currentPageIndex > 0) {
            displayPage(currentPageIndex - 1).catch(err => console.error("Failed to display previous page:", err));
        }
    }

    function showNextPage() {
        // Only turn page if not zoomed in significantly
         if (panzoomInstance && panzoomInstance.getScale() > 1.1) return;

        if (currentPageIndex < imageFiles.length - 1) {
            displayPage(currentPageIndex + 1).catch(err => console.error("Failed to display next page:", err));;
        }
    }

    // Add click listener to the main viewer area for page turns
    viewerElement.addEventListener('click', (event) => {
        // Prevent turning if the click was on the UI overlay elements
        if (event.target === closeButton || viewerUiOverlay.contains(event.target)) {
             // Exception for explicit UI zones if needed, but close button check is enough here.
             // Let the close button's own listener handle it.
            return;
        }

        // Ignore clicks if panzoom considers it a drag/pan action
        // Panzoom adds a 'dragging' class, but click might fire before/after.
        // A robust way is difficult without library events, rely on scale check for now.
         if (panzoomInstance && panzoomInstance.getScale() > 1.1) {
             console.log("Zoomed in, click ignored for page turn.");
             return; // Don't turn page if zoomed
         }

        const viewerWidth = viewerElement.offsetWidth;
        const clickX = event.clientX;

        // Define click zones (e.g., left/right 25%)
        const zoneWidth = viewerWidth * 0.25;

        if (clickX < zoneWidth) {
            showPrevPage();
        } else if (clickX > viewerWidth - zoneWidth) {
            showNextPage();
        }
    });


    // --- Close & Reset ---
    function closeComic() {
        if (panzoomInstance) {
            panzoomInstance.destroy();
            panzoomInstance = null;
        }
        resetViewer();
        initialViewElement.classList.remove('hidden'); // Show initial view again
        viewerElement.classList.add('hidden'); // Hide viewer
        updateStatus("No file selected.");
    }

    function resetViewer() {
        zip = null;
        imageFiles = [];
        currentPageIndex = 0;
        pageImageElement.src = '#';
        pageImageElement.alt = 'Comic Page';
        pageImageElement.style.transform = ''; // Ensure transform is reset
        fileInput.value = '';
        updateNavigation();
    }

    // --- UI Updates ---
    function updateStatus(message, isError = false) {
        statusElement.textContent = message;
        statusElement.style.color = isError ? '#ff6b6b' : '#aaa'; // Use red for errors
    }

    // --- Event Listeners ---
    // Removed button listeners
    closeButton.addEventListener('click', closeComic);

    // Keyboard navigation (remains useful)
    document.addEventListener('keydown', (event) => {
        // Check if viewer is active AND the event isn't happening inside an input (though there are none in viewer)
        if (!viewerElement.classList.contains('hidden') && document.activeElement.tagName !== 'INPUT') {
             // Allow arrow key panning IF zoomed in, otherwise turn page
             const scale = panzoomInstance ? panzoomInstance.getScale() : 1;

            if (event.key === 'ArrowLeft') {
                 if (scale <= 1.1) showPrevPage();
                 // Optionally add panning via keyboard: else if(panzoomInstance) panzoomInstance.pan(10, 0, {relative: true});
            } else if (event.key === 'ArrowRight') {
                 if (scale <= 1.1) showNextPage();
                 // Optionally add panning via keyboard: else if(panzoomInstance) panzoomInstance.pan(-10, 0, {relative: true});
            } else if (event.key === 'Escape') {
                closeComic();
            }
             // Optional: Add keyboard zoom?
             // else if (event.key === '+' || event.key === '=') { panzoomInstance?.zoomIn(); }
             // else if (event.key === '-' || event.key === '_') { panzoomInstance?.zoomOut(); }
        }
    });

    // Initial setup
    updateNavigation();

}); // End DOMContentLoaded