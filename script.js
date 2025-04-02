document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const landingPage = document.getElementById('landing-page');
    const loadButton = document.getElementById('load-button');
    const fileInput = document.getElementById('file-input');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessage = document.getElementById('error-message');

    const viewer = document.getElementById('viewer');
    const imageContainer = document.getElementById('image-container');
    const comicImage = document.getElementById('comic-image');
    const controls = document.getElementById('controls');
    const prevButton = document.getElementById('prev-button');
    const nextButton = document.getElementById('next-button');
    const pageInfo = document.getElementById('page-info');
    const closeButton = document.getElementById('close-button');
    const zoomResetButton = document.getElementById('zoom-reset-button');
    const cursorHighlight = document.getElementById('cursor-highlight');


    // --- State Variables ---
    let zipReader = null;
    let imageFiles = [];
    let currentPageIndex = 0;
    let isPanning = false;
    let startX, startY, initialTranslateX, initialTranslateY;
    let translateX = 0;
    let translateY = 0;
    let zoomLevel = 1;
    const minZoom = 0.5;
    const maxZoom = 10;
    let controlsTimeout;

    // --- Event Listeners ---

    // Landing Page
    loadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Viewer Navigation
    prevButton.addEventListener('click', showPrevPage);
    nextButton.addEventListener('click', showNextPage);
    closeButton.addEventListener('click', closeComic);
    zoomResetButton.addEventListener('click', resetView);


    // Pan and Zoom Listeners (on the container)
    imageContainer.addEventListener('wheel', handleZoom, { passive: false }); // Prevent default scroll zoom page
    imageContainer.addEventListener('pointerdown', handlePanStart);
    imageContainer.addEventListener('pointermove', handlePanMove);
    imageContainer.addEventListener('pointerup', handlePanEnd);
    imageContainer.addEventListener('pointerleave', handlePanEnd); // Stop panning if mouse leaves

    // Keyboard Navigation
    document.addEventListener('keydown', handleKeyPress);

    // Cursor Highlight
    document.addEventListener('mousemove', moveCursorHighlight);

    // Controls Auto-Hide
    viewer.addEventListener('mousemove', showControlsTemporarily);
    viewer.addEventListener('mouseleave', hideControls); // Hide if mouse leaves viewer entirely

    // --- Functions ---

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        if (!file.name.toLowerCase().endsWith('.cbz')) {
            showError("Please select a valid CBZ file.");
            return;
        }

        showLoading(true);
        showError(""); // Clear previous errors

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                zipReader = await JSZip.loadAsync(e.target.result);
                imageFiles = await getImageFilesFromZip(zipReader);

                if (imageFiles.length === 0) {
                    throw new Error("No valid image files found in the CBZ.");
                }

                currentPageIndex = 0;
                resetView(); // Ensure view is reset for new comic
                await displayPage(currentPageIndex);
                showLoading(false);
                showViewer(true);
                showControlsTemporarily(); // Show controls initially
            } catch (err) {
                console.error("Error loading CBZ:", err);
                showError(`Error: ${err.message || "Could not load CBZ file."}`);
                showLoading(false);
                showViewer(false); // Ensure viewer is hidden on error
                closeComic(); // Reset state
            } finally {
                 // Reset file input to allow loading the same file again if needed
                 fileInput.value = null;
            }
        };
        reader.onerror = () => {
            showError("Error reading file.");
            showLoading(false);
            closeComic(); // Reset state
        };
        reader.readAsArrayBuffer(file);
    }

    async function getImageFilesFromZip(zip) {
        const imageExtensions = /\.(jpe?g|png|gif|webp)$/i;
        const files = [];
        // Collect all potential image files asynchronously
        const promises = [];
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && imageExtensions.test(relativePath)) {
                // Don't load data here, just store the entry reference
                files.push({ name: relativePath.toLowerCase(), entry: zipEntry });
            }
        });

        // Sort files naturally (handles cases like page 1, page 10, page 2)
        files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        // Now return just the sorted zipEntry objects
        return files.map(f => f.entry);
    }


    async function displayPage(index) {
        if (index < 0 || index >= imageFiles.length) return;

        currentPageIndex = index;
        showLoading(true); // Show loading indicator while image decodes
        comicImage.style.opacity = '0.5'; // Dim image while loading

        try {
            const zipEntry = imageFiles[index];
            const blob = await zipEntry.async('blob');
            const imageUrl = URL.createObjectURL(blob);

            // Preload image to get dimensions and ensure smooth display
            const tempImg = new Image();
            tempImg.onload = () => {
                comicImage.src = imageUrl;
                comicImage.style.opacity = '1';
                 // Revoke previous blob URL if it exists and is a blob URL
                if (comicImage.dataset.blobUrl) {
                    URL.revokeObjectURL(comicImage.dataset.blobUrl);
                }
                comicImage.dataset.blobUrl = imageUrl; // Store for later revocation

                updatePageInfo();
                // Optional: Reset zoom/pan per page? Generally not desired.
                // resetView();
                showLoading(false);
            };
            tempImg.onerror = () => {
                showError(`Error loading image: ${zipEntry.name}`);
                showLoading(false);
                 comicImage.style.opacity = '1'; // Restore opacity even on error
            }
            tempImg.src = imageUrl; // Start loading into temp image

        } catch (err) {
            console.error("Error displaying page:", err);
            showError(`Error displaying page ${index + 1}.`);
            showLoading(false);
            comicImage.style.opacity = '1'; // Restore opacity
        }
    }


    function updatePageInfo() {
        pageInfo.textContent = `Page ${currentPageIndex + 1} / ${imageFiles.length}`;
        prevButton.disabled = currentPageIndex === 0;
        nextButton.disabled = currentPageIndex === imageFiles.length - 1;
    }

    function showPrevPage() {
        if (currentPageIndex > 0) {
             resetView(); // Reset view when changing pages
             displayPage(currentPageIndex - 1);
        }
    }

    function showNextPage() {
        if (currentPageIndex < imageFiles.length - 1) {
             resetView(); // Reset view when changing pages
             displayPage(currentPageIndex + 1);
        }
    }

     function closeComic() {
        // Revoke the last image blob URL if it exists
        if (comicImage.dataset.blobUrl) {
            URL.revokeObjectURL(comicImage.dataset.blobUrl);
            delete comicImage.dataset.blobUrl;
        }
        comicImage.src = ""; // Clear image
        imageFiles = [];
        zipReader = null;
        currentPageIndex = 0;
        showViewer(false);
        resetView(); // Reset transforms
        clearTimeout(controlsTimeout); // Clear any pending hide
    }

    function resetView() {
        zoomLevel = 1;
        translateX = 0;
        translateY = 0;
        comicImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomLevel})`;
        comicImage.style.transformOrigin = `center center`; // Reset origin
    }

    function handleZoom(event) {
        event.preventDefault(); // Prevent page scroll

        const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1; // Zoom out/in factor
        const newZoomLevel = Math.max(minZoom, Math.min(maxZoom, zoomLevel * zoomFactor));

        // Calculate mouse position relative to the image container
        const rect = imageContainer.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Calculate the point on the image under the mouse before zoom
        const imgRect = comicImage.getBoundingClientRect();
        const imgX = (mouseX - (imgRect.left - rect.left)) / zoomLevel;
        const imgY = (mouseY - (imgRect.top - rect.top)) / zoomLevel;


        // Calculate new translation to keep the point under the mouse stationary
        // The new top-left corner of the image relative to the container should be:
        // newTranslateX = mouseX - imgX * newZoomLevel
        // newTranslateY = mouseY - imgY * newZoomLevel
        // However, our translate is applied *before* scale in the transform property.
        // We need to adjust the current translate based on the zoom change and mouse position.

        // Calculate the origin point relative to the *image's natural dimensions*
        // This requires knowing the image's actual size and position, which getBoundingClientRect helps with.

        // Simpler approach: Adjust translation based on mouse position relative to center
        // This works reasonably well, especially if transform-origin is updated.

        const originX = (mouseX / rect.width) * 100;
        const originY = (mouseY / rect.height) * 100;
        comicImage.style.transformOrigin = `${originX}% ${originY}%`;

        // Calculate how much the translation needs to change to center the zoom
        // This part is tricky and often requires calculating the offset caused by the zoom relative to the origin
        // Let's stick to updating transform-origin and scale for simplicity first.
        // A more precise calculation involves:
        const currentImgX = (imgRect.left - rect.left);
        const currentImgY = (imgRect.top - rect.top);

        translateX = mouseX - (mouseX - currentImgX) * (newZoomLevel / zoomLevel);
        translateY = mouseY - (mouseY - currentImgY) * (newZoomLevel / zoomLevel);


        zoomLevel = newZoomLevel;


        // Bounds checking for panning (optional, can make it feel constrained)
        // Add logic here if needed to prevent panning the image completely out of view

        applyTransform();
        showControlsTemporarily(); // Show controls during zoom
    }

    function handlePanStart(event) {
        if (event.button !== 0) return; // Only pan with left mouse button
        event.preventDefault(); // Prevent default drag behavior (like image ghosting)
        isPanning = true;
        startX = event.clientX;
        startY = event.clientY;
        initialTranslateX = translateX;
        initialTranslateY = translateY;
        viewer.classList.add('panning');
        imageContainer.style.cursor = 'grabbing'; // Change cursor immediately
    }

    function handlePanMove(event) {
        if (!isPanning) return;
        event.preventDefault();

        const dx = event.clientX - startX;
        const dy = event.clientY - startY;

        translateX = initialTranslateX + dx;
        translateY = initialTranslateY + dy;

        // Basic boundary check (prevent excessive panning - adjust as needed)
        // This is a simple version; more complex logic might consider image dimensions vs container
         const imgRect = comicImage.getBoundingClientRect();
         const containerRect = imageContainer.getBoundingClientRect();

        // Don't let the image edges move too far past the container edges
        // Example: Prevent right edge from going past left edge of container + some margin
         const margin = 100; // Pixels
        // if (imgRect.right < containerRect.left + margin) translateX = containerRect.left + margin - (imgRect.width - ?) ; // Complex calculation
        // Simpler: just apply transform for now, refine bounds later if needed.

        applyTransform();
    }

    function handlePanEnd(event) {
        if (!isPanning) return;
        isPanning = false;
        viewer.classList.remove('panning');
        imageContainer.style.cursor = 'grab'; // Restore cursor
    }

    function applyTransform() {
         // Ensure transform-origin is set if zooming occurred off-center,
         // but maybe reset to center if just panning? For simplicity, keep it linked.
         // comicImage.style.transformOrigin = `center center`; // Or dynamic origin from zoom
         comicImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(${zoomLevel})`;
    }

    function handleKeyPress(event) {
        if (!viewer.classList.contains('hidden')) { // Only handle keys when viewer is active
            switch (event.key) {
                case 'ArrowLeft':
                    showPrevPage();
                    break;
                case 'ArrowRight':
                    showNextPage();
                    break;
                case 'Escape':
                    closeComic();
                    break;
                 case 'r':
                 case 'R':
                    resetView();
                    break;
            }
        }
    }

     function moveCursorHighlight(event) {
        // Optimization: Could potentially throttle this if performance is an issue
        // requestAnimationFrame(() => { // Use rAF for smoother updates
            cursorHighlight.style.left = `${event.clientX}px`;
            cursorHighlight.style.top = `${event.clientY}px`;
        // });
    }

    // --- UI Helpers ---

     function showViewer(show) {
        landingPage.classList.toggle('hidden', show);
        viewer.classList.toggle('hidden', !show);
        if (!show) {
             closeComic(); // Ensure cleanup when hiding viewer
        }
    }

    function showLoading(show) {
        loadingIndicator.classList.toggle('hidden', !show);
        // Disable buttons while loading a page/comic
        if (loadButton) loadButton.disabled = show;
        if (prevButton) prevButton.disabled = show || currentPageIndex === 0;
        if (nextButton) nextButton.disabled = show || currentPageIndex === imageFiles.length - 1;
        if (closeButton) closeButton.disabled = show;
        if (zoomResetButton) zoomResetButton.disabled = show;
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.toggle('hidden', !message);
    }

    function showControlsTemporarily() {
        clearTimeout(controlsTimeout);
        viewer.classList.remove('controls-hidden');
        controlsTimeout = setTimeout(hideControls, 3000); // Hide after 3 seconds of inactivity
    }

    function hideControls() {
         // Don't hide if actively panning
        if (!isPanning) {
            viewer.classList.add('controls-hidden');
        }
    }

    // --- Initial Setup ---
    showViewer(false); // Start on landing page

}); // End DOMContentLoaded
