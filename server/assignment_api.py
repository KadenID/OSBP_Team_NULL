from fastapi import FastAPI, HTTPException, Response, Cookie, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
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

# 로깅 설정: 서버 운영 중 발생하는 주요 이벤트를 기록
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI 앱 초기화
app = FastAPI(
    title="LMS Assignment API", 
    description="충북대 LMS 과제 데이터를 프론트엔드에 제공하는 API"
)

# CORS(Cross-Origin Resource Sharing) 설정
# 프론트엔드 서버와 백엔드 서버의 도메인이 다를 경우 통신을 허용하기 위해 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://osbp-team-null.vercel.app"
    ],    # 로컬 테스트 및 배포 환경 허용
    allow_credentials=True, # 쿠키(HttpOnly 등)를 주고받기 위해 필수
    allow_methods=["*"],    # 모든 HTTP 메서드(GET, POST 등) 허용
    allow_headers=["*"],    # 모든 헤더 허용
)

# ---------------------------------------------------------
# Pydantic 모델: 요청 및 응답 데이터의 스키마 정의
# ---------------------------------------------------------
class LoginRequest(BaseModel):
    """로그인 요청 데이터 구조 (학번, 비밀번호)"""
    student_id: str
    password: str

class LoginResponse(BaseModel):
    """로그인 성공 시 반환되는 데이터 구조 (액세스 토큰 포함)"""
    success: bool
    message: str
    access_token: Optional[str] = None

class AssignmentItem(BaseModel):
    """개별 과제 항목 데이터 구조 (과목명, 마감일, 상태 등)"""
    course_id: str
    course_name: str
    assignment_id: str
    assignment_name: str
    due_date: str
    status: str
    url: str

class APIResponse(BaseModel):
    """과제 데이터 요청 시 최종 응답 구조 (성공 여부 및 과제 리스트)"""
    success: bool
    message: str
    total_count: int
    data: List[AssignmentItem] = []

# ---------------------------------------------------------
# 토큰 검증 의존성(Dependency Injection)
# ---------------------------------------------------------
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    HTTP Bearer 헤더에서 액세스 토큰을 추출하고 검증합니다.
    유효한 토큰일 경우 페이로드에 포함된 학번(student_id)을 반환합니다.
    """
    token = credentials.credentials
    # 토큰 서명(Signature) 검증 및 디코딩
    payload = auth.decode_token(token)
    
    # 토큰이 유효하지 않거나 타입이 'access'가 아닌 경우 예외 발생
    if not payload or not auth.verify_token_type(payload, "access"):
        raise HTTPException(status_code=401, detail="유효하지 않거나 만료된 액세스 토큰입니다.")
    
    # 학번 정보 추출
    student_id = payload.get("sub")
    if not student_id:
        raise HTTPException(status_code=401, detail="토큰 정보가 부정확합니다.")
    
    return student_id

# ---------------------------------------------------------
# 인증 API 엔드포인트
# ---------------------------------------------------------

@app.post("/auth/login", response_model=LoginResponse)
def login(request_data: LoginRequest, response: Response, request: Request):
    """
    사용자 로그인 및 토큰 발급 API
    1. LMS 로그인 테스트 수행
    2. 성공 시 계정 정보 암호화 저장
    3. 액세스 및 리프레시 토큰 발급
    """
    # LMS 로그인 테스트 (유효한 계정인지 확인)
    session, message = login_to_lms(request_data.student_id, request_data.password)
    if not session:
        raise HTTPException(status_code=401, detail=message)
    
    # 계정 정보 DB 저장 (비밀번호는 내부에서 암호화 처리됨)
    try:
        storage.save_user(request_data.student_id, request_data.password)
    except Exception as e:
        logger.error(f"DB 저장 오류: {e}")
        raise HTTPException(status_code=500, detail="사용자 정보 저장 중 서버 오류가 발생했습니다.")

    # JWT 토큰 생성
    user_data = {"sub": request_data.student_id}
    access_token = auth.create_access_token(user_data)
    refresh_token = auth.create_refresh_token(user_data)
    
    # 리프레시 토큰 DB 저장 (RTR 전략: 기존 토큰 무효화 및 갱신)
    expires_at = datetime.now(timezone.utc) + timedelta(days=auth.REFRESH_TOKEN_EXPIRE_DAYS)
    try:
        storage.save_refresh_token(request_data.student_id, refresh_token, expires_at)
    except Exception as e:
        logger.error(f"리프레시 토큰 DB 저장 오류: {e}")
        raise HTTPException(status_code=500, detail="인증 데이터 저장 중 서버 오류가 발생했습니다.")
    
    # 호스트 확인 (로컬 테스트 환경 대응)
    is_local = request.url.hostname in ["localhost", "127.0.0.1"]

    # HttpOnly 쿠키에 리프레시 토큰 설정 (보안 강화)
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not is_local,
        samesite="lax",
        max_age=auth.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )
    
    # 최적화: 로그인 성공 시점의 세션을 Redis에 즉시 캐싱
    redis_cache.set_lms_session(request_data.student_id, session.cookies.get_dict())
    
    return LoginResponse(
        success=True,
        message="로그인 성공",
        access_token=access_token
    )

@app.post("/auth/refresh", response_model=LoginResponse)
def refresh_token(request: Request, response: Response, refresh_token_cookie: Optional[str] = Cookie(None, alias="refresh_token")):
    """
    리프레시 토큰을 이용한 액세스 토큰 갱신 API (RTR 전략)
    1. 쿠키의 리프레시 토큰 검증
    2. DB 화이트리스트 대조 (토큰 탈취 방지)
    3. 토큰 재발급 및 DB 업데이트
    """
    if not refresh_token_cookie:
        raise HTTPException(status_code=401, detail="리프레시 토큰이 없습니다.")

    # 토큰 서명 검증 (만료 여부는 나중에 체크하여 RTR 방어 로직이 작동하게 함)
    payload = auth.decode_token(refresh_token_cookie, verify_exp=False)
    if not payload or not auth.verify_token_type(payload, "refresh"):
        raise HTTPException(status_code=401, detail="유효하지 않은 리프레시 토큰입니다.")
    
    student_id = payload.get("sub")
    
    # DB 화이트리스트 대조 (현재 쿠키의 토큰이 DB에 저장된 최신 토큰인지 확인)
    stored_token_data = storage.get_refresh_token(student_id)
    if not stored_token_data or refresh_token_cookie != stored_token_data[0]:
        # 이미 사용된 토큰이거나 정보가 일치하지 않으면 비정상 접근으로 간주하고 삭제
        if student_id:
            storage.delete_refresh_token(student_id)
        raise HTTPException(status_code=401, detail="비정상적인 접근입니다. 다시 로그인해주세요.")

    # 최신 토큰임이 확인된 후, 실제 만료 여부 체크
    exp = payload.get("exp")
    if exp and datetime.now(timezone.utc).timestamp() > exp:
        raise HTTPException(status_code=401, detail="만료된 리프레시 토큰입니다. 다시 로그인해주세요.")

    # 새로운 토큰 쌍 발급 (Refresh Token Rotation)
    user_data = {"sub": student_id}
    new_access_token = auth.create_access_token(user_data)
    new_refresh_token = auth.create_refresh_token(user_data)
    
    # DB 덮어쓰기 (수명 연장 포함)
    new_expires_at = datetime.now(timezone.utc) + timedelta(days=auth.REFRESH_TOKEN_EXPIRE_DAYS)
    storage.save_refresh_token(student_id, new_refresh_token, new_expires_at)

    # 호스트 확인 (로컬 테스트 환경 대응)
    is_local = request.url.hostname in ["localhost", "127.0.0.1"]

    # 새 리프레시 토큰 쿠키 재설정
    response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=not is_local,
        samesite="lax",
        max_age=auth.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    )
    
    return LoginResponse(
        success=True,
        message="토큰 갱신 성공",
        access_token=new_access_token
    )

# ---------------------------------------------------------
# 데이터 크롤링 API 엔드포인트
# ---------------------------------------------------------

@app.get("/api/assignments", response_model=APIResponse)
@app.get("/lms/data", response_model=APIResponse)
def get_lms_assignments(student_id: str = Depends(get_current_user)):
    """
    LMS 과제 데이터를 크롤링하여 반환하는 엔드포인트
    1. Redis 캐시 확인 (세션 재사용으로 속도 향상)
    2. 캐시 미적용 시 DB 조회 및 LMS 재로그인
    3. 크롤링 중 세션 만료 감지 시 자동 재로그인 및 재시도 (능동적 파기)
    """
    # Redis에서 캐싱된 LMS 세션(쿠키) 확인
    cached_cookies = redis_cache.get_lms_session(student_id)
    session = None
    using_cache = False

    if cached_cookies:
        # 캐싱된 쿠키가 있으면 세션 객체 복구 (성능 최적화)
        session = requests.Session()
        session.cookies.update(cached_cookies)
        using_cache = True
        logger.info(f"캐싱된 세션을 사용합니다. (student_id: {student_id})")
    else:
        # 캐시가 없으면 DB 정보를 이용해 새로 로그인
        session, _ = perform_lms_login(student_id)
    
    try:
        # 크롤링 수행
        assignments = crawl_all_assignments(session)
        return APIResponse(
            success=True,
            message="과제 데이터 로딩 성공.",
            total_count=len(assignments),
            data=assignments
        )
    except SessionExpiredError:
        # 캐시된 세션으로 시도하다 실패한 경우에만 재시도 수행
        if using_cache:
            logger.warning(f"캐싱된 세션 만료 감지. 캐시 삭제 후 재로그인 시도. (student_id: {student_id})")
            # 만료된 Redis 캐시 즉시 삭제
            redis_cache.delete_lms_session(student_id)
            
            # 로그인 모듈 호출하여 새 세션 획득
            new_session, _ = perform_lms_login(student_id)
            
            # 새 세션으로 크롤링 재시도
            try:
                assignments = crawl_all_assignments(new_session)
                return APIResponse(
                    success=True,
                    message="세션 갱신 후 데이터 로딩 성공.",
                    total_count=len(assignments),
                    data=assignments
                )
            except Exception as e:
                logger.error(f"세션 갱신 후에도 크롤링 실패: {e}")
                raise HTTPException(status_code=500, detail="LMS 서비스에 일시적인 문제가 발생했습니다.")
        else:
            # 방금 새로 로그인했는데도 세션 오류가 나면 계정 정보 확인 필요
            redis_cache.delete_lms_session(student_id)
            raise HTTPException(status_code=401, detail="LMS 인증에 실패했습니다. 계정 정보를 확인하거나 다시 로그인해주세요.")
            
    except Exception as e:
        # 기타 예기치 못한 크롤링 오류 처리
        logger.error(f"예기치 못한 크롤링 오류: {e}")
        redis_cache.delete_lms_session(student_id)
        raise HTTPException(status_code=500, detail="데이터를 가져오는 중 오류가 발생했습니다.")

def perform_lms_login(student_id: str):
    """
    DB에서 사용자 정보를 읽어 LMS 로그인을 수행하고 세션을 반환하는 헬퍼 함수입니다.
    성공 시 Redis에 새 세션을 캐싱합니다. (Step 5 모듈 연동)
    """
    # DB에서 학번과 복호화된 비밀번호 로드
    loaded_id, password = storage.load_user(student_id)
    if not loaded_id or not password:
        raise HTTPException(status_code=401, detail="등록된 사용자 정보가 없습니다. 다시 로그인해주세요.")

    # LMS 로그인 시도
    session, message = login_to_lms(loaded_id, password)
    if not session:
        raise HTTPException(status_code=401, detail=f"LMS 로그인 실패: {message}")
    
    # 획득한 새 세션을 Redis에 저장 (25분)
    redis_cache.set_lms_session(student_id, session.cookies.get_dict())
    return session, message

# ---------------------------------------------------------
# 로컬 실행 설정
# ---------------------------------------------------------
if __name__ == "__main__":
    # 8000번 포트에서 서버 실행 (개발 모드)
    uvicorn.run("assignment_api:app", host="0.0.0.0", port=8000, reload=True)
