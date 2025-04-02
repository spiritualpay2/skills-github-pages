document.addEventListener('DOMContentLoaded', () => {
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
    let currentObjectUrl = null; // To keep track of the generated URL for cleanup

    // --- Event Listeners ---

    fileInput.addEventListener('change', handleFileSelect);
    prevButton.addEventListener('click', showPrevPage);
    nextButton.addEventListener('click', showNextPage);
    closeButton.addEventListener('click', closeViewer);
    document.addEventListener('keydown', handleKeyPress);

    // --- Core Functions ---

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

            const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']; // Common image types

            // Iterate through files and filter/sort images
            const filePromises = [];
            currentZip.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir) {
                    const lowerCasePath = relativePath.toLowerCase();
                    if (imageExtensions.some(ext => lowerCasePath.endsWith(ext))) {
                       // Store the zipEntry itself, which contains metadata and methods
                       imageFiles.push(zipEntry);
                    }
                }
            });

            // Sort files naturally (important for page order)
            imageFiles.sort((a, b) => {
                 // Basic alphanumeric sort, handles cases like page_1, page_10
                 return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
            });

            if (imageFiles.length === 0) {
                showError('Error: No images found in the CBZ file.');
                showLoading(false);
                resetFileInput();
                return;
            }

            currentPageIndex = 0;
            await displayPage(currentPageIndex);
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
        if (!currentZip || index < 0 || index >= imageFiles.length) {
            console.warn("Invalid page index or no zip loaded:", index);
            return;
        }

        // Clean up previous Object URL
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        // Set loading state for image? (Optional, usually fast enough)
        currentPageImage.src = ''; // Clear previous image quickly

        const imageEntry = imageFiles[index];

        try {
            const blob = await imageEntry.async('blob');
            currentObjectUrl = URL.createObjectURL(blob);
            currentPageImage.src = currentObjectUrl;

             // Reset scroll position for the new image
             imageContainer.scrollTop = 0;
             imageContainer.scrollLeft = 0;

        } catch (error) {
            console.error("Error loading image blob:", error);
            showError(`Error displaying page ${index + 1}: ${error.message}`);
            // Optionally, display a placeholder or keep the old image?
            currentPageImage.alt = `Error loading page ${index + 1}`;
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
        // Only navigate if viewer is active
        if (viewerPage.classList.contains('hidden')) return;

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
        }
    }

    function closeViewer() {
        resetState();
        showLanding();
    }

    // --- UI Update Functions ---

    function updateUI() {
        if (!imageFiles || imageFiles.length === 0) return;

        pageIndicator.textContent = `Page ${currentPageIndex + 1} / ${imageFiles.length}`;
        prevButton.disabled = currentPageIndex === 0;
        nextButton.disabled = currentPageIndex === imageFiles.length - 1;
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
    }

    function showLanding() {
        landingPage.classList.remove('hidden');
        viewerPage.classList.add('hidden');
    }

    function resetFileInput() {
         // Resetting file input value allows selecting the same file again after an error
         fileInput.value = '';
    }

    function resetState() {
        // Clean up Object URL if one exists
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
    }
});