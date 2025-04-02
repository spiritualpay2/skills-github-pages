document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('comic-file');
    const noComicMessage = document.getElementById('no-comic-message');
    const loadingElement = document.getElementById('loading');
    const comicViewer = document.getElementById('comic-viewer');
    const pageWrapper = document.getElementById('page-wrapper');
    const pageImage = document.getElementById('page-image');
    const currentPageEl = document.getElementById('current-page');
    const totalPagesEl = document.getElementById('total-pages');
    const controls = document.getElementById('controls');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const resetZoomBtn = document.getElementById('reset-zoom-btn');
    const body = document.body;
    
    // State
    let comicPages = [];
    let currentPageIndex = 0;
    let isFullscreen = false;
    let isPanning = false;
    let startPoint = { x: 0, y: 0 };
    let endPoint = { x: 0, y: 0 };
    let scale = 1;
    let translateX = 0;
    let translateY = 0;
    let inactivityTimer;
    
    // Event listeners
    fileInput.addEventListener('change', event => handleFileSelect(event.target.files[0]));
    prevBtn.addEventListener('click', goToPreviousPage);
    nextBtn.addEventListener('click', goToNextPage);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    zoomInBtn.addEventListener('click', () => zoom(0.1));
    zoomOutBtn.addEventListener('click', () => zoom(-0.1));
    resetZoomBtn.addEventListener('click', resetView);
    document.addEventListener('keydown', handleKeyPress);
    
    // Pan and zoom event listeners
    pageWrapper.addEventListener('mousedown', startPan);
    pageWrapper.addEventListener('mousemove', pan);
    pageWrapper.addEventListener('mouseup', endPan);
    pageWrapper.addEventListener('mouseleave', endPan);
    pageWrapper.addEventListener('wheel', handleWheel, { passive: false });
    
    // Touch events for mobile
    pageWrapper.addEventListener('touchstart', startTouch);
    pageWrapper.addEventListener('touchmove', moveTouch);
    pageWrapper.addEventListener('touchend', endTouch);
    
    // Track mouse movement for UI fade
    document.addEventListener('mousemove', resetInactivityTimer);
    
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
                
                // Enter fullscreen mode automatically
                if (!isFullscreen) toggleFullscreen();
                
                // Start the inactivity timer
                resetInactivityTimer();
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
            // Reset view when changing pages
            resetView();
            
            // Load the new page
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
            case '=':
            case '+':
                zoom(0.1);
                break;
            case '-':
                zoom(-0.1);
                break;
            case '0':
                resetView();
                break;
        }
    }
    
    function toggleFullscreen() {
        isFullscreen = !isFullscreen;
        
        if (isFullscreen) {
            body.classList.add('fullscreen-mode', 'fade-controls');
        } else {
            body.classList.remove('fullscreen-mode', 'fade-controls');
        }
    }
    
    // Pan functionality
    function startPan(e) {
        if (e.button !== 0) return; // Only left mouse button
        
        isPanning = true;
        pageWrapper.classList.add('panning');
        startPoint = { x: e.clientX, y: e.clientY };
        
        // Store the current translate values
        const transform = window.getComputedStyle(pageImage).getPropertyValue('transform');
        if (transform && transform !== 'none') {
            const matrix = transform.match(/matrix.*\((.+)\)/)[1].split(', ');
            translateX = parseInt(matrix[4]) || 0;
            translateY = parseInt(matrix[5]) || 0;
        }
        
        e.preventDefault();
    }
    
    function pan(e) {
        if (!isPanning) return;
        
        endPoint = { x: e.clientX, y: e.clientY };
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
        
        // Apply the translation
        updateTransform(translateX + dx, translateY + dy);
        
        e.preventDefault();
    }
    
    function endPan() {
        if (!isPanning) return;
        
        isPanning = false;
        pageWrapper.classList.remove('panning');
        
        // Update the final translate values
        const transform = window.getComputedStyle(pageImage).getPropertyValue('transform');
        if (transform && transform !== 'none') {
            const matrix = transform.match(/matrix.*\((.+)\)/)[1].split(', ');
            translateX = parseInt(matrix[4]) || 0;
            translateY = parseInt(matrix[5]) || 0;
        }
    }
    
    // Touch events for mobile devices
    let lastDistance = 0;
    
    function startTouch(e) {
        if (e.touches.length === 1) {
            // Single touch - start panning
            isPanning = true;
            pageWrapper.classList.add('panning');
            startPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            
            // Store the current translate values
            const transform = window.getComputedStyle(pageImage).getPropertyValue('transform');
            if (transform && transform !== 'none') {
                const matrix = transform.match(/matrix.*\((.+)\)/)[1].split(', ');
                translateX = parseInt(matrix[4]) || 0;
                translateY = parseInt(matrix[5]) || 0;
            }
        } else if (e.touches.length === 2) {
            // Pinch to zoom - calculate initial distance
            lastDistance = getDistance(
                e.touches[0].clientX, e.touches[0].clientY, 
                e.touches[1].clientX, e.touches[1].clientY
            );
        }
        
        e.preventDefault();
    }
    
    function moveTouch(e) {
        if (e.touches.length === 1 && isPanning) {
            // Single touch - pan
            endPoint = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            const dx = endPoint.x - startPoint.x;
            const dy = endPoint.y - startPoint.y;
            
            // Apply the translation
            updateTransform(translateX + dx, translateY + dy);
        } else if (e.touches.length === 2) {
            // Pinch to zoom
            const currentDistance = getDistance(
                e.touches[0].clientX, e.touches[0].clientY, 
                e.touches[1].clientX, e.touches[1].clientY
            );
            
            if (lastDistance > 0) {
                // Calculate zoom amount based on pinch distance change
                const delta = currentDistance - lastDistance;
                const zoomFactor = delta * 0.01; // Adjust sensitivity
                zoom(zoomFactor);
            }
            
            lastDistance = currentDistance;
        }
        
        e.preventDefault();
    }
    
    function endTouch() {
        isPanning = false;
        pageWrapper.classList.remove('panning');
        lastDistance = 0;
        
        // Update the final translate values
        const transform = window.getComputedStyle(pageImage).getPropertyValue('transform');
        if (transform && transform !== 'none') {
            const matrix = transform.match(/matrix.*\((.+)\)/)[1].split(', ');
            translateX = parseInt(matrix[4]) || 0;
            translateY = parseInt(matrix[5]) || 0;
        }
    }
    
    // Helper function to calculate distance between two points
    function getDistance(x1, y1, x2, y2) {
        return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    }
    
    // Handle wheel events for zoom
    function handleWheel(e) {
        // Check if it's a pinch gesture (ctrl key is pressed on trackpads)
        if (e.ctrlKey) {
            e.preventDefault();
            
            // Delta is positive for zoom in, negative for zoom out
            const delta = -e.deltaY * 0.01;
            zoom(delta);
        }
    }
    
    // Zoom functionality
    function zoom(delta) {
        const newScale = Math.max(0.1, Math.min(5, scale + delta));
        
        if (newScale !== scale) {
            scale = newScale;
            
            // Apply the new scale while maintaining the translation
            updateTransform(translateX, translateY);
            
            // Reset the inactivity timer when zooming
            resetInactivityTimer();
        }
    }
    
    function updateTransform(tx, ty) {
        pageImage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
    
    function resetView() {
        scale = 1;
        translateX = 0;
        translateY = 0;
        updateTransform(0, 0);
    }
    
    // UI fade on inactivity
    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        body.classList.remove('fade-controls');
        
        if (isFullscreen) {
            inactivityTimer = setTimeout(() => {
                body.classList.add('fade-controls');
            }, 3000);
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
