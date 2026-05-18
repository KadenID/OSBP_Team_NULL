import os
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# 환경 변수 설정
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 30

if not SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY가 .env 파일에 설정되지 않았습니다.")

def create_access_token(data: Dict[str, Any]) -> str:
    """
    액세스 토큰 생성
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,                      #토큰 만료 시간
        "type": "access",                   #토큰 타입
        "iat": datetime.now(timezone.utc)   #토큰 발급 시간
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def create_refresh_token(data: Dict[str, Any]) -> str:
    """
    리프레시 토큰 생성
    """
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,                      #토큰 만료 시간
        "type": "refresh",                  #토큰 타입
        "iat": datetime.now(timezone.utc)   #토큰 발급 시간
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """
    토큰의 서명을 검증하고 페이로드를 반환. 유효하지 않거나 만료된 경우 None 반환.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        # 토큰 만료
        return None
    except jwt.InvalidTokenError:
        # 유효하지 않은 토큰
        return None
    except Exception:
        # 기타 예외
        return None
    
def verify_token_type(payload: Dict[str, Any], expected_type: str) -> bool:
    """
    디코딩된 페이로드의 토큰 타입(access/refresh)이 일치하는지 확인
    """
    return payload.get("type") == expected_type

if __name__ == "__main__":
    # 간단한 테스트 로직
    test_data = {"sub": "2025123456"}
    
    # 액세스 토큰 테스트
    access_token = create_access_token(test_data)
    print(f"Access Token: {access_token}")
    
    decoded_access = decode_token(access_token)
    print(f"Decoded Access: {decoded_access}")
    if decoded_access and verify_token_type(decoded_access, "access"):
        print("Access Token Verification Success")
        
    # 리프레시 토큰 테스트
    refresh_token = create_refresh_token(test_data)
    print(f"Refresh Token: {refresh_token}")
    
    decoded_refresh = decode_token(refresh_token)
    print(f"Decoded Refresh: {decoded_refresh}")
    if decoded_refresh and verify_token_type(decoded_refresh, "refresh"):
        print("Refresh Token Verification Success")