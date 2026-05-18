import os
import json
import logging
from upstash_redis import Redis
from dotenv import load_dotenv

load_dotenv()

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Redis 연결 설정
url = os.getenv("UPSTASH_REDIS_REST_URL")
token = os.getenv("UPSTASH_REDIS_REST_TOKEN")

if not url or not token:
    logger.warning("Redis 환경 변수가 설정되지 않았습니다. 캐싱이 비활성화됩니다.")
    redis_client = None
else:
    redis_client = Redis(url=url, token=token)

def set_lms_session(student_id: str, cookies: dict, expire_seconds: int = 1500):
    """
    LMS 세션(쿠키)을 Redis에 저장합니다. 기본 25분(1500초) 만료.
    """
    if not redis_client:
        return
    
    try:
        key = f"lms_session:{student_id}"
        redis_client.set(key, json.dumps(cookies), ex=expire_seconds)
        logger.info(f"Redis에 세션 저장 완료 (student_id: {student_id})")
    except Exception as e:
        logger.error(f"Redis 세션 저장 오류: {e}")

def get_lms_session(student_id: str) -> dict:
    """
    Redis에서 LMS 세션(쿠키)을 가져옵니다.
    """
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

def delete_lms_session(student_id: str):
    """
    Redis에서 LMS 세션 정보를 삭제합니다.
    """
    if not redis_client:
        return
    
    try:
        key = f"lms_session:{student_id}"
        redis_client.delete(key)
        logger.info(f"Redis 세션 삭제 완료 (student_id: {student_id})")
    except Exception as e:
        logger.error(f"Redis 세션 삭제 오류: {e}")
