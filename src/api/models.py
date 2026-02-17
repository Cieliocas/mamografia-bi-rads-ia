from .database import db
import datetime

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(128))
    
    # Profile fields
    full_name = db.Column(db.String(100), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    
    # Role: 'radiologista', 'medico', 'usuario_comum'
    role = db.Column(db.String(20), default='usuario_comum')
    
    # Verification
    is_verified = db.Column(db.Boolean, default=False)
    verification_token = db.Column(db.String(100), nullable=True)
    
    # Profile Image
    profile_image = db.Column(db.String(255), nullable=True) # URL or path
    
    # Account Stats & Metadata
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    
    # Linked Accounts (Provider IDs)
    google_id = db.Column(db.String(100), nullable=True)
    apple_id = db.Column(db.String(100), nullable=True)
    microsoft_id = db.Column(db.String(100), nullable=True)
    github_id = db.Column(db.String(100), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "phone": self.phone,
            "role": self.role,
            "is_verified": self.is_verified,
            "profile_image": self.profile_image,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "providers": {
                "google": bool(self.google_id),
                "apple": bool(self.apple_id),
                "microsoft": bool(self.microsoft_id),
                "github": bool(self.github_id)
            }
        }

class Image(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    filename = db.Column(db.String(255), nullable=False) # Stored path
    original_filename = db.Column(db.String(255), nullable=False)
    
    # Metadata
    patient_id = db.Column(db.String(50), nullable=True)
    patient_name = db.Column(db.String(100), nullable=True)
    tags = db.Column(db.Text, nullable=True) # JSON or comma-separated
    classification = db.Column(db.String(50), nullable=True) # e.g. BI-RADS 4
    
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    
    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "filename": self.filename,
            "original_filename": self.original_filename,
            "patient_id": self.patient_id,
            "patient_name": self.patient_name,
            "tags": self.tags,
            "classification": self.classification,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }
