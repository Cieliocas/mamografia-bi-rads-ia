from flask import Blueprint, request, jsonify, send_from_directory
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
    
    # Sort parameters
    sort_by = request.args.get('sort_by', 'date_desc', type=str)
    
    query = Image.query.filter_by(user_id=current_user_id)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Image.patient_name.ilike(search_term)) | 
            (Image.patient_id.ilike(search_term)) | 
            (Image.classification.ilike(search_term)) |
            (Image.tags.ilike(search_term))
        )
        
    if sort_by == 'date_asc':
        query = query.order_by(Image.created_at.asc())
    elif sort_by == 'name_asc':
        query = query.order_by(Image.patient_name.asc())
    elif sort_by == 'name_desc':
        query = query.order_by(Image.patient_name.desc())
    else: # date_desc
        query = query.order_by(Image.created_at.desc())
        
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    return jsonify({
        'images': [img.to_dict() for img in pagination.items],
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': pagination.page
    }), 200

@acervo_bp.route('/patients', methods=['GET'])
@jwt_required()
def get_patients():
    current_user_id = get_jwt_identity()
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 12, type=int)
    search = request.args.get('search', '', type=str)
    
    # Query specific columns only, grouped by patient
    query = db.session.query(
        Image.patient_id, 
        Image.patient_name, 
        db.func.count(Image.id).label('count'),
        db.func.max(Image.created_at).label('last_update')
    ).filter_by(user_id=current_user_id)
    
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Image.patient_name.ilike(search_term)) | 
            (Image.patient_id.ilike(search_term))
        )
    
    # Group by patient identifier
    query = query.group_by(Image.patient_id, Image.patient_name).order_by(db.desc('last_update'))
    
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)
    
    patients = []
    for p in pagination.items:
        patients.append({
            'patient_id': p.patient_id,
            'patient_name': p.patient_name,
            'image_count': p.count,
            'last_update': p.last_update.isoformat() if p.last_update else None
        })
        
    return jsonify({
        'patients': patients,
        'total': pagination.total,
        'pages': pagination.pages,
        'current_page': pagination.page
    }), 200

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

@acervo_bp.route('/download/<int:image_id>', methods=['GET'])
@jwt_required()
def download_image(image_id):
    current_user_id = get_jwt_identity()
    image = Image.query.filter_by(id=image_id, user_id=current_user_id).first()
    
    if not image:
        return jsonify({"msg": "Image not found"}), 404
        
    # image.filename is stored as "/static/uploads/acervo/..." or "src/static..."
    # We need to resolve the absolute path
    
    # Check if filename starts with /static (new format) or src/static (old format potentially)
    filename = image.filename
    if filename.startswith('/static'):
        # remove leading /
        filename = filename[1:]
        
    # Construct absolute path: instance_path/../src/...
    # instance_path is typically project/instance
    # we need project/src/static/uploads/acervo/...
    
    # Better approach: dynamic resolution based on where static folder is
    # Assuming app.root_path is src/api/.. 
    # Let's use relative path from 'src'
    
    # Actually, we can use send_from_directory if we know the directory
    # image.filename usually: /static/uploads/acervo/uuid_filename.ext
    
    upload_dir = os.path.join(os.getcwd(), 'src') # Root of src
    file_path = os.path.join(upload_dir, filename) # src/static/uploads/...
    
    directory = os.path.dirname(file_path)
    file_name = os.path.basename(file_path)
    
    if os.path.exists(file_path):
        return send_from_directory(directory, file_name, as_attachment=True, download_name=image.original_filename)
        
    return jsonify({"msg": "File not found on server"}), 404
