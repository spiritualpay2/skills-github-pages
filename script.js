document.addEventListener('DOMContentLoaded', () => {
    // Existing variables...
    const fileInput = document.getElementById('file-input');
    const landingPage = document.getElementById('landing-page');
    const viewerPage = document.getElementById('viewer-page');
    const loadingMessage = document.getElementById('loading-message');
    const errorMessage = document.getElementById('error-message');
    const fileNameDisplay = document.getElementById('file-name');
    const pageIndicator = document.getElementById('page-indicator');
    const prevButton = document.getElementById('prev-page');
    const nextButton = document.getElementById('next-page');
    const imageContainer = document.getElementById('image-container');
    const currentPageImage = document.getElementById('current-page-image');
    const closeButton = document.getElementById('close-viewer');

    let currentZip = null;
    let imageFiles = [];
    let currentPageIndex = 0;
    let currentObjectUrl = null;

    // --- Zoom and Pan state ---
    let currentScale = 1;
    const minScale = 0.3; // Allow zooming out slightly from initial fit
    const maxScale = 10;  // Max zoom level
    const zoomStep = 0.15; // Zoom sensitivity

    let isPanning = false;
    let startPanX = 0;
    let startPanY = 0;
    let startScrollX = 0;
    let startScrollY = 0;

    // --- Event Listeners ---
    fileInput.addEventListener('change', handleFileSelect);
    prevButton.addEventListener('click', showPrevPage);
    nextButton.addEventListener('click', showNextPage);
    closeButton.addEventListener('click', closeViewer);
    document.addEventListener('keydown', handleKeyPress);
    imageContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
    imageContainer.addEventListener('mousedown', handlePanStart);
    document.addEventListener('mousemove', handlePanMove);
    document.addEventListener('mouseup', handlePanEnd);
    document.addEventListener('mouseleave', handlePanEnd);

    // --- Core Functions ---

    function handleFileSelect(event) {
        // ... (same as before)
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError('Error: Please select a .cbz file.');
            resetFileInput();
            return;
        }

        showLoading(true);
        hideError();
        fileNameDisplay.textContent = file.name;
        // No need to resetZoomPanState here, displayPage will do it
        // resetZoomPanState();

        const reader = new FileReader();
        reader.onload = function(e) { processZipFile(e.target.result); };
        reader.onerror = function() {
            showError('Error reading file.'); showLoading(false); resetFileInput();
        };
        reader.readAsArrayBuffer(file);
    }

    async function processZipFile(arrayBuffer) {
        // ... (same as before)
         try {
            currentZip = await JSZip.loadAsync(arrayBuffer);
            imageFiles = [];
            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

            currentZip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir && imageExtensions.some(ext => relativePath.toLowerCase().endsWith(ext))) {
                   imageFiles.push(zipEntry);
                }
            });

            imageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

            if (imageFiles.length === 0) {
                showError('Error: No images found in the CBZ file.'); showLoading(false); resetFileInput(); return;
            }

            currentPageIndex = 0;
            await displayPage(currentPageIndex); // displayPage resets zoom/pan
            updateUI();
            showViewer();

        } catch (error) {
            console.error("Error processing ZIP:", error);
            showError(`Error processing CBZ file: ${error.message || error}`);
            resetState();
        } finally {
            showLoading(false);
        }
    }

    async function displayPage(index) {
        if (!currentZip || index < 0 || index >= imageFiles.length) return;

        // --- Reset state for the new page ---
        resetZoomPanState(); // Reset scale, pan flag
        applyTransform();    // Apply scale(1) transform

        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        // Temporarily hide image to prevent flash of old scaled image
        currentPageImage.style.visibility = 'hidden';
        currentPageImage.src = ''; // Clear previous image

        const imageEntry = imageFiles[index];

        try {
            const blob = await imageEntry.async('blob');
            currentObjectUrl = URL.createObjectURL(blob);

            currentPageImage.onload = () => {
                // Image dimensions are now known
                // Reset scroll position AFTER image has loaded and rendered in its initial fitted size
                imageContainer.scrollTop = 0;
                imageContainer.scrollLeft = 0;
                // Make image visible again
                currentPageImage.style.visibility = 'visible';
                updatePanCursor(); // Ensure cursor is correct for scale=1
            };
            currentPageImage.onerror = () => {
                 console.error("Error loading image resource:", currentObjectUrl);
                 showError(`Error loading image for page ${index + 1}`);
                 currentPageImage.alt = `Error loading page ${index + 1}`;
                 currentPageImage.style.visibility = 'visible'; // Make alt text visible
            };

            currentPageImage.src = currentObjectUrl; // Set src to trigger load

        } catch (error) {
            console.error("Error loading image blob:", error);
            showError(`Error displaying page ${index + 1}: ${error.message}`);
            currentPageImage.alt = `Error loading page ${index + 1}`;
            currentPageImage.style.visibility = 'visible'; // Make alt text visible
            resetZoomPanState(); // Ensure state is reset even on error
            applyTransform();
        }
    }

    function showPrevPage() {
        if (currentPageIndex > 0) {
            currentPageIndex--;
            displayPage(currentPageIndex);
            updateUI();
        }
    }

    function showNextPage() {
        if (currentPageIndex < imageFiles.length - 1) {
            currentPageIndex++;
            displayPage(currentPageIndex);
            updateUI();
        }
    }

     function handleKeyPress(event) {
        if (viewerPage.classList.contains('hidden')) return;

        switch (event.key) {
            case 'ArrowLeft':
                // Prevent page turn if user might be trying to scroll horizontally when zoomed
                if (!isPanning && document.activeElement !== imageContainer) {
                     showPrevPage();
                }
                break;
            case 'ArrowRight':
                 // Prevent page turn if user might be trying to scroll horizontally when zoomed
                 if (!isPanning && document.activeElement !== imageContainer) {
                     showNextPage();
                 }
                break;
            case 'Escape':
                 closeViewer();
                 break;
             case '+':
             case '=':
                 handleWheelZoom({ deltaY: -100, clientX: imageContainer.clientWidth / 2, clientY: imageContainer.clientHeight / 2, preventDefault: () => {} });
                 break;
             case '-':
                 handleWheelZoom({ deltaY: 100, clientX: imageContainer.clientWidth / 2, clientY: imageContainer.clientHeight / 2, preventDefault: () => {} });
                 break;
             case '0': // Reset zoom and pan
                 resetZoomPanState();
                 applyTransform();
                 // Manually reset scroll after transform applied
                 imageContainer.scrollTop = 0;
                 imageContainer.scrollLeft = 0;
                 break;
        }
    }

    function closeViewer() {
        resetState();
        showLanding();
    }

    // --- Zoom and Pan Functions ---

    function handleWheelZoom(event) {
        event.preventDefault();

        const rect = imageContainer.getBoundingClientRect();
        const scrollX = imageContainer.scrollLeft;
        const scrollY = imageContainer.scrollTop;

        // Pointer position relative to the container's top-left corner
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;

        // Calculate the point on the *unscaled* image that is under the pointer
        // Uses current scroll and scale. Crucial because transform-origin is 0,0.
        const imageX = (scrollX + pointerX) / currentScale;
        const imageY = (scrollY + pointerY) / currentScale;

        // Determine zoom direction and calculate new scale
        const delta = -event.deltaY;
        const scaleAmount = 1 + (delta > 0 ? zoomStep : -zoomStep);
        const newScale = Math.max(minScale, Math.min(maxScale, currentScale * scaleAmount));

        // Calculate the new scroll position to keep the pointe`d image location
        // stationary under the cursor.
        // newScroll = (imagePoint * newScale) - pointerOffset
        const newScrollX = imageX * newScale - pointerX;
        const newScrollY = imageY * newScale - pointerY;

        // Apply the new scale first
        currentScale = newScale;
        applyTransform();

        // --- Apply scroll AFTER transform ---
        // Disable smooth scrolling temporarily for programmatic scroll adjustment
        const originalScrollBehavior = imageContainer.style.scrollBehavior;
        imageContainer.style.scrollBehavior = 'auto';

        imageContainer.scrollLeft = newScrollX;
        imageContainer.scrollTop = newScrollY;

        // Restore original scroll behavior
        imageContainer.style.scrollBehavior = originalScrollBehavior;

        updatePanCursor();
    }


    function handlePanStart(event) {
        // Allow panning only if image is actually scrollable (overflowing)
        if (imageContainer.scrollHeight <= imageContainer.clientHeight &&
            imageContainer.scrollWidth <= imageContainer.clientWidth) {
            return; // No need to pan if image fits
        }
        // Only pan with primary button
        if (event.button !== 0) return;

        event.preventDefault();
        isPanning = true;
        startPanX = event.clientX;
        startPanY = event.clientY;
        startScrollX = imageContainer.scrollLeft;
        startScrollY = imageContainer.scrollTop;
        imageContainer.classList.add('panning');
        // Disable smooth scroll during drag
        imageContainer.style.scrollBehavior = 'auto';
    }

    function handlePanMove(event) {
        if (!isPanning) return;
        event.preventDefault(); // Good practice during drag operations

        const dx = event.clientX - startPanX;
        const dy = event.clientY - startPanY;

        imageContainer.scrollLeft = startScrollX - dx;
        imageContainer.scrollTop = startScrollY - dy;
    }

    function handlePanEnd(event) {
        if (!isPanning) return;
        isPanning = false;
        imageContainer.classList.remove('panning');
        // Restore smooth scroll if it was set (or remove the style)
        imageContainer.style.scrollBehavior = ''; // Or restore to 'smooth' if needed
    }


    function applyTransform() {
        // Apply scale based on top-left origin
        currentPageImage.style.transform = `scale(${currentScale})`;
    }

     function resetZoomPanState() {
        currentScale = 1;
        isPanning = false;
        // Don't reset scroll here, do it in displayPage.onload or handleKeyPress(0)
        // imageContainer.scrollTop = 0;
        // imageContainer.scrollLeft = 0;
        // Apply transform is done separately where needed
        updatePanCursor(); // Update cursor based on scale=1
     }

     function updatePanCursor() {
         // Allow grabbing if the content is scrollable
         if (imageContainer.scrollHeight > imageContainer.clientHeight ||
             imageContainer.scrollWidth > imageContainer.clientWidth) {
            imageContainer.style.cursor = isPanning ? 'grabbing' : 'grab';
         } else {
            imageContainer.style.cursor = 'default';
         }
     }

    // --- UI Update Functions ---
    function updateUI() {
        if (!imageFiles || imageFiles.length === 0) return;
        pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${imageFiles.length}`;
        prevButton.disabled = currentPageIndex === 0;
        nextButton.disabled = currentPageIndex === imageFiles.length - 1;
        // updatePanCursor(); // Cursor updated more dynamically now
    }

    function showLoading(isLoading) { /* ... same ... */
        loadingMessage.classList.toggle('hidden', !isLoading);
    }
    function showError(message) { /* ... same ... */
         errorMessage.textContent = message;
         errorMessage.classList.remove('hidden');
    }
    function hideError() { /* ... same ... */
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
    }
    function showViewer() { /* ... same ... */
        landingPage.classList.add('hidden');
        viewerPage.classList.remove('hidden');
        // Update cursor state when viewer becomes visible
        // Need a slight delay maybe for layout? Or call from displayPage.onload
        // setTimeout(updatePanCursor, 0); // updatePanCursor called in displayPage.onload now
    }
    function showLanding() { /* ... same ... */
        landingPage.classList.remove('hidden');
        viewerPage.classList.add('hidden');
    }
    function resetFileInput() { /* ... same ... */
        fileInput.value = '';
    }

    function resetState() {
        // ... (cleanup object URL, zip, files, index, image src etc) ...
        if (currentObjectUrl) { URL.revokeObjectURL(currentObjectUrl); }
        currentZip = null; imageFiles = []; currentPageIndex = 0;
        currentObjectUrl = null; currentPageImage.src = ''; currentPageImage.alt = 'Comic Page';
        fileNameDisplay.textContent = '';
        hideError(); showLoading(false); resetFileInput();

        // Reset zoom/pan state AND ensure visual reset
        resetZoomPanState();
        applyTransform();
        // Explicitly clear scroll on container too when closing file
        imageContainer.scrollTop = 0;
        imageContainer.scrollLeft = 0;
        updatePanCursor();
    }
});