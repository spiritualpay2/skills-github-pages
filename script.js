document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('comic-file');
    const noComicMessage = document.getElementById('no-comic-message');
    const loadingElement = document.getElementById('loading');
    const comicViewer = document.getElementById('comic-viewer');
    const pageImage = document.getElementById('page-image');
    const currentPageEl = document.getElementById('current-page');
    const totalPagesEl = document.getElementById('total-pages');
    const controls = document.getElementById('controls');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const fitWidthBtn = document.getElementById('fit-width-btn');
    const fitHeightBtn = document.getElementById('fit-height-btn');
    const fitScreenBtn = document.getElementById('fit-screen-btn');
    const body = document.body;
    
    // State
    let comicPages = [];
    let currentPageIndex = 0;
    let isFullscreen = false;
    
    // Event listeners
    fileInput.addEventListener('change', event => handleFileSelect(event.target.files[0]));
    prevBtn.addEventListener('click', goToPreviousPage);
    nextBtn.addEventListener('click', goToNextPage);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    fitWidthBtn.addEventListener('click', () => setFitMode('width'));
    fitHeightBtn.addEventListener('click', () => setFitMode('height'));
    fitScreenBtn.addEventListener('click', () => setFitMode('screen'));
    document.addEventListener('keydown', handleKeyPress);
    
    // Drag and Drop handlers
    document.addEventListener('dragover', event => {
        event.preventDefault();
        dropZone.classList.remove('hidden-drop-zone');
    });
    
    document.addEventListener('dragleave', event => {
        if (event.relatedTarget === null || event.relatedTarget === document.documentElement) {
            dropZone.classList.add('hidden-drop-zone');
        }
    });
    
    dropZone.addEventListener('dragover', event => {
        event.preventDefault();
    });
    
    dropZone.addEventListener('drop', event => {
        event.preventDefault();
        dropZone.classList.add('hidden-drop-zone');
        
        const file = event.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.cbz')) {
            handleFileSelect(file);
        } else {
            showError('Please select a valid CBZ file.');
        }
    });
    
    // Functions
    async function handleFileSelect(file) {
        if (!file) return;
        
        try {
            // Show loading indicator
            noComicMessage.style.display = 'none';
            loadingElement.style.display = 'block';
            comicViewer.style.display = 'none';
            controls.style.display = 'none';
            
            const zip = new JSZip();
            const content = await zip.loadAsync(file);
            
            // Extract images from the ZIP
            comicPages = [];
            const promises = [];
            
            content.forEach((relativePath, zipEntry) => {
                if (!zipEntry.dir && isImageFile(relativePath)) {
                    const promise = zipEntry.async('blob').then(blob => {
                        return {
                            name: relativePath,
                            url: URL.createObjectURL(blob)
                        };
                    });
                    promises.push(promise);
                }
            });
            
            comicPages = await Promise.all(promises);
            
            // Sort pages by filename
            comicPages.sort((a, b) => {
                return a.name.localeCompare(b.name, undefined, {
                    numeric: true,
                    sensitivity: 'base'
                });
            });
            
            if (comicPages.length > 0) {
                // Hide loading and show the comic viewer
                loadingElement.style.display = 'none';
                comicViewer.style.display = 'flex';
                controls.style.display = 'flex';
                fullscreenBtn.disabled = false;
                
                // Display the first page
                currentPageIndex = 0;
                displayPage(currentPageIndex);
                
                // Update page counter
                totalPagesEl.textContent = comicPages.length;
                
                // Set default fit mode
                setFitMode('screen');
            } else {
                showError('No image files found in the CBZ file.');
            }
        } catch (error) {
            console.error('Error opening CBZ file:', error);
            showError('Failed to open the CBZ file. Please try a different file.');
        }
    }
    
    function showError(message) {
        loadingElement.style.display = 'none';
        noComicMessage.style.display = 'block';
        noComicMessage.innerHTML = `
            <p style="color: #ff6b6b;">${message}</p>
            <p class="subtitle">Try selecting a different file</p>
        `;
    }
    
    function displayPage(index) {
        if (index >= 0 && index < comicPages.length) {
            pageImage.src = comicPages[index].url;
            currentPageEl.textContent = index + 1;
            
            // Update button states
            prevBtn.disabled = index === 0;
            nextBtn.disabled = index === comicPages.length - 1;
        }
    }
    
    function goToPreviousPage() {
        if (currentPageIndex > 0) {
            currentPageIndex--;
            displayPage(currentPageIndex);
        }
    }
    
    function goToNextPage() {
        if (currentPageIndex < comicPages.length - 1) {
            currentPageIndex++;
            displayPage(currentPageIndex);
        }
    }
    
    function handleKeyPress(event) {
        if (comicPages.length === 0) return;
        
        switch (event.key) {
            case 'ArrowLeft':
                goToPreviousPage();
                break;
            case 'ArrowRight':
                goToNextPage();
                break;
            case 'f':
            case 'F':
                toggleFullscreen();
                break;
        }
    }
    
    function toggleFullscreen() {
        isFullscreen = !isFullscreen;
        
        if (isFullscreen) {
            body.classList.add('fullscreen-mode');
        } else {
            body.classList.remove('fullscreen-mode');
        }
        
        // Re-apply the current fit mode
        const activeFitBtn = document.querySelector('.scale-btn.active');
        if (activeFitBtn) {
            const mode = activeFitBtn.id.replace('-btn', '').replace('fit-', '');
            setFitMode(mode);
        }
    }
    
    function setFitMode(mode) {
        // Remove existing classes
        body.classList.remove('fit-width', 'fit-height');
        
        // Reset all buttons
        fitWidthBtn.classList.remove('active');
        fitHeightBtn.classList.remove('active');
        fitScreenBtn.classList.remove('active');
        
        // Set the new mode
        switch (mode) {
            case 'width':
                body.classList.add('fit-width');
                fitWidthBtn.classList.add('active');
                break;
            case 'height':
                body.classList.add('fit-height');
                fitHeightBtn.classList.add('active');
                break;
            case 'screen':
                fitScreenBtn.classList.add('active');
                break;
        }
    }
    
    function isImageFile(filename) {
        const lowerCaseName = filename.toLowerCase();
        return lowerCaseName.endsWith('.jpg') || 
               lowerCaseName.endsWith('.jpeg') || 
               lowerCaseName.endsWith('.png') || 
               lowerCaseName.endsWith('.gif') || 
               lowerCaseName.endsWith('.webp');
    }
});
