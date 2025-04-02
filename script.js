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

    // --- New state variables for Zoom and Pan ---
    let currentScale = 1;
    const minScale = 0.5; // Minimum zoom level
    const maxScale = 8;   // Maximum zoom level
    const zoomStep = 0.1; // How much to zoom per scroll step

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

    // --- New Event Listeners for Zoom and Pan ---
    imageContainer.addEventListener('wheel', handleWheelZoom, { passive: false }); // Need preventDefault
    imageContainer.addEventListener('mousedown', handlePanStart);
    // Add mousemove/mouseup to document to capture events even if cursor leaves the container
    document.addEventListener('mousemove', handlePanMove);
    document.addEventListener('mouseup', handlePanEnd);
    document.addEventListener('mouseleave', handlePanEnd); // Handle case where mouse leaves window

    // --- Core Functions (handleFileSelect, processZipFile remain mostly the same) ---
    // ... (handleFileSelect, processZipFile from previous version) ...
     function handleFileSelect(event) {
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
        resetZoomPanState(); // Reset zoom/pan before loading new file

        const reader = new FileReader();

        reader.onload = function(e) {
            processZipFile(e.target.result);
        };

        reader.onerror = function() {
            showError('Error reading file.');
            showLoading(false);
            resetFileInput();
        };

        reader.readAsArrayBuffer(file);
    }

    async function processZipFile(arrayBuffer) {
        try {
            currentZip = await JSZip.loadAsync(arrayBuffer);
            imageFiles = [];

            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];

            const filePromises = [];
            currentZip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir) {
                    const lowerCasePath = relativePath.toLowerCase();
                    if (imageExtensions.some(ext => lowerCasePath.endsWith(ext))) {
                       imageFiles.push(zipEntry);
                    }
                }
            });

            imageFiles.sort((a, b) => {
                 return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });

            if (imageFiles.length === 0) {
                showError('Error: No images found in the CBZ file.');
                showLoading(false);
                resetFileInput();
                return;
            }

            currentPageIndex = 0;
            await displayPage(currentPageIndex); // This will also reset zoom/pan
            updateUI();
            showViewer();

        } catch (error) {
            console.error("Error processing ZIP:", error);
            showError(`Error processing CBZ file: ${error.message || error}`);
            resetState(); // resetState also calls resetZoomPanState
        } finally {
            showLoading(false);
        }
    }


    async function displayPage(index) {
        if (!currentZip || index < 0 || index >= imageFiles.length) {
            console.warn("Invalid page index or no zip loaded:", index);
            return;
        }

        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        // Reset zoom and pan state for the new page
        resetZoomPanState(); // <--- IMPORTANT
        applyTransform();    // Apply the reset transform

        currentPageImage.src = ''; // Clear previous image

        const imageEntry = imageFiles[index];

        try {
            const blob = await imageEntry.async('blob');
            currentObjectUrl = URL.createObjectURL(blob);
            currentPageImage.src = currentObjectUrl;

            // Wait for image metadata to load to set initial size correctly (optional but good)
            currentPageImage.onload = () => {
                 // You could potentially set an initial scale based on image/container size here
                 // For now, we just ensure it's loaded before potentially zooming/panning
                 console.log("Image loaded, dimensions:", currentPageImage.naturalWidth, currentPageImage.naturalHeight);
                  // Reset scroll position AFTER image has loaded and potentially caused reflow
                 imageContainer.scrollTop = 0;
                 imageContainer.scrollLeft = 0;
            };
            currentPageImage.onerror = () => {
                 console.error("Error loading image resource:", currentObjectUrl);
                 showError(`Error loading image for page ${index + 1}`);
                 currentPageImage.alt = `Error loading page ${index + 1}`;
            }


        } catch (error) {
            console.error("Error loading image blob:", error);
            showError(`Error displaying page ${index + 1}: ${error.message}`);
            currentPageImage.alt = `Error loading page ${index + 1}`;
        }
    }

    function showPrevPage() {
        if (currentPageIndex > 0) {
            currentPageIndex--;
            displayPage(currentPageIndex); // displayPage now resets zoom/pan
            updateUI();
        }
    }

    function showNextPage() {
        if (currentPageIndex < imageFiles.length - 1) {
            currentPageIndex++;
            displayPage(currentPageIndex); // displayPage now resets zoom/pan
            updateUI();
        }
    }

    function handleKeyPress(event) {
        if (viewerPage.classList.contains('hidden')) return;

        // Allow arrow keys only if not zoomed in or if focus is not on container?
        // For simplicity, let's allow them always for now.
        switch (event.key) {
            case 'ArrowLeft':
                showPrevPage();
                break;
            case 'ArrowRight':
                showNextPage();
                break;
            case 'Escape':
                 closeViewer();
                 break;
             // Add keys for zooming maybe? + / -
             case '+':
             case '=': // Often shares key with +
                 // Simulate wheel zoom in
                 handleWheelZoom({ deltaY: -100, clientX: imageContainer.clientWidth / 2, clientY: imageContainer.clientHeight / 2, preventDefault: () => {} });
                 break;
             case '-':
                 // Simulate wheel zoom out
                 handleWheelZoom({ deltaY: 100, clientX: imageContainer.clientWidth / 2, clientY: imageContainer.clientHeight / 2, preventDefault: () => {} });
                 break;
             case '0': // Reset zoom
                 resetZoomPanState();
                 applyTransform();
                 break;
        }
    }

    function closeViewer() {
        resetState(); // This now includes resetting zoom/pan
        showLanding();
    }

    // --- New Zoom and Pan Functions ---

    function handleWheelZoom(event) {
        event.preventDefault(); // Prevent default page scroll

        const rect = imageContainer.getBoundingClientRect();

        // Calculate pointer position relative to the container
        const pointerX = event.clientX - rect.left;
        const pointerY = event.clientY - rect.top;

        // Calculate pointer position relative to the *image* (before zoom)
        // This needs the current scroll and scale to be accurate
        const imageX = (pointerX + imageContainer.scrollLeft) / currentScale;
        const imageY = (pointerY + imageContainer.scrollTop) / currentScale;


        // Determine zoom direction
        const delta = -event.deltaY; // Positive for zoom in, negative for zoom out
        const scaleAmount = 1 + (delta > 0 ? zoomStep : -zoomStep);

        // Calculate new scale, clamped within limits
        const newScale = Math.max(minScale, Math.min(maxScale, currentScale * scaleAmount));

        // Calculate how much scroll needs to change to keep the pointer over the same image point
        const newScrollX = imageX * newScale - pointerX;
        const newScrollY = imageY * newScale - pointerY;


        // Update state and apply
        currentScale = newScale;
        applyTransform();

        // Apply new scroll position *after* transform has been applied
        imageContainer.scrollLeft = newScrollX;
        imageContainer.scrollTop = newScrollY;

        updatePanCursor(); // Update cursor based on new scale
    }


    function handlePanStart(event) {
        // Only pan with the primary mouse button (usually left)
        if (event.button !== 0) return;
        // Only pan if zoomed in enough to make panning useful
        // Or always allow panning? Let's allow always for now, easier.
         // if (currentScale <= 1) return;


        event.preventDefault(); // Prevent image dragging/text selection
        isPanning = true;
        startPanX = event.clientX;
        startPanY = event.clientY;
        startScrollX = imageContainer.scrollLeft;
        startScrollY = imageContainer.scrollTop;
        imageContainer.classList.add('panning'); // Change cursor
        imageContainer.style.scrollBehavior = 'auto'; // Ensure smooth scrolling doesn't interfere during drag
    }

    function handlePanMove(event) {
        if (!isPanning) return;

        event.preventDefault();

        const dx = event.clientX - startPanX;
        const dy = event.clientY - startPanY;

        // New scroll position is the starting scroll position minus the distance dragged
        imageContainer.scrollLeft = startScrollX - dx;
        imageContainer.scrollTop = startScrollY - dy;
    }

    function handlePanEnd(event) {
         // Check if panning was actually active (mouseup fires even without mousedown sometimes)
         if (!isPanning) return;

        // Check event type if needed, but usually just stopping is fine
        // if (event.type === 'mouseleave' && event.target !== document) return; // Ignore if leaving a child element

        isPanning = false;
        imageContainer.classList.remove('panning');
        imageContainer.style.scrollBehavior = 'smooth'; // Restore smooth scrolling if you use it elsewhere
    }


    function applyTransform() {
        // Apply scale centered initially, scroll adjustment handles zoom-to-point
        currentPageImage.style.transform = `scale(${currentScale})`;
    }

     function resetZoomPanState() {
        currentScale = 1;
        isPanning = false;
        // Reset scroll position
        imageContainer.scrollTop = 0;
        imageContainer.scrollLeft = 0;
        // Ensure transform is reset visually
        // applyTransform(); // Called in displayPage or separately
         currentPageImage.style.transform = `scale(1)`; // Direct reset
        updatePanCursor(); // Reset cursor
     }

     function updatePanCursor() {
          // Change cursor only if zoomed in (or always show grab?)
          if (currentScale > 1) {
               imageContainer.style.cursor = 'grab';
          } else {
               imageContainer.style.cursor = 'default'; // Or keep 'grab'? Let's use default when not zoomed.
          }
     }

    // --- UI Update Functions (updateUI, showLoading, etc. remain the same) ---
    // ... (updateUI, showLoading, showError, hideError, showViewer, showLanding, resetFileInput from previous version) ...
      function updateUI() {
        if (!imageFiles || imageFiles.length === 0) return;

        pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${imageFiles.length}`;
        prevButton.disabled = currentPageIndex === 0;
        nextButton.disabled = currentPageIndex === imageFiles.length - 1;
        updatePanCursor(); // Update cursor state based on zoom
    }

    function showLoading(isLoading) {
        loadingMessage.classList.toggle('hidden', !isLoading);
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.remove('hidden');
    }

    function hideError() {
        errorMessage.classList.add('hidden');
        errorMessage.textContent = '';
    }

    function showViewer() {
        landingPage.classList.add('hidden');
        viewerPage.classList.remove('hidden');
        // Ensure cursor is correct when viewer appears
         updatePanCursor();
    }

    function showLanding() {
        landingPage.classList.remove('hidden');
        viewerPage.classList.add('hidden');
    }

    function resetFileInput() {
         fileInput.value = '';
    }

    function resetState() {
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
        }
        currentZip = null;
        imageFiles = [];
        currentPageIndex = 0;
        currentObjectUrl = null;
        currentPageImage.src = '';
        currentPageImage.alt = 'Comic Page';
        fileNameDisplay.textContent = '';
        hideError();
        showLoading(false);
        resetFileInput();
        resetZoomPanState(); // <-- Reset zoom/pan state here too
        applyTransform(); // Ensure transform is visually reset
    }
});