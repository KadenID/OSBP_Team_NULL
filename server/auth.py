import os
import jwt
from datetime import datetime, timedelta, timezone
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