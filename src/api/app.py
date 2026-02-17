import os
import sys
import base64
import cv2
import numpy as np
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, jwt_required
from .database import db
from .auth import auth_bp
from .acervo import acervo_bp
from PIL import Image
import io

# Add model directory to path to import Predictor
# Define project root and instance path explicitly
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../..'))
instance_path = os.path.join(project_root, 'instance')

# Add model directory to path to import Predictor
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
try:
    from ml.predict import MammographyModel
except ImportError:
    class MammographyModel:
        def predict(self, x): return None, "Model not loaded"

app = Flask(__name__, instance_path=instance_path)

# Ensure instance path exists
try:
    os.makedirs(app.instance_path)
except OSError:
    pass

db_path = os.path.join(app.instance_path, 'mammo.db')
print(f"Database path: {db_path}")
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['JWT_SECRET_KEY'] = 'super-secret-key-change-this-in-prod' # Change this!
app.config['UPLOAD_FOLDER'] = os.path.join(app.instance_path, 'uploads')

# Ensure upload directory exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

from flask import send_from_directory

@app.route('/uploads/<path:filename>')
def serve_uploads(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

CORS(app)
db.init_app(app)
jwt = JWTManager(app)

app.register_blueprint(auth_bp, url_prefix='/auth')
app.register_blueprint(acervo_bp, url_prefix='/acervo')

# Create tables
with app.app_context():
    db.create_all()

# Initialize Model
model = MammographyModel()


@app.route('/predict', methods=['POST'])
@jwt_required()
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
        print(f"Running prediction on {temp_path}...")
        mask, classification = model.predict(temp_path)
        print(f"Prediction done. Mask shape: {mask.shape}, Classification: {classification}")
        print(f"Mask values: min={mask.min()}, max={mask.max()}")
        
        # Encode images to base64 for frontend
        _, img_encoded = cv2.imencode('.png', img)
        img_base64 = base64.b64encode(img_encoded).decode('utf-8')
        
        _, mask_encoded = cv2.imencode('.png', (mask * 255).astype(np.uint8))
        mask_base64 = base64.b64encode(mask_encoded).decode('utf-8')
        print(f"Mask encoded length: {len(mask_base64)}")
        
        return jsonify({
            'image': f'data:image/png;base64,{img_base64}',
            'mask': f'data:image/png;base64,{mask_base64}',
            'classification': classification
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/validate', methods=['POST'])
@jwt_required()
def validate():
    data = request.json
    print(f"Radiologist Validation Received: {data}")
    # In a real app, save this to a database
    return jsonify({'status': 'success', 'message': 'Validation saved'})

if __name__ == '__main__':
    app.run(debug=True, port=5000)
