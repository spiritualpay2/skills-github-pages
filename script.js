const fileInput = document.getElementById('file-input');
const viewer = document.getElementById('viewer');
const landing = document.getElementById('landing');
const canvasContainer = document.getElementById('canvas-container');
const cursorHighlight = document.getElementById('cursor-highlight');

let scale = 1;
let originX = 0;
let originY = 0;
let startX, startY;
let isPanning = false;

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    landing.classList.add('hidden');
    viewer.classList.remove('hidden');
    await loadCBZ(file);
  }
});

async function loadCBZ(file) {
  const zip = await JSZip.loadAsync(file);
  const imageFiles = Object.keys(zip.files)
    .filter((filename) => /\.(jpe?g|png|gif)$/i.test(filename))
    .sort();

  for (let filename of imageFiles) {
    const blob = await zip.files[filename].async('blob');
    const url = URL.createObjectURL(blob);
    const img = document.createElement('img');
    img.src = url;
    canvasContainer.appendChild(img);
  }
}

// Panning
viewer.addEventListener('mousedown', (e) => {
  isPanning = true;
  startX = e.clientX - originX;
  startY = e.clientY - originY;
});

viewer.addEventListener('mouseup', () => {
  isPanning = false;
});

viewer.addEventListener('mouseleave', () => {
  isPanning = false;
});

viewer.addEventListener('mousemove', (e) => {
  cursorHighlight.style.left = `${e.clientX}px`;
  cursorHighlight.style.top = `${e.clientY}px`;

  if (!isPanning) return;
  originX = e.clientX - startX;
  originY = e.clientY - startY;
  updateTransform();
});

// Zoom
viewer.addEventListener('wheel', (e) => {
  e.preventDefault();
  const delta = -e.deltaY * 0.001;
  const newScale = Math.min(Math.max(0.1, scale + delta), 5); // Clamp between 0.1 and 5
  const rect = canvasContainer.getBoundingClientRect();
  const offsetX = e.clientX - rect.left;
  const offsetY = e.clientY - rect.top;
  const scaleDiff = newScale / scale;

  originX = offsetX - (offsetX - originX) * scaleDiff;
  originY = offsetY - (offsetY - originY) * scaleDiff;

  scale = newScale;
  updateTransform();
}, { passive: false });

function updateTransform() {
  canvasContainer.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
}
