import os
import sys
import base64
import cv2
import numpy as np
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from PIL import Image
import io

# Add model directory to path to import Predictor
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from model.predict import MammographyModel

app = Flask(__name__)
CORS(app)

# Initialize Model
model = MammographyModel()

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/predict', methods=['POST'])
def predict():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    # Read image
    try:
        # Convert uploaded file to OpenCV format
        in_memory_file = io.BytesIO()
        file.save(in_memory_file)
        data = np.frombuffer(in_memory_file.getvalue(), dtype=np.uint8)
        img = cv2.imdecode(data, cv2.IMREAD_GRAYSCALE)
        
        # Save temporarily for the model (could optimize to pass numpy array directly if refactored)
        temp_path = "temp_upload.png"
        cv2.imwrite(temp_path, img)
        
        # Run prediction
        mask, classification = model.predict(temp_path)
        
        # Encode images to base64 for frontend
        _, img_encoded = cv2.imencode('.png', img)
        img_base64 = base64.b64encode(img_encoded).decode('utf-8')
        
        _, mask_encoded = cv2.imencode('.png', (mask * 255).astype(np.uint8))
        mask_base64 = base64.b64encode(mask_encoded).decode('utf-8')
        
        return jsonify({
            'image': f'data:image/png;base64,{img_base64}',
            'mask': f'data:image/png;base64,{mask_base64}',
            'classification': classification
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/validate', methods=['POST'])
def validate():
    data = request.json
    print(f"Radiologist Validation Received: {data}")
    # In a real app, save this to a database
    return jsonify({'status': 'success', 'message': 'Validation saved'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
