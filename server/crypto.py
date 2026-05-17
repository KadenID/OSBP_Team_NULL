import os
import base64
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
    """
    평문을 받아 AES-256-GCM으로 암호화하고 base64 문자열로 반환
    """
    if not plain_text:
        return ""
    
    # 12바이트 IV(Nonce) 생성
    iv = os.urandom(12)
    data = plain_text.encode("utf-8")
    
    # 암호화 수행
    encrypted_data = aesgcm.encrypt(iv, data, None)
    
    # IV와 암호화된 데이터를 합쳐서 base64로 인코딩
    return base64.b64encode(iv + encrypted_data).decode("utf-8")

def decrypt(encrypted_base64: str) -> str:
    """
    base64로 인코딩된 암호문을 받아 복호화하여 평문을 반환합니다.
    """
    if not encrypted_base64:
        return ""
    
    # base64 디코딩
    decoded_data = base64.b64decode(encrypted_base64)
    
    # IV(12바이트)와 실제 암호문 분리
    iv = decoded_data[:12]
    ciphertext = decoded_data[12:]
    
    # 복호화 수행
    decrypted_data = aesgcm.decrypt(iv, ciphertext, None)
    
    return decrypted_data.decode("utf-8")