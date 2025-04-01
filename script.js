document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const fileNameDisplay = document.getElementById('fileName');
    const viewer = document.getElementById('viewer');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorIndicator = document.getElementById('errorIndicator');
    const comicPage = document.getElementById('comicPage');
    const imageContainer = document.querySelector('.image-container');
    const prevPageButton = document.getElementById('prevPage');
    const nextPageButton = document.getElementById('nextPage');
    const pageIndicator = document.getElementById('pageIndicator');

    // Zoom elements
    const zoomInButton = document.getElementById('zoomIn');
    const zoomOutButton = document.getElementById('zoomOut');
    const zoomFitButton = document.getElementById('zoomFit');
    const zoomLevelDisplay = document.getElementById('zoomLevel');

    let zip = null;
    let sortedImageFiles = [];
    let currentPageIndex = 0;
    let currentBlobUrl = null;

    // Zoom and Pan state
    let currentZoom = 1.0;
    let isPanning = false;
    let startX, startY, scrollLeftStart, scrollTopStart;
    const ZOOM_STEP = 0.15;
    const MAX_ZOOM = 5.0;
    const MIN_ZOOM = 0.2;


    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            resetViewer();
            return;
        }

        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError('Error: Please select a .cbz file.');
            resetViewer(false); // Keep file name displayed
            fileNameDisplay.textContent = file.name + " (Invalid type)";
            return;
        }

        fileNameDisplay.textContent = file.name;
        viewer.style.display = 'flex'; // Show viewer area
        loadingIndicator.style.display = 'block';
        errorIndicator.style.display = 'none';
        comicPage.style.display = 'none'; // Hide image while loading
        document.querySelector('.navigation').style.display = 'none'; // Hide nav
        document.querySelector('.zoom-controls').style.display = 'none'; // Hide zoom

        const reader = new FileReader();

        reader.onload = function(e) {
            loadZip(e.target.result);
        };

        reader.onerror = function(e) {
            showError('Error reading file.');
            resetViewer(false);
        }

        reader.readAsArrayBuffer(file);
    }

    async function loadZip(arrayBuffer) {
        try {
            zip = await JSZip.loadAsync(arrayBuffer);
            sortedImageFiles = [];

            // Find all image files, case-insensitive, handling subdirectories
            const imagePromises = [];
            zip.forEach((relativePath, zipEntry) => {
                const lowerCasePath = relativePath.toLowerCase();
                if (!zipEntry.dir && /\.(jpg|jpeg|png|gif|webp)$/.test(lowerCasePath)) {
                     // Store both the path and the zip entry object
                    sortedImageFiles.push({ path: relativePath, entry: zipEntry });
                }
            });

            // Sort files naturally (important for page order, e.g., page1.jpg, page2.jpg, page10.jpg)
             sortedImageFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));


            if (sortedImageFiles.length === 0) {
                showError('Error: No images found in the CBZ file.');
                resetViewer(false);
                return;
            }

            // Initialization successful
            loadingIndicator.style.display = 'none';
            comicPage.style.display = 'block';
            document.querySelector('.navigation').style.display = 'flex';
            document.querySelector('.zoom-controls').style.display = 'flex';
            currentPageIndex = 0;
            await displayPage(currentPageIndex);
            resetZoomAndPan(); // Reset zoom when new file loads

        } catch (error) {
            console.error("JSZip error:", error);
            showError(`Error loading CBZ: ${error.message || 'Unknown error'}`);
            resetViewer(false);
        }
    }

    async function displayPage(index) {
        if (!zip || index < 0 || index >= sortedImageFiles.length) {
            console.error("Invalid page index or zip not loaded");
            return;
        }

        loadingIndicator.style.display = 'block'; // Show loading briefly
        comicPage.style.visibility = 'hidden'; // Hide while loading new image

        // Clean up the previous blob URL to prevent memory leaks
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }

        try {
            const fileEntry = sortedImageFiles[index].entry;
            const blob = await fileEntry.async('blob');
            currentBlobUrl = URL.createObjectURL(blob);

            comicPage.src = currentBlobUrl;
            // Wait for image to load metadata before showing (prevents flicker)
            comicPage.onload = () => {
                 loadingIndicator.style.display = 'none';
                 comicPage.style.visibility = 'visible';
                 updateUIState();
                 // Apply zoom AFTER image is loaded and dimensions are known
                 applyZoom();
                 // Scroll to top left when page changes if zoomed
                 imageContainer.scrollTop = 0;
                 imageContainer.scrollLeft = 0;
            }
            comicPage.onerror = () => {
                 showError(`Error loading image: ${fileEntry.name}`);
                 loadingIndicator.style.display = 'none';
            }


        } catch (error) {
            console.error("Error displaying page:", error);
            showError(`Error displaying page ${index + 1}: ${error.message}`);
            loadingIndicator.style.display = 'none';
        }
    }

    function updateUIState() {
        if (sortedImageFiles.length > 0) {
            pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${sortedImageFiles.length}`;
            prevPageButton.disabled = currentPageIndex === 0;
            nextPageButton.disabled = currentPageIndex === sortedImageFiles.length - 1;
            document.querySelector('.navigation').style.display = 'flex';
             document.querySelector('.zoom-controls').style.display = 'flex';
        } else {
            pageIndicator.textContent = 'Page 0 / 0';
            prevPageButton.disabled = true;
            nextPageButton.disabled = true;
            document.querySelector('.navigation').style.display = 'none';
             document.querySelector('.zoom-controls').style.display = 'none';
        }
         updateZoomDisplay();
    }

     function updateZoomDisplay() {
        zoomLevelDisplay.textContent = `Zoom: ${Math.round(currentZoom * 100)}%`;
        zoomInButton.disabled = currentZoom >= MAX_ZOOM;
        zoomOutButton.disabled = currentZoom <= MIN_ZOOM;
     }


    function showError(message) {
        loadingIndicator.style.display = 'none';
        errorIndicator.textContent = message;
        errorIndicator.style.display = 'block';
        comicPage.style.display = 'none';
         document.querySelector('.navigation').style.display = 'none';
         document.querySelector('.zoom-controls').style.display = 'none';
    }

    function resetViewer(clearFileName = true) {
        zip = null;
        sortedImageFiles = [];
        currentPageIndex = 0;
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = null;
        }
        comicPage.src = '';
        viewer.style.display = 'none'; // Hide viewer area
        loadingIndicator.style.display = 'block'; // Show loading by default if viewer shown
        errorIndicator.style.display = 'none';
        if (clearFileName) {
            fileNameDisplay.textContent = 'No file selected';
            fileInput.value = ''; // Clear the file input visually
        }
        updateUIState();
        resetZoomAndPan();
    }


    // --- Navigation ---
    prevPageButton.addEventListener('click', () => {
        if (currentPageIndex > 0) {
            currentPageIndex--;
            displayPage(currentPageIndex);
        }
    });

    nextPageButton.addEventListener('click', () => {
        if (currentPageIndex < sortedImageFiles.length - 1) {
            currentPageIndex++;
            displayPage(currentPageIndex);
        }
    });

    // Keyboard navigation
     document.addEventListener('keydown', (e) => {
        // Only navigate if a comic is loaded
        if (sortedImageFiles.length === 0 || viewer.style.display === 'none') return;

        // Prevent scrolling page when using arrow keys for navigation
         if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
            // Only prevent default if focused outside of text input elements if any were added
             if (document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                 e.preventDefault();
             }
        }

        switch(e.key) {
            case 'ArrowLeft':
            case 'PageUp':
                prevPageButton.click();
                break;
            case 'ArrowRight':
            case 'PageDown':
                nextPageButton.click();
                break;
             case 'Home':
                 if (currentPageIndex !== 0) {
                     currentPageIndex = 0;
                     displayPage(currentPageIndex);
                 }
                 break;
             case 'End':
                 if (currentPageIndex !== sortedImageFiles.length - 1) {
                     currentPageIndex = sortedImageFiles.length - 1;
                     displayPage(currentPageIndex);
                 }
                 break;
             // Basic zoom with + / -
             case '+':
             case '=': // Often shares key with +
                 zoomInButton.click();
                 break;
             case '-':
             case '_': // Often shares key with -
                 zoomOutButton.click();
                 break;

        }
    });


    // --- Zoom and Pan ---
    function applyZoom() {
        // Reset transform origin for accurate scaling from center
        comicPage.style.transformOrigin = 'center center';
        // Apply scale
        comicPage.style.transform = `scale(${currentZoom})`;

         // Check if image overflows container AFTER scaling
        const overflowsX = comicPage.offsetWidth * currentZoom > imageContainer.clientWidth;
        const overflowsY = comicPage.offsetHeight * currentZoom > imageContainer.clientHeight;

         // Enable/disable grab cursor based on overflow
        if (overflowsX || overflowsY) {
            comicPage.style.cursor = 'grab';
        } else {
             comicPage.style.cursor = 'default'; // Or 'auto'
             // Recenter if it no longer overflows
             imageContainer.scrollTop = (imageContainer.scrollHeight - imageContainer.clientHeight) / 2;
             imageContainer.scrollLeft = (imageContainer.scrollWidth - imageContainer.clientWidth) / 2;
        }

         updateZoomDisplay();
    }

    function resetZoomAndPan() {
        currentZoom = 1.0;
        comicPage.style.transform = 'scale(1.0)';
        imageContainer.scrollTop = 0;
        imageContainer.scrollLeft = 0;
        applyZoom(); // Update UI elements related to zoom
    }


    zoomInButton.addEventListener('click', () => {
        currentZoom = Math.min(currentZoom + ZOOM_STEP, MAX_ZOOM);
        applyZoom();
    });

    zoomOutButton.addEventListener('click', () => {
        currentZoom = Math.max(currentZoom - ZOOM_STEP, MIN_ZOOM);
        applyZoom();
    });

     zoomFitButton.addEventListener('click', () => {
        resetZoomAndPan();
    });

    // Panning logic - mouse
    comicPage.addEventListener('mousedown', (e) => {
        // Only allow panning if zoomed in enough to cause overflow
        if (comicPage.offsetWidth * currentZoom > imageContainer.clientWidth ||
            comicPage.offsetHeight * currentZoom > imageContainer.clientHeight)
        {
            isPanning = true;
            comicPage.style.cursor = 'grabbing'; // Change cursor
            startX = e.pageX - imageContainer.offsetLeft; // Position relative to container
            startY = e.pageY - imageContainer.offsetTop;
            scrollLeftStart = imageContainer.scrollLeft;
            scrollTopStart = imageContainer.scrollTop;
            // Prevent default image dragging behavior
            e.preventDefault();
        }
    });

    comicPage.addEventListener('mouseleave', () => {
        if (isPanning) {
            isPanning = false;
             comicPage.style.cursor = 'grab'; // Revert cursor if still pannable
        }
    });

    comicPage.addEventListener('mouseup', () => {
        if (isPanning) {
            isPanning = false;
             comicPage.style.cursor = 'grab'; // Revert cursor if still pannable
        }
    });

    comicPage.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        e.preventDefault();
        const x = e.pageX - imageContainer.offsetLeft;
        const y = e.pageY - imageContainer.offsetTop;
        const walkX = (x - startX); // Multiply by sensitivity factor if needed
        const walkY = (y - startY);
        imageContainer.scrollLeft = scrollLeftStart - walkX;
        imageContainer.scrollTop = scrollTopStart - walkY;
    });

    // Initial UI state
    resetViewer();

}); // End DOMContentLoaded