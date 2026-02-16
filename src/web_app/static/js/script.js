let scale = 1;
let warning = false;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let startX, startY;

const imgLayer = document.getElementById('image-layer');
const maskLayer = document.getElementById('mask-layer');
const container = document.getElementById('canvas-container');

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
            imgLayer.src = data.image;
            maskLayer.src = data.mask;
            
            // Show Layers
            imgLayer.style.display = 'block';
            maskLayer.style.display = 'block';
            
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
    const style = `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) scale(${scale})`;
    imgLayer.style.transform = style;
    maskLayer.style.transform = style;
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
    maskLayer.style.opacity = value;
    document.getElementById('opacity-val').innerText = Math.round(value * 100) + '%';
}

function toggleMask() {
    const current = maskLayer.style.display;
    maskLayer.style.display = current === 'none' ? 'block' : 'none';
}

async function submitValidation() {
    const validationData = {
        ai_classification: document.getElementById('ai-result').innerText,
        user_classification: document.getElementById('user-val').value,
        timestamp: new Date().toISOString()
    };

    const response = await fetch('/validate', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(validationData)
    });

    const result = await response.json();
    alert("Validation Saved: " + result.status);
}
