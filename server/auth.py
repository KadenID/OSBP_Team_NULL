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