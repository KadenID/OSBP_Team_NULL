import os
import json
import logging
from upstash_redis import Redis
from dotenv import load_dotenv

if os.path.exists("/etc/secrets/.env"):
    load_dotenv("/etc/secrets/.env")
else:
    load_dotenv()

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis 설정
url = os.getenv("UPSTASH_REDIS_REST_URL") # 접속 URL
token = os.getenv("UPSTASH_REDIS_REST_TOKEN") # 접속 토큰

if not url or not token:
    logger.warning("Redis 환경 변수가 설정되지 않았습니다. 캐싱이 비활성화됩니다.")
    redis_client = None # Redis 클라이언트
else:
    redis_client = Redis(url=url, token=token) # Redis 클라이언트

# 입력: student_id (학번), cookies (쿠키 딕셔너리), expire_seconds (만료 초)
# 기능: LMS 세션(쿠키)을 Redis에 직렬화하여 저장
# 반환: 없음
def set_lms_session(student_id: str, cookies: dict, expire_seconds: int = 1500):
    if not redis_client:
        return
    
    try:
        key = f"lms_session:{student_id}"
        redis_client.set(key, json.dumps(cookies), ex=expire_seconds)
        logger.info(f"Redis에 세션 저장 완료 (student_id: {student_id})")
    except Exception as e:
        logger.error(f"Redis 세션 저장 오류: {e}")

# 입력: student_id (학번), courses (과목 딕셔너리), expire_seconds (만료 초, 기본 24시간)
# 기능: 수강 과목 목록을 Redis에 캐싱
def set_cached_courses(student_id: str, courses: dict, expire_seconds: int = 86400):
    if not redis_client:
        return
    try:
        key = f"user_courses:{student_id}"
        redis_client.set(key, json.dumps(courses), ex=expire_seconds)
        logger.info(f"Redis에 과목 캐싱 완료 (student_id: {student_id})")
    except Exception as e:
        logger.error(f"Redis 과목 캐싱 오류: {e}")

# 입력: student_id (학번)
# 기능: Redis에서 캐싱된 과목 목록 조회
def get_cached_courses(student_id: str) -> dict:
    if not redis_client:
        return None
    try:
        key = f"user_courses:{student_id}"
        data = redis_client.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.error(f"Redis 과목 로드 오류: {e}")
    return None

# 입력: student_id (학번)
# 기능: Redis에서 학번으로 저장된 세션(쿠키) 정보를 역직렬화하여 로드
# 반환: 쿠키 딕셔너리 (없거나 에러 시 None)
def get_lms_session(student_id: str) -> dict:
    if not redis_client:
        return None
    
    try:
        key = f"lms_session:{student_id}"
        data = redis_client.get(key)
        if data:
            logger.info(f"Redis에서 세션 로드 성공 (student_id: {student_id})")
            return json.loads(data)
    except Exception as e:
        logger.error(f"Redis 세션 로드 오류: {e}")
    
    return None

# 입력: student_id (학번)
# 기능: Redis에서 학번으로 저장된 세션 정보를 영구 삭제
# 반환: 없음
def delete_lms_session(student_id: str):
    if not redis_client:
        return
    
    try:
        key = f"lms_session:{student_id}"
        redis_client.delete(key)
        logger.info(f"Redis 세션 삭제 완료 (student_id: {student_id})")
    except Exception as e:
        logger.error(f"Redis 세션 삭제 오류: {e}")

# 입력: student_id (학번)
# 기능: 해당 사용자와 관련된 모든 Redis 데이터(세션, 과목 캐시, 로그인 시도 기록) 삭제
def delete_user_data(student_id: str):
    if not redis_client:
        return
    try:
        keys = [
            f"lms_session:{student_id}",
            f"user_courses:{student_id}",
            f"login_attempts:{student_id}"
        ]
        for key in keys:
            redis_client.delete(key)
        logger.info(f"사용자 Redis 데이터 전체 삭제 완료 (student_id: {student_id})")
    except Exception as e:
        logger.error(f"사용자 Redis 데이터 삭제 중 오류 발생: {e}")

# 입력: student_id (학번), max_attempts (최대 시도 횟수), window_seconds (제한 시간)
# 기능: 학번 기반의 로그인 시도 횟수 제한 확인
# 반환: 통과 여부 (bool)
def check_login_rate_limit(student_id: str, max_attempts: int = 5, window_seconds: int = 600) -> bool:
    if not redis_client:
        return True
    
    try:
        key = f"login_attempts:{student_id}"
        # 원자적으로 1 증가시키고 새로운 값을 가져옴
        current_attempts = redis_client.incr(key)
        
        # 첫 번째 시도일 경우 만료 시간 설정
        if current_attempts == 1:
            redis_client.expire(key, window_seconds)
        
        if current_attempts > max_attempts:
            return False
            
        return True
    except Exception as e:
        logger.error(f"Rate limit 체크 중 오류 발생: {e}")
        return True

# 입력: student_id (학번)
# 기능: 로그인 성공 시 해당 학번의 로그인 시도 횟수 기록 삭제
# 반환: 없음
def reset_login_attempts(student_id: str):
    if not redis_client:
        return
    
    try:
        key = f"login_attempts:{student_id}"
        redis_client.delete(key)
    except Exception as e:
        logger.error(f"Rate limit 초기화 중 오류 발생: {e}")

# 입력: ip_address (클라이언트 IP), max_attempts (최대 시도 횟수), window_seconds (제한 시간)
# 기능: IP 주소 기반의 로그인 시도 횟수 제한 확인
# 반환: 통과 여부 (bool)
def check_ip_rate_limit(ip_address: str, max_attempts: int = 20, window_seconds: int = 600) -> bool:
    if not redis_client:
        return True
    
    try:
        key = f"ip_attempts:{ip_address}"
        current_attempts = redis_client.incr(key)
        
        if current_attempts == 1:
            redis_client.expire(key, window_seconds)
        
        if current_attempts > max_attempts:
            return False
            
        return True
    except Exception as e:
        logger.error(f"IP Rate limit 체크 중 오류 발생: {e}")
        return True

# --- 스케줄러 분산 락 (Multi-worker 중복 방지) ---

def acquire_scheduler_lock(worker_id: str, expire_seconds: int = 120) -> bool:
    """
    특정 워커가 스케줄러 실행 권한(락)을 획득하려고 시도함.
    NX=True 옵션을 통해 키가 없을 때만 생성 성공 (최초 획득자만 True 반환)
    """
    if not redis_client:
        # Redis가 없으면 락을 걸 수 없으므로 안전을 위해 True 반환 (단일 워커라고 가정)
        return True
    
    try:
        key = "scheduler_lock"
        # SET key value NX EX expire_seconds
        # NX: 키가 없을 때만 설정, GET: 이전 값 반환 (여기서는 사용 안 함)
        # upstash-redis 라이브러리 사양에 맞게 구현
        result = redis_client.set(key, worker_id, ex=expire_seconds, nx=True)
        return result is True
    except Exception as e:
        logger.error(f"Redis 스케줄러 락 획득 오류: {e}")
        return False

def release_scheduler_lock():
    """스케줄러 락 해제 (서버 종료 시 등)"""
    if not redis_client:
        return
    try:
        redis_client.delete("scheduler_lock")
    except Exception as e:
        logger.error(f"Redis 스케줄러 락 해제 오류: {e}")
