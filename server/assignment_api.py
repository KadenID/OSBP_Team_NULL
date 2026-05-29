from fastapi import FastAPI, HTTPException, Response, Cookie, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi.responses import StreamingResponse
import urllib.parse
import uvicorn
import logging
import requests
import os

# 내부 모듈 임포트
from lms_login import login_to_lms
from lms_crawler import crawl_all_assignments, SessionExpiredError, get_user_profile
from notice_crawler import crawl_all_notices, get_notice_detail, crawl_all_messages
import auth
import storage
import redis_cache
import scheduler as scheduler_module
from scheduler import check_and_send_notifications, refresh_all_user_courses

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 스케줄러 설정
scheduler = BackgroundScheduler()
# 스케줄러 인스턴스를 모듈에 전달
scheduler_module.set_scheduler_instance(scheduler)

# 1시간마다 마감 기한 체크 (보조 스케줄러 역할 - 예약 누락 대비)
scheduler.add_job(check_and_send_notifications, 'interval', hours=1)
# 매일 새벽 3시에 30일이 지난 모든 알림 관련 기록(중복방지 및 내역) 통합 삭제
scheduler.add_job(storage.cleanup_old_notifications, 'cron', hour=3, minute=0, args=[30])
# 매일 새벽 4시에 모든 사용자의 수강 과목 정보 갱신 (캐싱 최신화)
scheduler.add_job(refresh_all_user_courses, 'cron', hour=4, minute=0)

def restore_all_notifications():
    """서버 시작 시 모든 사용자의 알림 예약을 복구 (백그라운드 실행용)"""
    try:
        student_ids = storage.get_all_student_ids()
        logger.info(f"총 {len(student_ids)}명의 사용자 알림 예약 복구를 시작합니다...")
        
        for student_id in student_ids:
            # 부하 분산을 위해 각 사용자별로 짧은 지연을 둠
            scheduler_module.schedule_notifications_for_user(student_id)
            import time
            time.sleep(0.1) # 초당 10명 정도 처리
            
        logger.info("모든 사용자의 알림 예약 복구가 완료되었습니다.")
    except Exception as e:
        logger.error(f"알림 예약 복구 중 오류 발생: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: 스케줄러 시작
    if not scheduler.running:
        scheduler.start()
        logger.info("마감 알림 스케줄러가 시작되었습니다.")
        
        # 서버 재시작 시 모든 사용자의 알림 예약 복구 (별도 스레드에서 실행)
        import threading
        threading.Thread(target=restore_all_notifications, daemon=True).start()
            
    yield
    # Shutdown: 스케줄러 종료
    if scheduler.running:
        scheduler.shutdown()
        logger.info("스케줄러가 종료되었습니다.")

app = FastAPI(title="LMS Assignment API", lifespan=lifespan) # FastAPI 객체

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
    student_id: str = Field(..., min_length=1, max_length=20)
    password: str = Field(..., min_length=1, max_length=20)

class LoginResponse(BaseModel): # 로그인 응답 스키마
    success: bool
    message: str
    access_token: Optional[str] = None

class UserProfileItem(BaseModel): # 사용자 정보 항목 스키마
    name: str
    student_id: str
    department: str

class UserProfileResponse(BaseModel): # 사용자 정보 API 응답 스키마
    success: bool
    message: str
    data: UserProfileItem

class LMSAssignmentItem(BaseModel): # LMS 과제 항목 스키마
    course_id: str
    course_name: str
    assignment_id: str
    assignment_name: str
    due_date: str
    status: str
    url: str

class CustomAssignmentItem(BaseModel): # 커스텀 과제 항목 스키마
    id: str
    subject: str
    task: str
    deadline: str
    isSubmitted: bool = False
    description: Optional[str] = ""
    source: str = "user"

class LMSAPIResponse(BaseModel): # LMS API 응답 스키마
    success: bool
    message: str
    total_count: int
    data: List[LMSAssignmentItem] = []

class CustomAPIResponse(BaseModel): # 커스텀 API 응답 스키마
    success: bool
    message: str
    total_count: int
    data: List[CustomAssignmentItem] = []

class CustomAssignmentRequest(BaseModel):
    id: Optional[str] = None
    subject: str = Field(..., min_length=1, max_length=30)
    task: str = Field(..., min_length=1, max_length=50)
    deadline: str = Field(..., max_length=50)
    isSubmitted: bool = False
    description: Optional[str] = Field(None, max_length=1000)

class NoticeItem(BaseModel): # 공지사항 개별 항목 스키마
    course_id: str
    course_name: str
    board_id: str
    notice_id: str
    title: str
    writer: str
    date: str
    description: str
    url: str

class NoticeListResponse(BaseModel): # 공지사항 목록 응답 스키마
    success: bool
    message: str
    total_count: int
    data: List[NoticeItem] = []

class NoticeDetailResponse(BaseModel): # 공지사항 상세 응답 스키마
    success: bool
    message: str
    data: dict
    
class MessageItem(BaseModel): # 쪽지 개별 항목 스키마
    message_id: str
    sender: str
    content: str
    date: str
    url: str

class MessageListResponse(BaseModel): # 쪽지 목록 API 응답 스키마
    success: bool
    message: str
    total_count: int
    data: List[MessageItem] = []

class AssignmentDetailResponse(BaseModel):  # 과제 상세 API 응답 스키마
    success: bool
    message: str
    data: dict
    
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

# 입력: session (requests.Session 객체)
# 기능: LMS 대시보드 요청으로 세션 유효성 확인
# 반환: 유효 여부 (bool)
def _is_lms_session_valid(session: requests.Session) -> bool:
    try:
        resp = session.get(
            "https://lms.chungbuk.ac.kr/",
            timeout=5,
            allow_redirects=False
        )
        # 302 = 로그인 페이지로 튕김 = 만료
        return resp.status_code == 200
    except Exception:
        return False

# 입력: student_id (학번)
# 기능: Redis 캐시에서 LMS 세션 복원, 없으면 저장된 계정으로 재로그인
# 반환: requests.Session 객체
def resolve_lms_session(student_id: str) -> requests.Session:
    cached_cookies = redis_cache.get_lms_session(student_id)
    
    session = requests.Session()
    
    if cached_cookies:
        session.cookies.update(cached_cookies)
        
        if _is_lms_session_valid(session):
            return session
        
        # 만료된 경우 Redis 캐시 삭제 후 재로그인
        logger.warning(f"캐시된 LMS 세션 만료 감지, 재로그인 시도 (student_id: {student_id})")
        redis_cache.delete_lms_session(student_id)
        session = requests.Session()
   
   
    loaded_id, password = storage.load_user(student_id)
    session, message = login_to_lms(loaded_id, password)
    if not session:
        raise HTTPException(status_code=401, detail="LMS 세션이 만료되었습니다. 다시 로그인해주세요.")
    redis_cache.set_lms_session(student_id, session.cookies.get_dict())
    return session


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

@app.get("/health")
def health_check():
    return {"status": "ok", "message": "Server is running"}

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

# 입력: response (응답 객체), student_id (학번)
# 기능: 서비스 탈퇴 처리 (모든 개인정보 및 저장 데이터 삭제)
# 반환: 성공 메시지 딕셔너리
@app.post("/auth/withdraw")
def withdraw(response: Response, student_id: str = Depends(get_current_user)):
    try:
        # 1. Redis 캐시 데이터 삭제 (세션, 과목 목록, 로그인 시도 등)
        redis_cache.delete_user_data(student_id)
        
        # 2. DB 데이터 삭제 (CASCADE 설정으로 인해 연관 데이터 일괄 삭제됨)
        # users, refresh_tokens, custom_assignments, user_settings, push_subscriptions 등 포함
        storage.delete_user_entirely(student_id)
        
        # 3. 인증 쿠키 삭제
        response.delete_cookie(key="refresh_token", httponly=True, secure=True, samesite="none", path="/")
        
        logger.info(f"사용자 서비스 탈퇴 완료 (student_id: {student_id})")
        return {"success": True, "message": "서비스 탈퇴가 완료되었습니다. 모든 개인정보가 삭제되었습니다."}
    except Exception as e:
        logger.error(f"서비스 탈퇴 중 오류 발생 (student_id: {student_id}): {e}")
        raise HTTPException(status_code=500, detail="탈퇴 처리 중 오류가 발생했습니다.")

# 입력: student_id (학번)
# 기능: 로그인한 사용자의 이름, 학번, 학과 정보 조회
# 반환: UserProfileResponse 객체
@app.get("/api/me", response_model=UserProfileResponse)
def get_my_profile(student_id: str = Depends(get_current_user)):
    session = resolve_lms_session(student_id)

    try:
        profile = get_user_profile(session, student_id)
        return UserProfileResponse(success=True, message="성공", data=profile)
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail="사용자 정보 로딩 실패")

# 입력: student_id (학번)
# 기능: LMS 과제 목록 크롤링 및 결과 반환
# 반환: LMSAPIResponse 객체
@app.get("/api/assignments", response_model=LMSAPIResponse)
def get_lms_assignments(student_id: str = Depends(get_current_user)):
    session = resolve_lms_session(student_id)
    
    try:
        assignments = crawl_all_assignments(session, student_id)
        # 과제 크롤링 직후 알림 예약 스케줄링 수행 (불필요한 재크롤링 방지를 위해 assignments 전달)
        scheduler_module.schedule_notifications_for_user(student_id, lms_assignments=assignments)
        return LMSAPIResponse(success=True, message="성공", total_count=len(assignments), data=assignments)
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail="데이터 로딩 실패")

@app.get("/api/courses")
def get_user_courses(include_custom: bool = True, student_id: str = Depends(get_current_user)):
    cached_cookies = redis_cache.get_lms_session(student_id)
    session = requests.Session()
    
    if cached_cookies:
        session.cookies.update(cached_cookies)
    else:
        loaded_id, password = storage.load_user(student_id)
        session, _ = login_to_lms(loaded_id, password)
        if not session:
             # 세션이 없어도 DB 데이터는 보여줄 수 있음
             pass
        else:
             redis_cache.set_lms_session(student_id, session.cookies.get_dict())
            
    try:
        from lms_crawler import get_enrolled_courses
        # LMS 공식 과목 가져오기
        lms_courses = get_enrolled_courses(session, student_id)
        
        course_list = []
        if isinstance(lms_courses, dict):
            for cid, cdata in lms_courses.items():
                if isinstance(cdata, dict):
                    course_list.append({"id": cid, "name": cdata.get("name", cid), "type": cdata.get("type", "regular")})
                else:
                    # 구버전 캐시 데이터 대응 (문자열인 경우)
                    course_list.append({"id": cid, "name": str(cdata), "type": "regular"})
        
        # 커스텀 과목 포함 여부 확인
        if include_custom:
            try:
                custom_assignments = storage.get_custom_assignments(student_id)
                custom_subjects = {a['subject'] for a in custom_assignments if a.get('subject')}
                lms_course_names = {c['name'] for c in course_list}
                for subject in custom_subjects:
                    if subject not in lms_course_names:
                        course_list.append({"id": subject, "name": subject, "type": "custom"})
            except Exception as ce:
                logger.error(f"커스텀 과목 병합 중 오류 (무시함): {ce}")
        
        # 이미 lms_crawler에서 저장(캐싱) 시점에 정렬되어 있으므로 추가 정렬 생략
        # (커스텀 과목은 자연스럽게 마지막에 위치하게 됨)
        
        return {"success": True, "data": course_list}
    except Exception as e:
        logger.error(f"과목 목록 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="과목 목록을 불러올 수 없습니다.")

@app.get("/api/custom-assignments", response_model=CustomAPIResponse)
def get_custom_assignments(student_id: str = Depends(get_current_user)):
    try:
        assignments = storage.get_custom_assignments(student_id)
        return CustomAPIResponse(success=True, message="성공", total_count=len(assignments), data=assignments)
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail="데이터 로딩 실패")

@app.post("/api/custom-assignments")
def create_or_update_custom_assignment(request_data: CustomAssignmentRequest, student_id: str = Depends(get_current_user)):
    try:
        assignment_id = storage.save_custom_assignment(student_id, request_data.model_dump())
        # 커스텀 과제 저장 후 즉시 알림 예약 갱신
        scheduler_module.schedule_notifications_for_user(student_id)
        return {"success": True, "message": "저장 성공", "id": str(assignment_id)}
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail="저장 실패")

@app.delete("/api/custom-assignments/{assignment_id}")
def delete_custom_assignment(assignment_id: str, student_id: str = Depends(get_current_user)):
    try:
        storage.delete_custom_assignment(student_id, assignment_id)
        # 커스텀 과제 삭제 후 즉시 알림 예약 갱신
        scheduler_module.schedule_notifications_for_user(student_id)
        return {"success": True, "message": "삭제 성공"}
    except Exception as e:
        logger.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail="삭제 실패")

# 사용자 설정(알림 등) API

@app.get("/api/user-settings")
def get_user_settings(student_id: str = Depends(get_current_user)):
    try:
        settings = storage.get_user_settings(student_id)
        email = storage.get_user_email(student_id)
        # 프론트엔드 기대치에 맞게 settings 딕셔너리와 email을 합쳐서 반환
        return {
            "success": True, 
            "data": {
                **settings,
                "email": email
            }
        }
    except Exception as e:
        logger.error(f"설정 로드 중 오류 발생: {e}")
        raise HTTPException(status_code=500, detail="설정 로드 실패")

@app.post("/api/user-settings")
def save_user_settings(request_data: dict, student_id: str = Depends(get_current_user)):
    try:
        # 이메일이 포함되어 있다면 별도로 업데이트하고 settings에서는 제거 (중복 방지)
        if "email" in request_data:
            storage.update_user_email(student_id, request_data["email"])
            request_data.pop("email", None)
        
        # 나머지 설정 저장
        settings = request_data.get("settings", request_data)
        storage.save_user_settings(student_id, settings)
        
        # 알림 설정 변경 시 즉시 예약 다시 계산
        scheduler_module.schedule_notifications_for_user(student_id)
        
        return {"success": True, "message": "설정 저장 완료"}
    except Exception as e:
        logger.error(f"설정 저장 중 오류 발생: {e}")
        raise HTTPException(status_code=500, detail="설정 저장 실패")

@app.post("/api/push-subscription")
def add_push_subscription(subscription: dict, student_id: str = Depends(get_current_user)):
    try:
        storage.save_push_subscription(student_id, subscription)
        return {"success": True}
    except Exception as e:
        logger.error(f"푸시 구독 저장 실패: {e}")
        raise HTTPException(status_code=500, detail="저장 실패")

@app.delete("/api/push-subscription")
def delete_push_subscription(subscription: dict, student_id: str = Depends(get_current_user)):
    try:
        storage.delete_push_subscription(student_id, subscription)
        return {"success": True}
    except Exception as e:
        logger.error(f"푸시 구독 삭제 실패: {e}")
        raise HTTPException(status_code=500, detail="삭제 실패")


@app.get("/api/vapid-public-key")
def get_vapid_public_key(student_id: str = Depends(get_current_user)):
    public_key = os.getenv("VAPID_PUBLIC_KEY")
    if not public_key:
        logger.error("VAPID_PUBLIC_KEY가 설정되지 않았습니다.")
        raise HTTPException(status_code=500, detail="서버 VAPID 설정 오류")
    return {"success": True, "publicKey": public_key}

@app.post("/api/test-notification")
def send_test_notification(student_id: str = Depends(get_current_user)):
    try:
        from notification_service import send_all_notifications
        title = "테스트 알림"
        body = "알림 설정이 정상적으로 작동하고 있습니다!"
        # 테스트 발송이므로 설정을 무시하고 현재 등록된 모든 수단으로 발송 시도
        results = send_all_notifications(student_id, title, body, ignore_settings=True)
        
        # 상세 결과 분석
        email_status = results.get("email")
        push_results = results.get("push", [])
        
        email_ok = email_status is True
        push_ok = any(r is True for r in push_results)
        
        if not email_ok and not push_ok:
            msg = "발송 가능한 수단이 없습니다. "
            if email_status == "MISSING_EMAIL":
                msg += "이메일을 먼저 등록해주세요. "
            if not push_results or "MISSING_SUBSCRIPTION" in push_results:
                msg += "푸시 알림 권한을 허용해주세요."
            return {"success": False, "message": msg.strip(), "details": results}

        return {"success": True, "message": "테스트 알림이 발송되었습니다.", "details": results}
    except Exception as e:
        logger.error(f"테스트 알림 발송 실패: {e}")
        raise HTTPException(status_code=500, detail="발송 실패")

@app.get("/api/notification-history")
def get_notification_history(student_id: str = Depends(get_current_user)):
    try:
        history = storage.get_notification_history(student_id)
        return {"success": True, "data": history}
    except Exception as e:
        logger.error(f"알림 내역 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="내역 조회 실패")

@app.delete("/api/notification-history/{history_id}")
def delete_notification_history(history_id: int, student_id: str = Depends(get_current_user)):
    try:
        # storage.py에 개별 삭제 함수 추가 예정
        success = storage.delete_specific_notification_history(student_id, history_id)
        return {"success": success}
    except Exception as e:
        logger.error(f"알림 내역 삭제 실패: {e}")
        raise HTTPException(status_code=500, detail="삭제 실패")
    
    
# 입력: student_id (학번)
# 기능: 전체 수강 과목 공지사항 목록 크롤링
# 반환: NoticeListResponse
@app.get("/api/notices", response_model=NoticeListResponse)
def get_notices(student_id: str = Depends(get_current_user)):
    session = resolve_lms_session(student_id)
    
    try:
        notices = crawl_all_notices(session, student_id=student_id)
        return NoticeListResponse(
            success=True,
            message="성공",
            total_count=len(notices),
            data=notices
        )
    except SessionExpiredError:
        raise HTTPException(status_code=401, detail="LMS 세션이 만료되었습니다.")
    except Exception as e:
        logger.error(f"공지사항 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="공지사항 조회 실패")
 
 
# 입력: board_id (게시판 ID), notice_id (게시글 ID), student_id (학번)
# 기능: 공지사항 상세 본문 크롤링
# 반환: NoticeDetailResponse

# 에러 처리:
#   - 잘못된 board_id/notice_id 입력 시 LMS가 에러 페이지를 반환
#     → 크롤러에서 title_tag 파싱 실패 → ValueError 발생 → 404 반환
#   - 위를 통해 사용자의 잘못된 요청(404)과 서버 내부 오류(500)를 구분

@app.get("/api/notices/{board_id}/{notice_id}", response_model=NoticeDetailResponse)
def get_notice_detail_api(board_id: str, notice_id: str, student_id: str = Depends(get_current_user)):
    session = resolve_lms_session(student_id)

    try:
        detail = get_notice_detail(session, board_id, notice_id)
        return NoticeDetailResponse(success=True, message="성공", data=detail)
    except SessionExpiredError:
        raise HTTPException(status_code=401, detail="LMS 세션이 만료되었습니다.")
    except ValueError as e:
        # 크롤러에서 올린 404 케이스 (잘못된 board_id/notice_id)
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"공지사항 상세 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="공지사항 상세 조회 실패")
    
# 입력: student_id (학번)
# 기능: LMS 받은 쪽지 목록 크롤링 및 반환
# 반환: MessageListResponse
@app.get("/api/messages", response_model=MessageListResponse)
def get_lms_messages(student_id: str = Depends(get_current_user)):
    session = resolve_lms_session(student_id)
    try:
        messages = crawl_all_messages(session)
        return MessageListResponse(
            success=True, 
            message="성공", 
            total_count=len(messages), 
            data=messages
        )
    except SessionExpiredError:
        raise HTTPException(status_code=401, detail="LMS 세션이 만료되었습니다.")
    except Exception:
        logger.exception("쪽지 목록 조회 실패")
        raise HTTPException(status_code=500, detail="쪽지 목록 조회 실패")
    
# 입력: assignment_id (과제 ID), student_id (학번)
# 기능: 특정 LMS 과제의 상세 정보 크롤링
# 반환: AssignmentDetailResponse 객체
@app.get("/api/assignments/{assignment_id}", response_model=AssignmentDetailResponse)
def get_assignment_detail_api(assignment_id: str, student_id: str = Depends(get_current_user)):
    session = resolve_lms_session(student_id)

    try:
        from lms_crawler import get_assignment_detail
        detail = get_assignment_detail(session, assignment_id)
        return AssignmentDetailResponse(success=True, message="성공", data=detail)
    except SessionExpiredError:
        raise HTTPException(status_code=401, detail="LMS 세션이 만료되었습니다.")
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"과제 상세 조회 실패: {e}")
        raise HTTPException(status_code=500, detail="과제 상세 조회 실패")
    
    
# 입력: url (다운로드할 세부 주소), student_id (인증된 학번)
# 기능: SSRF 및 무단 파일 접근을 방어하며 LMS 첨부파일을 프록시 다운로드
# 반환: 파일 스트리밍 응답
# 상세보기 영역 파일 다운로드 관련 보안
ALLOWED_DOMAINS = ["lms.chungbuk.ac.kr", "cbnu.ac.kr"] 
ALLOWED_PATH_KEYWORDS = ["pluginfile.php"] # 파일 다운로드 관련 키워드

@app.get("/api/download")
def proxy_download(url: str, student_id: str = Depends(get_current_user)):
    # URL 디코딩 및 파싱
    decoded_url = urllib.parse.unquote(url)
    parsed_url = urllib.parse.urlparse(decoded_url)
    
    # 스키마 검증 (http, https만 허용하여 file:// 등 차단)
    if parsed_url.scheme not in ["http", "https"]:
        raise HTTPException(status_code=400, detail="올바르지 않은 URL 형식입니다.")
    
    # SSRF 방어: 화이트리스트 기반 도메인 체크
    host = parsed_url.hostname
    if not host or not any(host == domain or host.endswith("." + domain) for domain in ALLOWED_DOMAINS):
        raise HTTPException(status_code=403, detail="허용되지 않은 도메인입니다.")

    # 추가 보안: 파일 다운로드와 관련된 경로인지 확인 (Open Proxy 방지)
    if not any(keyword in parsed_url.path for keyword in ALLOWED_PATH_KEYWORDS):
        raise HTTPException(status_code=403, detail="허용되지 않은 파일 접근 경로입니다.")
    
    # 해당 학생의 유효한 LMS 세션 가져오기
    session = resolve_lms_session(student_id)
    
    try:
        # stream=True를 사용하여 대용량 파일 유입 시 서버 메모리 고갈(DoS) 방지
        lms_resp = session.get(decoded_url, stream=True, timeout=20)

        if lms_resp.status_code != 200:
            raise HTTPException(status_code=lms_resp.status_code, detail="LMS에서 파일을 가져오지 못했습니다.")
            
        content_disposition = lms_resp.headers.get("Content-Disposition", "")
        content_type = lms_resp.headers.get("Content-Type", "application/octet-stream")
        
        def iterfile():
            for chunk in lms_resp.iter_content(chunk_size=8192):
                if chunk:
                    yield chunk

        return StreamingResponse(
            iterfile(),
            media_type=content_type,
            headers={"Content-Disposition": content_disposition}
        )
        
    except requests.RequestException as e:
        logger.error(f"LMS 파일 프록시 다운로드 중 오류 발생: {e}")
        raise HTTPException(status_code=500, detail="파일 다운로드 중 서버 오류가 발생했습니다.")


if __name__ == "__main__":
    uvicorn.run("assignment_api:app", host="0.0.0.0", port=8000, reload=True)