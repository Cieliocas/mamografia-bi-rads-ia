let scale = 1;
let warning = false;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX, startY;

const imgLayer1 = document.getElementById('image-layer-1');
const maskLayer1 = document.getElementById('mask-layer-1');
const imgLayer2 = document.getElementById('image-layer-2');
const container = document.getElementById('row-container'); // Listen on parent
const container2 = document.getElementById('canvas-container-2');

// --- Upload & Predict ---
async function handleUpload(input) {
    if (input.files && input.files[0]) {
        const formData = new FormData();
        formData.append('file', input.files[0]);

        document.getElementById('status-text').innerText = "Processing AI Analysis...";
        document.getElementById('status-text').style.display = 'block';

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.error) {
                alert("Error: " + data.error);
                return;
            }

            // Update Images
            imgLayer1.src = data.image;
            maskLayer1.src = data.mask;
            imgLayer2.src = data.image; // Original for compare view

            // Show Layers (Canvas 1)
            imgLayer1.style.display = 'block';
            maskLayer1.style.display = 'block';

            // Show Layers (Canvas 2)
            imgLayer2.style.display = 'block';

            // Reset View
            resetView();

            // Activate UI
            document.getElementById('controls-panel').style.display = 'flex';
            document.getElementById('ai-result').innerText = data.classification;
            document.getElementById('status-text').style.display = 'none';

        } catch (error) {
            console.error('Error:', error);
            alert("Failed to process image.");
            document.getElementById('status-text').innerText = "Error processing image.";
        }
    }
}

// --- Zoom & Pan Logic ---

function updateTransform() {
    // Apply transform to ALL layers in ALL views for synchronization
    const style = `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) scale(${scale})`;
    imgLayer1.style.transform = style;
    maskLayer1.style.transform = style;
    imgLayer2.style.transform = style;
}

function zoom(delta) {
    const newScale = scale + delta;
    if (newScale > 0.1 && newScale < 10) {
        scale = newScale;
        updateTransform();
    }
}

function resetView() {
    scale = 1;
    translateX = 0;
    translateY = 0;
    updateTransform();
}

// Mouse Wheel Zoom
container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY * -0.001;
    zoom(delta * 5); // Speed multiplier
});

// Dragging (Pan)
container.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    container.style.cursor = 'grabbing';
});

window.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    updateTransform();
});

// --- UI Controls ---

function setOpacity(value) {
    maskLayer1.style.opacity = value;
    document.getElementById('opacity-val').innerText = Math.round(value * 100) + '%';
}

function toggleMask() {
    const current = maskLayer1.style.display;
    maskLayer1.style.display = current === 'none' ? 'block' : 'none';
}

let isSplitView = false;
function toggleSplitView() {
    isSplitView = !isSplitView;
    if (isSplitView) {
        container2.style.display = 'flex';
        // When splitting, we might want to resize window/layout to fit?
        // Flexbox handles it.
    } else {
        container2.style.display = 'none';
    }
    // Retain zoom/pan state (synchronized)
}


async function submitValidation() {
    const validationData = {
        ai_classification: document.getElementById('ai-result').innerText,
        user_classification: document.getElementById('user-val').value,
        timestamp: new Date().toISOString()
    };

    const response = await fetch('/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validationData)
    });

    const result = await response.json();
    alert("Validation Saved: " + result.status);
}
