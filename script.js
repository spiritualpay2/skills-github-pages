document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const statusElement = document.getElementById('status');
    const viewerElement = document.getElementById('viewer');
    const pageImageElement = document.getElementById('pageImage');
    const prevButton = document.getElementById('prevButton');
    const nextButton = document.getElementById('nextButton');
    const pageInfoElement = document.getElementById('pageInfo');
    const fileSelectorElement = document.getElementById('fileSelector');
    const closeButton = document.getElementById('closeButton');

    let zip = null;
    let imageFiles = [];
    let currentPageIndex = 0;

    // --- Helper: Natural Sort for filenames ---
    // (Handles sorting like page1, page2, page10 correctly)
    function naturalSort(a, b) {
        const ax = [], bx = [];

        a.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { ax.push([$1 || Infinity, $2 || ""]) });
        b.replace(/(\d+)|(\D+)/g, (_, $1, $2) => { bx.push([$1 || Infinity, $2 || ""]) });

        while (ax.length && bx.length) {
            const an = ax.shift();
            const bn = bx.shift();
            const nn = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
            if (nn) return nn;
        }

        return ax.length - bx.length;
    }

    // --- Helper: Get MIME type from filename ---
    function getMimeType(filename) {
        const lowerCaseFilename = filename.toLowerCase();
        if (lowerCaseFilename.endsWith('.jpg') || lowerCaseFilename.endsWith('.jpeg')) {
            return 'image/jpeg';
        } else if (lowerCaseFilename.endsWith('.png')) {
            return 'image/png';
        } else if (lowerCaseFilename.endsWith('.gif')) {
            return 'image/gif';
        } else if (lowerCaseFilename.endsWith('.webp')) {
            return 'image/webp';
        } else {
            // Add more types if needed, or return a default/null
            console.warn(`Unknown image type for: ${filename}`);
            return 'application/octet-stream'; // Default binary type
        }
    }


    // --- File Handling ---
    fileInput.addEventListener('change', handleFileSelect);

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) {
            updateStatus("No file selected.");
            return;
        }

        if (!file.name.toLowerCase().endsWith('.cbz')) {
            updateStatus("Error: Please select a .cbz file.", true);
            resetViewer();
            return;
        }

        updateStatus(`Loading ${file.name}...`);
        viewerElement.classList.add('hidden'); // Hide viewer while loading new file
        pageImageElement.src = "#"; // Clear previous image visually

        const reader = new FileReader();
        reader.onload = function(e) {
            loadCbz(e.target.result);
        };
        reader.onerror = function() {
            updateStatus("Error reading file.", true);
            resetViewer();
        };
        reader.readAsArrayBuffer(file);
    }

    function loadCbz(arrayBuffer) {
        JSZip.loadAsync(arrayBuffer)
            .then(loadedZip => {
                zip = loadedZip;
                imageFiles = [];
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

                zip.forEach((relativePath, zipEntry) => {
                    // Ignore directory entries and files in subdirectories (optional, adjust if needed)
                    // Ignore hidden files like .DS_Store or __MACOSX
                    if (!zipEntry.dir && relativePath.indexOf('/') === -1 && !relativePath.startsWith('.') && !relativePath.startsWith('_') &&
                        imageExtensions.some(ext => relativePath.toLowerCase().endsWith(ext))) {
                        imageFiles.push(relativePath);
                    }
                    // More robust check: Filter out MacOS resource fork files
                    else if (!zipEntry.dir && !relativePath.startsWith('__MACOSX/') && imageExtensions.some(ext => relativePath.toLowerCase().endsWith(ext))) {
                         // Allow files in root or one level deep (common structure)
                         const pathParts = relativePath.split('/').filter(p => p); // remove empty parts
                         if (pathParts.length <= 2) {
                            imageFiles.push(relativePath);
                         }
                    }
                });

                if (imageFiles.length === 0) {
                    throw new Error("No supported image files (jpg, png, gif, webp) found in the root of the CBZ archive.");
                }

                // Sort files naturally
                imageFiles.sort(naturalSort);

                currentPageIndex = 0;
                displayPage(currentPageIndex);
                updateStatus(`Loaded ${imageFiles.length} pages.`);
                viewerElement.classList.remove('hidden');
                fileSelectorElement.classList.add('hidden'); // Hide file selector
            })
            .catch(error => {
                console.error("Error loading CBZ:", error);
                updateStatus(`Error: ${error.message}`, true);
                resetViewer();
            });
    }

    // --- Page Display & Navigation ---
    function displayPage(index) {
        if (!zip || index < 0 || index >= imageFiles.length) {
            console.error("Invalid page index or zip not loaded");
            return;
        }

        currentPageIndex = index;
        const filename = imageFiles[index];
        const mimeType = getMimeType(filename);

        updateStatus("Loading page..."); // Show loading status for page
        pageImageElement.src = "#"; // Clear previous image while loading

        zip.file(filename).async('base64')
            .then(base64Data => {
                pageImageElement.src = `data:${mimeType};base64,${base64Data}`;
                updateNavigation();
                updateStatus(''); // Clear status once loaded
            })
            .catch(error => {
                console.error(`Error loading page ${index} (${filename}):`, error);
                updateStatus(`Error loading page ${index + 1}`, true);
                // Optionally: display a placeholder error image
                 pageImageElement.alt = `Error loading page ${index + 1}`;
                 pageImageElement.src = "#"; // Keep it blank or use an error placeholder URL
                updateNavigation(); // Still update nav state
            });
    }

    function updateNavigation() {
        if (imageFiles.length === 0) {
            pageInfoElement.textContent = 'Page 0 / 0';
            prevButton.disabled = true;
            nextButton.disabled = true;
            return;
        }

        pageInfoElement.textContent = `Page ${currentPageIndex + 1} / ${imageFiles.length}`;
        prevButton.disabled = (currentPageIndex === 0);
        nextButton.disabled = (currentPageIndex === imageFiles.length - 1);
    }

    function showPrevPage() {
        if (currentPageIndex > 0) {
            displayPage(currentPageIndex - 1);
        }
    }

    function showNextPage() {
        if (currentPageIndex < imageFiles.length - 1) {
            displayPage(currentPageIndex + 1);
        }
    }

    function closeComic() {
        resetViewer();
        fileSelectorElement.classList.remove('hidden'); // Show file selector again
        viewerElement.classList.add('hidden'); // Hide viewer
        updateStatus("No file selected.");
    }

    function resetViewer() {
        zip = null;
        imageFiles = [];
        currentPageIndex = 0;
        pageImageElement.src = '#';
        pageImageElement.alt = 'Comic Page';
        fileInput.value = ''; // Reset file input
        updateNavigation(); // Disable buttons etc.
    }

     // --- UI Updates ---
    function updateStatus(message, isError = false) {
        statusElement.textContent = message;
        statusElement.style.color = isError ? '#dc3545' : '#666'; // Use red for errors
    }

    // --- Event Listeners ---
    prevButton.addEventListener('click', showPrevPage);
    nextButton.addEventListener('click', showNextPage);
    closeButton.addEventListener('click', closeComic);

    // Keyboard navigation
    document.addEventListener('keydown', (event) => {
        // Only navigate if viewer is visible and not focused on an input element
        if (!viewerElement.classList.contains('hidden') && document.activeElement.tagName !== 'INPUT') {
            if (event.key === 'ArrowLeft') {
                showPrevPage();
            } else if (event.key === 'ArrowRight') {
                showNextPage();
            } else if (event.key === 'Escape') {
                closeComic();
            }
        }
    });

    // Initial setup
    updateNavigation(); // Set initial button states

}); // End DOMContentLoaded