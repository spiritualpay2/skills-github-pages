document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('cbz-input');
    const uploadContainer = document.getElementById('upload-container');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
    const viewerContainer = document.getElementById('viewer-container');
    const comicImage = document.getElementById('comic-image');
    const comicDisplay = document.getElementById('comic-display');
    const pageIndicator = document.getElementById('page-indicator');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const zoomResetButton = document.getElementById('zoom-reset');
    const closeButton = document.getElementById('close-viewer');

    let zip = null;
    let imageFiles = [];
    let currentPageIndex = 0;
    let currentZoom = 1.0;
    let isDragging = false;
    let startX, startY, translateX = 0, translateY = 0;
    let currentImageObjectUrl = null; // To manage memory

    // --- File Handling ---
    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Basic validation
        if (!file.name.toLowerCase().endsWith('.cbz') && !file.name.toLowerCase().endsWith('.zip')) {
            showError('Please select a .cbz or .zip file.');
            resetFileInput();
            return;
        }

        showLoading(true);
        clearError();
        resetViewerState(); // Reset state before loading new file

        const reader = new FileReader();
        reader.onload = function(e) {
            JSZip.loadAsync(e.target.result)
                .then(processZip)
                .catch(err => {
                    console.error("Error reading zip file:", err);
                    showError('Failed to read CBZ file. It might be corrupted or not a valid ZIP archive.');
                    showLoading(false);
                    resetFileInput();
                });
        };
        reader.onerror = function() {
            showError('Error reading file.');
            showLoading(false);
            resetFileInput();
        };
        reader.readAsArrayBuffer(file);
    }

    function processZip(loadedZip) {
        zip = loadedZip;
        imageFiles = [];
        const imageExtensions = /\.(jpg|jpeg|png|gif|webp)$/i;

        // Filter and sort image files
        const filePromises = [];
        zip.forEach((relativePath, zipEntry) => {
            // Ignore directories and non-image files, also common metadata files
            if (!zipEntry.dir && imageExtensions.test(relativePath.toLowerCase()) && !relativePath.startsWith('__MACOSX/')) {
                 // Store the zipEntry directly for later async loading
                 imageFiles.push({ name: relativePath.toLowerCase(), entry: zipEntry });
            }
        });

        // Sort files alphabetically/numerically (natural sort preferred but basic sort is okay)
        imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));


        if (imageFiles.length === 0) {
            showError('No images found in the CBZ file.');
            showLoading(false);
            resetFileInput();
            return;
        }

        currentPageIndex = 0;
        loadPage(currentPageIndex);
        updatePageIndicator();
        updateNavButtons();

        uploadContainer.classList.add('hidden');
        viewerContainer.classList.remove('hidden');
        showLoading(false);
    }

    // --- Page Loading & Display ---
    function loadPage(index) {
        if (!zip || index < 0 || index >= imageFiles.length) {
            console.warn(`Attempted to load invalid page index: ${index}`);
            return;
        }

        const { entry } = imageFiles[index];
        comicImage.style.opacity = '0.5'; // Indicate loading

        // Revoke the previous object URL to free memory
        if (currentImageObjectUrl) {
            URL.revokeObjectURL(currentImageObjectUrl);
            currentImageObjectUrl = null;
        }

        entry.async('blob')
            .then(blob => {
                currentImageObjectUrl = URL.createObjectURL(blob);
                comicImage.src = currentImageObjectUrl;
                // Reset zoom and pan on page change
                resetZoomAndPan();
                comicImage.style.opacity = '1';
            })
            .catch(err => {
                console.error(`Error loading image ${entry.name}:`, err);
                showError(`Failed to load page ${index + 1}.`);
                comicImage.style.opacity = '1'; // Restore opacity even on error
            });
    }

    comicImage.onload = () => {
        // Optional: Any actions needed after image dimensions are known
        console.log(`Image loaded: ${comicImage.naturalWidth}x${comicImage.naturalHeight}`);
    };

    comicImage.onerror = () => {
        // This might catch errors not caught by the blob promise, like invalid image data
        showError(`Could not display image for page ${currentPageIndex + 1}.`);
         // Optionally display a placeholder image or message
        if (currentImageObjectUrl) {
            URL.revokeObjectURL(currentImageObjectUrl);
            currentImageObjectUrl = null;
        }
         comicImage.src = ""; // Clear the broken image source
    }


    // --- Navigation ---
    prevButton.addEventListener('click', showPrevPage);
    nextButton.addEventListener('click', showNextPage);

    // Add click navigation on the image itself
    comicDisplay.addEventListener('click', (event) => {
        // Prevent navigation if dragging/panning or clicking buttons overlayed
        if (isDragging || event.target !== comicImage) return;

        const clickX = event.offsetX; // Position relative to the image element
        const imageWidth = comicImage.clientWidth; // Displayed width

        if (clickX < imageWidth / 3) { // Click on left third
            showPrevPage();
        } else if (clickX > imageWidth * 2 / 3) { // Click on right third
            showNextPage();
        }
        // Clicks in the middle third do nothing for navigation
    });

    // Keyboard navigation
     document.addEventListener('keydown', (event) => {
        if (viewerContainer.classList.contains('hidden')) return; // Only when viewer is active

        switch (event.key) {
            case 'ArrowLeft':
            case 'PageUp':
                showPrevPage();
                break;
            case 'ArrowRight':
            case 'PageDown':
            case ' ': // Space bar often used for next page
                showNextPage();
                event.preventDefault(); // Prevent space bar from scrolling page
                break;
             case 'Home':
                 goToPage(0);
                 break;
             case 'End':
                 goToPage(imageFiles.length - 1);
                 break;
            case '+':
            case '=': // = is often shift+plus
                zoomIn();
                break;
            case '-':
            case '_':
                zoomOut();
                break;
            case '0':
            case 'r': // Reset zoom
                resetZoomAndPan();
                break;
            case 'Escape': // Close viewer
                 closeViewer();
                 break;
        }
    });

    function showPrevPage() {
        if (currentPageIndex > 0) {
            goToPage(currentPageIndex - 1);
        }
    }

    function showNextPage() {
        if (currentPageIndex < imageFiles.length - 1) {
             goToPage(currentPageIndex + 1);
        }
    }

     function goToPage(index) {
        if (index >= 0 && index < imageFiles.length) {
            currentPageIndex = index;
            loadPage(currentPageIndex);
            updatePageIndicator();
            updateNavButtons();
        }
    }

    function updatePageIndicator() {
        pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${imageFiles.length}`;
    }

    function updateNavButtons() {
        prevButton.disabled = currentPageIndex === 0;
        nextButton.disabled = currentPageIndex === imageFiles.length - 1;
    }

    // --- Zooming ---
    zoomInButton.addEventListener('click', zoomIn);
    zoomOutButton.addEventListener('click', zoomOut);
    zoomResetButton.addEventListener('click', resetZoomAndPan);

    function zoomIn() {
        applyZoom(currentZoom * 1.4); // Increase zoom by 40%
    }

    function zoomOut() {
        applyZoom(currentZoom / 1.4); // Decrease zoom
    }

    function resetZoomAndPan() {
        applyZoom(1.0);
        translateX = 0;
        translateY = 0;
        applyTransform(); // Apply the reset transform immediately
    }

    function applyZoom(newZoom) {
        // Clamp zoom level between min (e.g., 0.5) and max (e.g., 10)
        currentZoom = Math.max(0.5, Math.min(newZoom, 10));
         // If zoom is reset to 1, reset panning as well
        if (currentZoom === 1.0) {
            translateX = 0;
            translateY = 0;
        }
        applyTransform();
        zoomOutButton.disabled = currentZoom <= 0.5; // Disable zoom out if at min zoom
        zoomInButton.disabled = currentZoom >= 10; // Disable zoom in if at max zoom
    }

     // --- Panning (Simple Dragging) ---
    comicDisplay.addEventListener('mousedown', startDrag);
    comicDisplay.addEventListener('mousemove', drag);
    comicDisplay.addEventListener('mouseup', endDrag);
    comicDisplay.addEventListener('mouseleave', endDrag); // Stop dragging if mouse leaves area
    // Prevent context menu on image drag
    comicImage.addEventListener('contextmenu', (e) => e.preventDefault());

    function startDrag(event) {
        // Only allow dragging when zoomed in and using the left mouse button
        if (currentZoom > 1.0 && event.button === 0) {
            isDragging = true;
            startX = event.clientX - translateX; // Adjust start position by current translation
            startY = event.clientY - translateY;
            comicDisplay.style.cursor = 'grabbing'; // Change cursor while dragging
            comicImage.style.transition = 'none'; // Disable transition during drag for responsiveness
        }
    }

    function drag(event) {
        if (isDragging) {
            event.preventDefault(); // Prevent text selection/other default drag behaviors
            translateX = event.clientX - startX;
            translateY = event.clientY - startY;
            applyTransform();
        }
    }

    function endDrag() {
        if (isDragging) {
            isDragging = false;
            comicDisplay.style.cursor = 'grab';
             comicImage.style.transition = 'transform 0.1s ease-out'; // Re-enable transition
            // Optional: Add boundary checks here to prevent panning too far off-screen
        }
    }

    function applyTransform() {
         // Boundary checks (simple version): prevent panning too far
        const imageRect = comicImage.getBoundingClientRect();
        const displayRect = comicDisplay.getBoundingClientRect();

        // Calculate maximum allowed pan based on scaled image size vs container size
        const maxPanX = Math.max(0, (imageRect.width - displayRect.width) / 2);
        const maxPanY = Math.max(0, (imageRect.height - displayRect.height) / 2);

        // Clamp translation values
        translateX = Math.max(-maxPanX, Math.min(maxPanX, translateX));
        translateY = Math.max(-maxPanY, Math.min(maxPanY, translateY));


        comicImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${currentZoom})`;
    }

     // --- Close Viewer ---
    closeButton.addEventListener('click', closeViewer);

    function closeViewer() {
        resetViewerState();
        resetFileInput();
        viewerContainer.classList.add('hidden');
        uploadContainer.classList.remove('hidden');
    }

    // --- Utility Functions ---
    function showLoading(show) {
        loadingMessage.classList.toggle('hidden', !show);
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function clearError() {
        errorMessage.textContent = '';
        errorMessage.classList.add('hidden');
    }

    function resetFileInput() {
         // Easiest way to clear a file input is to reset the form it's in,
        // or just reset its value if it's not in a form.
        fileInput.value = '';
    }

     function resetViewerState() {
        // Release resources
        if (currentImageObjectUrl) {
            URL.revokeObjectURL(currentImageObjectUrl);
        }
        zip = null;
        imageFiles = [];
        currentPageIndex = 0;
        currentImageObjectUrl = null;
        resetZoomAndPan(); // Resets zoom and translation vars
        comicImage.src = ""; // Clear image
        // No need to reset error/loading messages here, handled by callers
    }

});
