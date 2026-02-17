from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from .database import db
from .models import User
import datetime
import uuid

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    full_name = data.get('full_name')
    phone = data.get('phone')
    role = data.get('role', 'usuario_comum') # Default to common user

    if not username or not password or not email or not full_name or not phone:
        return jsonify({"msg": "Todos os campos são obrigatórios (Usuário, Senha, Email, Nome, Telefone)"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"msg": "Nome de usuário já existe"}), 400
        
    if User.query.filter_by(email=email).first():
        return jsonify({"msg": "Email já cadastrado"}), 400

    hashed_password = generate_password_hash(password, method='pbkdf2:sha256')
    
    # Generate mock verification token
    verification_token = str(uuid.uuid4())
    
    new_user = User(
        username=username, 
        password_hash=hashed_password,
        email=email,
        full_name=full_name,
        phone=phone,
        role=role,
        is_verified=False, # Default to false
        verification_token=verification_token
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    # MOCK EMAIL SENDING
    print(f"--- MOCK EMAIL ---")
    print(f"To: {email}")
    print(f"Subject: Verify your account")
    print(f"Token: {verification_token}")
    print(f"Link: http://localhost:5000/auth/verify-email/{verification_token}")
    print(f"------------------")

    return jsonify({"msg": "User created. Please verify your email (check console)."}), 201

@auth_bp.route('/verify-email/<token>', methods=['GET'])
def verify_email(token):
    user = User.query.filter_by(verification_token=token).first()
    if not user:
        return jsonify({"msg": "Invalid token"}), 400
        
    user.is_verified = True
    user.verification_token = None # Clear token
    db.session.commit()
    
    return jsonify({"msg": "Email verified successfully. You can now login."}), 200

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')

    user = User.query.filter_by(username=username).first()

    if not user:
        return jsonify({"msg": "Usuário não encontrado"}), 401
        
    if not check_password_hash(user.password_hash, password):
        return jsonify({"msg": "Senha incorreta"}), 401
        
    # Check verification status (skip for master)
    if not user.is_verified and user.username != 'master':
        return jsonify({"msg": "Email não verificado"}), 401

    # Create token valid for 7 days
    expires = datetime.timedelta(days=7)
    access_token = create_access_token(identity=user.id, expires_delta=expires)
    
    return jsonify({
        "access_token": access_token,
        "user": user.to_dict()
    })

@auth_bp.route('/me', methods=['GET'])
@jwt_required()
def me():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    return jsonify({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "phone": user.phone,
        "role": user.role,
        "profile_image": user.profile_image
    }), 200

@auth_bp.route('/update-profile', methods=['PUT'])
@jwt_required()
def update_profile():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    if not user:
        return jsonify({"msg": "User not found"}), 404
        
    data = request.get_json()
    
    # Update fields if provided
    if 'full_name' in data:
        user.full_name = data['full_name']
    if 'phone' in data:
        user.phone = data['phone']
    if 'email' in data:
        # Check if email is taken by another user
        existing = User.query.filter_by(email=data['email']).first()
        if existing and existing.id != user.id:
            return jsonify({"msg": "Email already in use"}), 400
        user.email = data['email']
    if 'profile_image' in data:
        user.profile_image = data['profile_image']
        
    db.session.commit()
    return jsonify({"msg": "Profile updated", "user": user.to_dict()}), 200

@auth_bp.route('/update-password', methods=['PUT'])
@jwt_required()
def update_password():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    
    data = request.get_json()
    current_password = data.get('current_password')
    new_password = data.get('new_password')
    
    if not current_password or not new_password:
        return jsonify({"msg": "Current and new password required"}), 400
        
    if not check_password_hash(user.password_hash, current_password):
        return jsonify({"msg": "Incorrect current password"}), 401
        
    user.password_hash = generate_password_hash(new_password, method='pbkdf2:sha256')
    db.session.commit()
    
    return jsonify({"msg": "Password updated successfully"}), 200

import os
from werkzeug.utils import secure_filename
from flask import current_app

@auth_bp.route('/upload-avatar', methods=['POST'])
@jwt_required()
def upload_avatar():
    current_user_id = get_jwt_identity()
    user = User.query.get(current_user_id)
    
    if 'file' not in request.files:
        return jsonify({"msg": "No file part"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"msg": "No selected file"}), 400
        
    if file:
        filename = secure_filename(f"avatar_{user.id}_{file.filename}")
        save_path = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        file.save(save_path)
        
        # Update user profile image URL
        # Assuming frontend runs on 3000 and backend on 5000, we return the backend URL path
        # The frontend should prepend the backend URL if needed, or we just return /uploads/...
        user.profile_image = f"/uploads/{filename}"
        db.session.commit()
        
        return jsonify({"msg": "Avatar uploaded", "profile_image": user.profile_image}), 200
