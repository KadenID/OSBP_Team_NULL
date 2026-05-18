from fastapi import FastAPI, HTTPException, Response, Cookie, Depends
from fastapi.middleware.cors import CORSMiddleware  # CORS 미들웨어 추가
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import uvicorn
import logging

from lms_login import login_to_lms
from lms_crawler import crawl_all_assignments
import auth
import storage

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="LMS Assignment API", 
    description="충북대 LMS 과제 데이터를 프론트엔드에 제공하는 API"
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    # 실제 서비스 시에는 ["http://localhost:5173"] 처럼 프론트 주소만 허용
    allow_credentials=True,
    allow_methods=["*"],    # GET, POST 등 모든 메서드 허용
    allow_headers=["*"],
)

# ---------------------------------------------------------
# Pydantic 모델: 프론트엔드 전달용 JSON 스키마 정의
# ---------------------------------------------------------
class LoginRequest(BaseModel):
    student_id: str
    password: str

class LoginResponse(BaseModel):
    success: bool
    message: str
    access_token: Optional[str] = None

class AssignmentItem(BaseModel):
    course_id: str
    course_name: str
    assignment_id: str
    assignment_name: str
    due_date: str
    status: str
    url: str

class APIResponse(BaseModel):
    success: bool
    message: str
    total_count: int
    data: List[AssignmentItem] = []

# ---------------------------------------------------------
# 토큰 검증 의존성
# ---------------------------------------------------------
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    클라이언트가 보낸 액세스 토큰을 검증하고, 유효한 경우 학번(student_id)을 반환합니다.
    """
    token = credentials.credentials
    payload = auth.decode_token(token)
    if not payload or not auth.verify_token_type(payload, "access"):
        raise HTTPException(status_code=401, detail="유효하지 않거나 만료된 액세스 토큰입니다.")
    
    student_id = payload.get("sub")
    if not student_id:
        raise HTTPException(status_code=401, detail="토큰 정보가 부정확합니다.")
    
    return student_id

# ---------------------------------------------------------
# 인증 API
# ---------------------------------------------------------
@app.post("/auth/login", response_model=LoginResponse)
def login(request: LoginRequest, response: Response):
    """
    사용자 로그인 API
    1. LMS 로그인 시도
    2. 성공 시 학번/비밀번호 DB 저장 (비밀번호 암호화)
    3. 토큰 발급 및 리프레시 토큰 쿠키 설정
    """
    # LMS 로그인 테스트
    session, message = login_to_lms(request.student_id, request.password)
    if not session:
        raise HTTPException(status_code=401, detail=message)
    
    # 계정 정보 DB 저장
    try:
        storage.save_user(request.student_id, request.password)
    except Exception as e:
        logger.error(f"DB 저장 오류: {e}")
        raise HTTPException(status_code=500, detail="사용자 정보 저장 중 서버 오류가 발생했습니다.")

    # 토큰 생성
    user_data = {"sub": request.student_id}
    access_token = auth.create_access_token(user_data)
    refresh_token = auth.create_refresh_token(user_data)
    
    # 리프레시 토큰 DB 저장 (RTR 및 화이트리스트)
    expires_at = datetime.now(timezone.utc) + timedelta(days=auth.REFRESH_TOKEN_EXPIRE_DAYS)
    try:
        storage.save_refresh_token(request.student_id, refresh_token, expires_at)
    except Exception as e:
        logger.error(f"리프레시 토큰 DB 저장 오류: {e}")
        raise HTTPException(status_code=500, detail="인증 데이터 저장 중 서버 오류가 발생했습니다.")
    
    # HttpOnly 쿠키에 리프레시 토큰 설정
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True, # HTTPS 환경에서만 전송
        samesite="lax",
        max_age=auth.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )
    
    return LoginResponse(
        success=True,
        message="로그인 성공",
        access_token=access_token
    )

@app.post("/auth/refresh", response_model=LoginResponse)
def refresh_token(response: Response, refresh_token_cookie: Optional[str] = Cookie(None, alias="refresh_token")):
    """
    토큰 갱신 API (RTR 전략)
    1. 쿠키 내 리프레시 토큰 검증
    2. DB의 화이트리스트 토큰과 대조
    3. 일치 시 새로운 토큰들 발급 및 DB 업데이트
    """
    if not refresh_token_cookie:
        raise HTTPException(status_code=401, detail="리프레시 토큰이 없습니다.")

    # 토큰 검증 및 페이로드 추출
    payload = auth.decode_token(refresh_token_cookie)
    if not payload or not auth.verify_token_type(payload, "refresh"):
        raise HTTPException(status_code=401, detail="유효하지 않거나 만료된 리프레시 토큰입니다.")
    
    student_id = payload.get("sub")
    if not student_id:
        raise HTTPException(status_code=401, detail="토큰 정보가 부정확합니다.")

    # DB 화이트리스트 대조
    stored_token_data = storage.get_refresh_token(student_id)
    if not stored_token_data:
        raise HTTPException(status_code=401, detail="등록된 토큰이 없습니다. 다시 로그인해주세요.")
    
    stored_token, expires_at = stored_token_data
    
    # DB에 저장된 토큰과 현재 쿠키의 토큰이 일치하는지 확인 (화이트리스트)
    if refresh_token_cookie != stored_token:
        # 토큰 탈취 의심 정황 (이미 사용된 토큰으로 재요청)
        storage.delete_refresh_token(student_id)
        raise HTTPException(status_code=401, detail="비정상적인 접근입니다. 다시 로그인해주세요.")

    # 새로운 토큰 발급 (RTR)
    user_data = {"sub": student_id}
    new_access_token = auth.create_access_token(user_data)
    new_refresh_token = auth.create_refresh_token(user_data)
    
    # DB 덮어쓰기 및 수명 연장 (슬라이딩 윈도우)
    new_expires_at = datetime.now(timezone.utc) + timedelta(days=auth.REFRESH_TOKEN_EXPIRE_DAYS)
    try:
        storage.save_refresh_token(student_id, new_refresh_token, new_expires_at)
    except Exception as e:
        logger.error(f"리프레시 토큰 갱신 중 DB 오류: {e}")
        raise HTTPException(status_code=500, detail="인증 서버 오류")

    # 새 리프레시 토큰 쿠키 설정
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=auth.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )
    
    return LoginResponse(
        success=True,
        message="토큰 갱신 성공",
        access_token=new_access_token
    )

@app.get("/api/assignments", response_model=APIResponse)
def get_lms_assignments(student_id: str = Depends(get_current_user)):
    """
    내부 로그인 모듈과 크롤링 모듈을 연동하여 
    과제 데이터를 JSON 형태로 반환하는 엔드포인트
    """
    # DB에서 사용자 정보 로드 (비밀번호 복호화됨)
    loaded_id, password = storage.load_user(student_id)
    if not loaded_id or not password:
         raise HTTPException(status_code=401, detail="등록된 사용자 정보가 없습니다. 다시 로그인해주세요.")

    session, message = login_to_lms(loaded_id, password)
    if not session:
        # 로그인 실패 (또는 네트워크 오류 등) 시 401 에러 반환
        raise HTTPException(status_code=401, detail=f"인증 실패: {message}")
    
    try:
        # 크롤링 모듈 연동 (마감일 기준 오름차순 정렬된 데이터 반환)
        assignments = crawl_all_assignments(session)
    
        # 프론트엔드 전달용 최종 JSON Response 생성
        return APIResponse(
            success=True,
            message="과제 데이터 로딩 성공.",
            total_count=len(assignments),
            data=assignments
        )
    
    except Exception as e:
        # 크롤링 중 예기치 못한 에러 발생 시 500 에러 반환
        raise HTTPException(status_code=500, detail=f"서버 내부 오류 발생: {str(e)}")

# ---------------------------------------------------------
# 로컬 테스트 코드
# ---------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run("assignment_api:app", host="0.0.0.0", port=8000, reload=True)