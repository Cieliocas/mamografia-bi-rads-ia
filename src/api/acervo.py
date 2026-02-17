from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from .models import db, User, Image
import os
from werkzeug.utils import secure_filename
import uuid

acervo_bp = Blueprint('acervo', __name__)

@acervo_bp.route('/images', methods=['GET'])
@jwt_required()
def get_images():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
        
    images = Image.query.filter_by(user_id=current_user_id).order_by(Image.created_at.desc()).all()
    
    # Group by patient logic can be done in frontend or here. For now, return flat list.
    return jsonify([img.to_dict() for img in images]), 200

@acervo_bp.route('/save-image', methods=['POST'])
@jwt_required()
def save_image_entry():
    current_user_id = get_jwt_identity()
    
    if 'file' not in request.files:
        return jsonify({"msg": "No file part"}), 400
        
    file = request.files['file']
    patient_id = request.form.get('patient_id')
    patient_name = request.form.get('patient_name')
    classification = request.form.get('classification')
    
    if file.filename == '':
        return jsonify({"msg": "No selected file"}), 400
        
    filename = secure_filename(file.filename)
    unique_filename = f"{uuid.uuid4()}_{filename}"
    upload_folder = os.path.join("src", "static", "uploads", "acervo")
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)
        
    filepath = os.path.join(upload_folder, unique_filename)
    file.save(filepath)
    
    # Store relative path for serving
    db_path = f"/static/uploads/acervo/{unique_filename}"
    
    new_image = Image(
        user_id=current_user_id,
        filename=db_path,
        original_filename=filename,
        patient_id=patient_id,
        patient_name=patient_name,
        classification=classification
    )
    
    db.session.add(new_image)
    db.session.commit()
    
    return jsonify({"msg": "Image saved", "image": new_image.to_dict()}), 201

@acervo_bp.route('/image/<int:image_id>', methods=['PUT'])
@jwt_required()
def update_image(image_id):
    current_user_id = get_jwt_identity()
    image = Image.query.filter_by(id=image_id, user_id=current_user_id).first()
    
    if not image:
        return jsonify({"msg": "Image not found"}), 404
        
    data = request.get_json()
    
    if 'patient_id' in data:
        image.patient_id = data['patient_id']
    if 'patient_name' in data:
        image.patient_name = data['patient_name']
    if 'tags' in data:
        image.tags = data['tags']
        
    db.session.commit()
    
    return jsonify({"msg": "Image updated", "image": image.to_dict()}), 200

@acervo_bp.route('/image/<int:image_id>', methods=['DELETE'])
@jwt_required()
def delete_image(image_id):
    current_user_id = get_jwt_identity()
    image = Image.query.filter_by(id=image_id, user_id=current_user_id).first()
    
    if not image:
        return jsonify({"msg": "Image not found"}), 404
        
    # Optional: Delete file from disk
    # For now just delete DB entry
    
    db.session.delete(image)
    db.session.commit()
    
    return jsonify({"msg": "Image deleted"}), 200
