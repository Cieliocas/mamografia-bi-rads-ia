import os
import sys
from werkzeug.security import generate_password_hash

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from src.api.app import app
from src.api.database import db
from src.api.models import User

def seed_users():
    with app.app_context():
        # Create tables if they don't exist
        db.create_all()
        
        # Check if master user exists
        if not User.query.filter_by(username='master').first():
            print("Creating master user...")
            # Franciélio Castro requirements
            hashed_password = generate_password_hash('master123', method='pbkdf2:sha256')
            new_user = User(
                username='master', 
                password_hash=hashed_password,
                email='hamtarf2@gmail.com',
                full_name='Franciélio Castro',
                phone='(86) 9 9815-1571',
                role='radiologista',
                is_verified=True # Auto-verify master
            )
            db.session.add(new_user)
            db.session.commit()
            print("Master user created successfully.")
            print("Name: Franciélio Castro")
            print("Email: hamtarf2@gmail.com")
            print("Username: master")
            print("Password: master123")
        else:
            print("Master user already exists.")

if __name__ == '__main__':
    seed_users()
