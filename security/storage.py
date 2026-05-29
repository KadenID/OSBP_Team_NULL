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
