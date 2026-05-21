import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# 환경 변수 로드
SECRET_KEY_RAW = os.getenv("AES_SECRET_KEY") # 암호화 키

if SECRET_KEY_RAW is None:
    raise EnvironmentError("AES_SECRET_KEY 환경 변수가 설정되지 않았습니다. .env 파일을 확인하세요.")

SECRET_KEY = SECRET_KEY_RAW.encode("utf-8") # 암호화 키(Byte)

# AES-256을 위해 정확히 32바이트인지 확인
if len(SECRET_KEY) != 32:
    raise ValueError(f"AES_SECRET_KEY는 정확히 32바이트여야 합니다. 현재 길이: {len(SECRET_KEY)}바이트. "
                     "설정을 확인해주세요.")

aesgcm = AESGCM(SECRET_KEY) # AESGCM 객체

# 입력: plain_text (암호화할 평문)
# 기능: AES-256-GCM 암호화 및 base64 인코딩
# 반환: base64 암호문
def encrypt(plain_text: str) -> str:
    if not plain_text:
        return ""
    
    # 12바이트 IV(Nonce) 생성
    iv = os.urandom(12)
    data = plain_text.encode("utf-8")
    
    # 암호화 수행
    encrypted_data = aesgcm.encrypt(iv, data, None)
    
    # IV와 암호화된 데이터를 합쳐서 base64로 인코딩
    return base64.b64encode(iv + encrypted_data).decode("utf-8")

# 입력: encrypted_base64 (base64 암호문)
# 기능: base64 디코딩 및 AES-256-GCM 복호화
# 반환: 복호화된 평문
def decrypt(encrypted_base64: str) -> str:
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

if __name__ == "__main__":
    LMS_ID = os.getenv("LMS_ID")
    LMS_PW = os.getenv("LMS_PW")

    b64_encrypted_PW = encrypt(LMS_PW)
    print(b64_encrypted_PW)
    plain_PW = decrypt(b64_encrypted_PW)
    if LMS_PW == plain_PW:
        print("정상 암복호화")