document.addEventListener('DOMContentLoaded', () => {
    const cbzInput = document.getElementById('cbz-input');
    const comicPreviewsContainer = document.getElementById('comic-previews');
    const comicViewer = document.getElementById('comic-viewer');
    const comicPageContainer = document.getElementById('comic-page-container');
    const comicPageImg = document.getElementById('comic-page');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const zoomInButton = document.getElementById('zoom-in');
    const zoomOutButton = document.getElementById('zoom-out');
    const closeViewerButton = document.getElementById('close-viewer');

    let comicPages = [];
    let currentPageIndex = 0;
    let zoomLevel = 1;

    // --- Helper function to create comic preview elements ---
    function createComicPreview(coverImageBase64, comicName) {
        const previewDiv = document.createElement('div');
        previewDiv.classList.add('comic-preview');

        const imgElement = document.createElement('img');
        imgElement.src = coverImageBase64;
        imgElement.alt = comicName;

        previewDiv.appendChild(imgElement);

        previewDiv.addEventListener('click', () => {
            openComicViewer(comicPages); // Open viewer with the loaded comic pages
        });

        return previewDiv;
    }


    // --- Function to load and display CBZ content ---
    cbzInput.addEventListener('change', async (event) => {
        comicPreviewsContainer.innerHTML = ''; // Clear any existing previews
        const file = event.target.files[0];
        if (!file) return;

        try {
            const zip = await JSZip.loadAsync(file);
            comicPages = []; // Reset comic pages for a new CBZ file

            let imageFiles = Object.values(zip.files)
                .filter(file => !file.dir && /\.(jpe?g|png|gif)$/i.test(file.name))
                .sort((a, b) => a.name.localeCompare(b.name)); // Sort files by name

            // Extract cover image (first image in CBZ) for preview
            if (imageFiles.length > 0) {
                const coverImageFile = imageFiles[0];
                const coverImageBase64 = await coverImageFile.async("base64");
                const coverImageSrc = `data:${coverImageFile.mimeType};base64,${coverImageBase64}`;
                const comicPreviewElement = createComicPreview(coverImageSrc, file.name);
                comicPreviewsContainer.appendChild(comicPreviewElement);
            }

            // Store all comic pages for viewing later
            for (const imageFile of imageFiles) {
                const imageBase64 = await imageFile.async("base64");
                const imageSrc = `data:${imageFile.mimeType};base64,${imageBase64}`;
                comicPages.push(imageSrc);
            }


        } catch (error) {
            console.error("Error reading CBZ file: ", error);
            alert("Failed to load CBZ file.");
        }
    });

    // --- Function to open the comic viewer ---
    function openComicViewer(pages) {
        if (pages && pages.length > 0) {
            comicPages = pages;
            currentPageIndex = 0;
            zoomLevel = 1;
            displayPage();
            comicViewer.style.display = 'flex'; // Show the viewer
        } else {
            alert("No comic pages loaded.");
        }
    }

    // --- Function to display a comic page ---
    function displayPage() {
        if (comicPages.length > 0 && currentPageIndex >= 0 && currentPageIndex < comicPages.length) {
            comicPageImg.src = comicPages[currentPageIndex];
            comicPageImg.style.transform = `scale(${zoomLevel})`; // Apply current zoom level
        }
    }

    // --- Navigation and Zoom Controls ---
    prevPageButton.addEventListener('click', () => {
        if (currentPageIndex > 0) {
            currentPageIndex--;
            displayPage();
        }
    });

    nextPageButton.addEventListener('click', () => {
        if (currentPageIndex < comicPages.length - 1) {
            currentPageIndex++;
            displayPage();
        }
    });

    zoomInButton.addEventListener('click', () => {
        zoomLevel += 0.2;
        comicPageImg.style.transform = `scale(${zoomLevel})`;
    });

    zoomOutButton.addEventListener('click', () => {
        zoomLevel -= 0.2;
        if (zoomLevel < 0.2) zoomLevel = 0.2; // Prevent zoom level from becoming too small
        comicPageImg.style.transform = `scale(${zoomLevel})`;
    });

    closeViewerButton.addEventListener('click', () => {
        comicViewer.style.display = 'none'; // Hide the viewer
        comicPages = []; // Optionally clear pages when viewer is closed
        comicPageImg.src = ""; // Clear image source
    });


    // --- Example: Trigger file input click to load CBZ ---
    // For now, you would manually trigger the file input in the browser.
    // If you want a button to trigger file selection, add this to your HTML:
    // <button id="load-cbz-button">Load CBZ</button>
    // And in JS:
    // document.getElementById('load-cbz-button').addEventListener('click', () => { cbzInput.click(); });

    // For immediate testing purposes, you can uncomment the line below to automatically trigger the file input on page load.
    // cbzInput.click(); // Uncomment this line to automatically trigger file input on page load for testing.

    // --- Example: Adding some default comic previews (replace with actual logic) ---
    const defaultPreviews = [
        { name: "Flow", cover: "flow-cover.jpg" }, // Replace "flow-cover.jpg" with actual image path/base64
        { name: "Family Guy", cover: "family-guy-cover.jpg" }, // Replace "family-guy-cover.jpg" with actual image path/base64
        { name: "The Sea Beast", cover: "sea-beast-cover.jpg" }, // ...and so on
        { name: "Gerald's Game", cover: "geralds-game-cover.jpg" },
        { name: "Solar Opposites", cover: "solar-opposites-cover.jpg" },
        { name: "Bob's Burgers", cover: "bobs-burgers-cover.jpg" }
    ];

    defaultPreviews.forEach(previewData => {
        // Assuming you have these cover images in the same directory or accessible.
        // In a real application, these might be fetched from a server or local storage.
        // For now, using placeholder image names, you'd need to replace these with actual paths or base64 strings.

        // **Placeholder logic - replace with actual image loading for previews**
        const placeholderBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // Example placeholder
        const comicPreviewElement = createComicPreview(placeholderBase64, previewData.name); // Using placeholder for now
        comicPreviewsContainer.appendChild(comicPreviewElement);
        // In a real scenario, you would load actual cover images here.
    });


});