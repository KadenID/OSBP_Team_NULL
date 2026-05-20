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

app = FastAPI(title="LMS Assignment API")

# CORS 설정: 구체적인 Origin 명시 필수
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

class LoginRequest(BaseModel):
    student_id: str = Field(..., max_length=20)
    password: str = Field(..., max_length=20)

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

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = auth.decode_token(token)
    if not payload or not auth.verify_token_type(payload, "access"):
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    return payload.get("sub")

def set_refresh_cookie(response: Response, refresh_token: str, request: Request):
    is_local = request.url.hostname in ["localhost", "127.0.0.1"]
    # 크로스 도메인(Vercel -> Render) 대응을 위해 SameSite=None, Secure=True 설정
    # 로컬 환경에서는 SameSite=Lax, Secure=False(또는 브라우저 허용치) 적용
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True, # HTTPS 환경 필수
        samesite="none", # 크로스 사이트 요청 허용
        max_age=auth.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        path="/"
    )

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """
    Pydantic 검증 에러 발생 시 사용자 친화적인 메시지 반환
    """
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
        # 특정 에러 메시지(길이 제한 등)는 그대로 전달, 일반 로그인 실패는 기존 메시지 유지
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

@app.post("/auth/refresh", response_model=LoginResponse)
def refresh_token(request: Request, response: Response, refresh_token_cookie: Optional[str] = Cookie(None, alias="refresh_token")):
    if not refresh_token_cookie:
        raise HTTPException(status_code=401, detail="리프레시 토큰이 없습니다.")

    payload = auth.decode_token(refresh_token_cookie, verify_exp=False)
    if not payload or not auth.verify_token_type(payload, "refresh"):
        raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
    
    student_id = payload.get("sub")
    stored_token_data = storage.get_refresh_token(student_id)
    
    # stored_token_data[0]은 토큰값, [1]은 만료시간, [2]는 (만약 존재한다면) 최근 갱신 시간입니다.
    # 여기서는 단순화를 위해 토큰이 일치하지 않을 때 즉시 삭제하는 로직을 일시적 오류 가능성을 염두에 두고 수정합니다.
    
    if not stored_token_data:
        raise HTTPException(status_code=401, detail="인증 세션이 존재하지 않습니다.")

    if refresh_token_cookie != stored_token_data[0]:
        # 보안을 위해 토큰 불일치 시 에러를 내되, 클라이언트에서 동시에 여러 번 부르는 경우를 대비해 
        # 로그를 남기고 한 번 더 기회를 주거나, 클라이언트에서 중복 호출을 막는 것이 최선입니다.
        # 일단은 보안을 유지하되 클라이언트 로직을 먼저 강화하겠습니다.
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

@app.post("/auth/logout")
def logout(response: Response, student_id: str = Depends(get_current_user)):
    storage.delete_refresh_token(student_id)
    redis_cache.delete_lms_session(student_id)
    response.delete_cookie(key="refresh_token", httponly=True, secure=True, samesite="none", path="/")
    return {"success": True, "message": "로그아웃 성공"}

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
