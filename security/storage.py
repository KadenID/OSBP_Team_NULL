import json
import logging
from security.crypto import encrypt, decrypt

FILE_NAME = "user_data.json"
logger = logging.getLogger(__name__)

def save_user(student_id, password):
    encrypted_id = encrypt(student_id)
    encrypted_pw = encrypt(password)
    data = {
        "student_id": encrypted_id,
        "password": encrypted_pw
    }
    with open(FILE_NAME, "w") as f:
        json.dump(data, f, indent=4)

def load_user():
    try:
        with open(FILE_NAME, "r") as f:
            data = json.load(f)

        student_id = decrypt(data["student_id"])
        password = decrypt(data["password"])

        return student_id, password


