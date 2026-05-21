from fastapi import FastAPI, HTTPException, Response, Cookie, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import uvicorn
import logging
import requests

# 내부 모듈 임포트
from lms_login import login_to_lms
from lms_crawler import crawl_all_assignments, SessionExpiredError
import auth
import storage
import redis_cache

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LMS Assignment API") # FastAPI 객체

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://osbp-team-null.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel): # 로그인 요청 스키마
    student_id: str = Field(..., max_length=20)
    password: str = Field(..., max_length=20)

class LoginResponse(BaseModel): # 로그인 응답 스키마
    success: bool
    message: str
    access_token: Optional[str] = None

class AssignmentItem(BaseModel): # 과제 항목 스키마
    course_id: str
    course_name: str
    assignment_id: str
    assignment_name: str
    due_date: str
    status: str
    url: str

class APIResponse(BaseModel): # 공통 API 응답 스키마
    success: bool
    message: str
    total_count: int
    data: List[AssignmentItem] = []

security = HTTPBearer() # 인증 객체

# 입력: credentials (HTTP 헤더 인증 정보)
# 기능: 현재 액세스 토큰 사용자 학번 추출
# 반환: 학번(str)
def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = auth.decode_token(token)
    if not payload or not auth.verify_token_type(payload, "access"):
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    return payload.get("sub")

# 입력: response (응답 객체), refresh_token (리프레시 토큰), request (요청 객체)
# 기능: 리프레시 토큰을 HTTP-only 쿠키에 설정
# 반환: 없음
def set_refresh_cookie(response: Response, refresh_token: str, request: Request):
    is_local = request.url.hostname in ["localhost", "127.0.0.1"]
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True, 
        samesite="none", 
        max_age=auth.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/"
    )

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# 입력: request (요청 객체), exc (검증 예외 객체)
# 기능: Pydantic 검증 에러 발생 시 커스텀 응답 반환
# 반환: JSONResponse 객체
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    for error in exc.errors():
        if error['type'] == 'value_error.any_str.max_length':
            limit = error['ctx']['limit_value']
            field = "아이디" if error['loc'][-1] == "student_id" else "비밀번호"
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": f"{field}는 최대 {limit}자까지 가능합니다."}
            )
    return JSONResponse(
        status_code=422,
        content={"success": False, "message": "입력 데이터 형식이 올바르지 않습니다."}
    )

# 입력: request_data (로그인 정보), response (응답 객체), request (요청 객체)
# 기능: LMS 로그인 인증 및 JWT 발급
# 반환: LoginResponse 객체
@app.post("/auth/login", response_model=LoginResponse)
def login(request_data: LoginRequest, response: Response, request: Request):
    # IP 기반 시도 횟수 제한 체크
    client_ip = request.headers.get("X-Forwarded-For")
    if client_ip:
        client_ip = client_ip.split(",")[0]
    else:
        client_ip = request.client.host

    if not redis_cache.check_ip_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="비정상적인 로그인 시도가 감지되었습니다. 잠시 후 다시 시도해주세요."
        )

    # 계정(학번) 기반 시도 횟수 제한 체크
    if not redis_cache.check_login_rate_limit(request_data.student_id):
        raise HTTPException(
            status_code=429, 
            detail="로그인 시도가 너무 많습니다. 10분 후에 다시 시도해주세요."
        )

    # LMS 로그인 시도
    session, message = login_to_lms(request_data.student_id, request_data.password)
    
    if not session:
        raise HTTPException(status_code=401, detail=message)
    
    # 로그인 성공 시 시도 횟수 초기화
    redis_cache.reset_login_attempts(request_data.student_id)
    
    storage.save_user(request_data.student_id, request_data.password)

    user_data = {"sub": request_data.student_id}
    access_token = auth.create_access_token(user_data)
    refresh_token = auth.create_refresh_token(user_data)
    
    expires_at = datetime.now(timezone.utc) + timedelta(days=auth.REFRESH_TOKEN_EXPIRE_DAYS)
    storage.save_refresh_token(request_data.student_id, refresh_token, expires_at)
    
    set_refresh_cookie(response, refresh_token, request)
    redis_cache.set_lms_session(request_data.student_id, session.cookies.get_dict())
    
    return LoginResponse(success=True, message="로그인 성공", access_token=access_token)

# 입력: request (요청 객체), response (응답 객체), refresh_token_cookie (쿠키 토큰)
# 기능: 리프레시 토큰 유효성 검증 및 신규 토큰 발급
# 반환: LoginResponse 객체
@app.post("/auth/refresh", response_model=LoginResponse)
def refresh_token(request: Request, response: Response, refresh_token_cookie: Optional[str] = Cookie(None, alias="refresh_token")):
    if not refresh_token_cookie:
        raise HTTPException(status_code=401, detail="리프레시 토큰이 없습니다.")

    payload = auth.decode_token(refresh_token_cookie, verify_exp=False)
    if not payload or not auth.verify_token_type(payload, "refresh"):
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    
    student_id = payload.get("sub")
    stored_token_data = storage.get_refresh_token(student_id)
    
    if not stored_token_data:
        raise HTTPException(status_code=401, detail="인증 세션이 존재하지 않습니다.")

    if refresh_token_cookie != stored_token_data[0]:
        logger.warning(f"Refresh token mismatch for user {student_id}. Possible concurrent request.")
        raise HTTPException(status_code=401, detail="세션 갱신 중 충돌이 발생했습니다. 다시 로그인해주세요.")

    exp = payload.get("exp")
    if exp and datetime.now(timezone.utc).timestamp() > exp:
        raise HTTPException(status_code=401, detail="토큰이 만료되었습니다.")

    new_access_token = auth.create_access_token({"sub": student_id})
    new_refresh_token = auth.create_refresh_token({"sub": student_id})
    
    new_expires_at = datetime.now(timezone.utc) + timedelta(days=auth.REFRESH_TOKEN_EXPIRE_DAYS)
    storage.save_refresh_token(student_id, new_refresh_token, new_expires_at)
    set_refresh_cookie(response, new_refresh_token, request)
    
    return LoginResponse(success=True, message="갱신 성공", access_token=new_access_token)

# 입력: response (응답 객체), student_id (학번)
# 기능: 로그아웃 처리 및 저장된 세션 삭제
# 반환: 성공 메시지 딕셔너리
@app.post("/auth/logout")
def logout(response: Response, student_id: str = Depends(get_current_user)):
    storage.delete_refresh_token(student_id)
    redis_cache.delete_lms_session(student_id)
    response.delete_cookie(key="refresh_token", httponly=True, secure=True, samesite="none", path="/")
    return {"success": True, "message": "로그아웃 성공"}

# 입력: student_id (학번)
# 기능: LMS 과제 목록 크롤링 및 결과 반환
# 반환: APIResponse 객체
@app.get("/api/assignments", response_model=APIResponse)
def get_lms_assignments(student_id: str = Depends(get_current_user)):
    cached_cookies = redis_cache.get_lms_session(student_id)

    session = requests.Session()
    if cached_cookies:
        session.cookies.update(cached_cookies)
    else:
        loaded_id, password = storage.load_user(student_id)
        session, _ = login_to_lms(loaded_id, password)
        redis_cache.set_lms_session(student_id, session.cookies.get_dict())
    
    try:
        assignments = crawl_all_assignments(session)
        return APIResponse(success=True, message="성공", total_count=len(assignments), data=assignments)
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail="데이터 로딩 실패")

if __name__ == "__main__":
    uvicorn.run("assignment_api:app", host="0.0.0.0", port=8000, reload=True)
