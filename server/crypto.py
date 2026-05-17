import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# 환경 변수에서 암호화 키 로드
SECRET_KEY_RAW = os.getenv("AES_SECRET_KEY")
SECRET_KEY = SECRET_KEY_RAW.encode("utf-8")

# AES-256을 위해 최종적으로 32바이트인지 확인
if len(SECRET_KEY) != 32:
    import hashlib
    SECRET_KEY = hashlib.sha256(SECRET_KEY).digest()

aesgcm = AESGCM(SECRET_KEY)

def encrypt(plain_text: str) -> str:
    pass

def decrypt(encrypted_base64: str) -> str:
    pass