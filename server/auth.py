import os
import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Any
from dotenv import load_dotenv

# .env 로드
load_dotenv()

# 환경 변수
SECRET_KEY = os.getenv("JWT_SECRET_KEY") # JWT 비밀키
ALGORITHM = "HS256" # 암호화 알고리즘
ACCESS_TOKEN_EXPIRE_MINUTES = 30 # 액세스 토큰 만료(분)
REFRESH_TOKEN_EXPIRE_DAYS = 30 # 리프레시 토큰 만료(일)

if not SECRET_KEY:
    raise ValueError("JWT_SECRET_KEY가 .env 파일에 설정되지 않았습니다.")

# 입력: data (토큰에 담을 정보)
# 기능: JWT 액세스 토큰 생성
# 반환: 토큰 문자열
def create_access_token(data: Dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({
        "exp": expire,                      # 만료 시간
        "type": "access",                   # 토큰 타입
        "iat": datetime.now(timezone.utc)   # 발급 시간
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# 입력: data (토큰에 담을 정보)
# 기능: JWT 리프레시 토큰 생성
# 반환: 토큰 문자열
def create_refresh_token(data: Dict[str, Any]) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({
        "exp": expire,                      # 만료 시간
        "type": "refresh",                  # 토큰 타입
        "iat": datetime.now(timezone.utc)   # 발급 시간
    })
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# 입력: token (JWT 토큰), verify_exp (만료 검증 여부)
# 기능: 토큰 검증 및 페이로드 추출
# 반환: 페이로드 딕셔너리 (실패 시 None)
def decode_token(token: str, verify_exp: bool = True) -> Optional[Dict[str, Any]]:
    try:
        options = {"verify_exp": verify_exp}
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options=options)
        return payload
    except jwt.ExpiredSignatureError:
        return None # 토큰 만료
    except jwt.InvalidTokenError:
        return None # 유효하지 않은 토큰
    except Exception:
        return None # 기타 예외
    
# 입력: payload (디코딩된 데이터), expected_type (기대하는 토큰 타입)
# 기능: 토큰 타입 유효성 확인
# 반환: 일치 여부 (bool)
def verify_token_type(payload: Dict[str, Any], expected_type: str) -> bool:
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