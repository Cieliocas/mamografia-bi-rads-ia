import unittest
import uuid
import io
import os
import numpy as np
import cv2
from werkzeug.security import generate_password_hash

from src.api.app import app, db
from src.api.models import User

class AppTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        self.username = f"test_{uuid.uuid4().hex[:8]}"

        with app.app_context():
            db.create_all()
            user = User(
                username=self.username,
                email=f"{self.username}@example.com",
                password_hash=generate_password_hash("123456"),
                is_verified=True,
            )
            db.session.add(user)
            db.session.commit()

        login = self.client.post("/auth/login", json={"username": self.username, "password": "123456"})
        self.assertEqual(login.status_code, 200)
        self.token = login.get_json()["access_token"]
        self.auth_headers = {"Authorization": f"Bearer {self.token}"}

    def test_login_returns_token_and_user(self):
        rv = self.client.post("/auth/login", json={"username": self.username, "password": "123456"})
        self.assertEqual(rv.status_code, 200)
        payload = rv.get_json()
        self.assertIn("access_token", payload)
        self.assertIn("user", payload)

    def test_me_route(self):
        rv = self.client.get("/auth/me", headers=self.auth_headers)
        self.assertEqual(rv.status_code, 200)
        payload = rv.get_json()
        self.assertIn("id", payload)
        self.assertIn("username", payload)

    def test_predict_no_file(self):
        rv = self.client.post("/predict", headers=self.auth_headers)
        self.assertEqual(rv.status_code, 400)
        self.assertIn(b"No file part", rv.data)

    def test_validate_route(self):
        data = {"ai_classification": "BI-RADS 1", "user_classification": "BI-RADS 2"}
        rv = self.client.post("/validate", json=data, headers=self.auth_headers)
        self.assertEqual(rv.status_code, 200)
        self.assertIn(b"success", rv.data)

    def test_acervo_images_route(self):
        rv = self.client.get("/acervo/images", headers=self.auth_headers)
        self.assertEqual(rv.status_code, 200)
        payload = rv.get_json()
        self.assertIn("images", payload)
        self.assertIn("total", payload)

    def test_predict_invalid_image_returns_400(self):
        data = {"file": (io.BytesIO(b"invalid-bytes"), "invalid.png")}
        rv = self.client.post(
            "/predict",
            data=data,
            content_type="multipart/form-data",
            headers=self.auth_headers,
        )
        self.assertEqual(rv.status_code, 400)
        self.assertIn("Invalid image file", rv.get_data(as_text=True))

    def test_predict_cleans_temporary_file(self):
        upload_folder = app.config["UPLOAD_FOLDER"]
        before = set(
            name for name in os.listdir(upload_folder)
            if name.startswith("predict_") and name.endswith(".png")
        )

        image = np.zeros((32, 32), dtype=np.uint8)
        ok, encoded = cv2.imencode(".png", image)
        self.assertTrue(ok)

        data = {"file": (io.BytesIO(encoded.tobytes()), "valid.png")}
        rv = self.client.post(
            "/predict",
            data=data,
            content_type="multipart/form-data",
            headers=self.auth_headers,
        )
        self.assertEqual(rv.status_code, 200)

        after = set(
            name for name in os.listdir(upload_folder)
            if name.startswith("predict_") and name.endswith(".png")
        )
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
