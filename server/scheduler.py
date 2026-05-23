import logging
import time
import requests
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor

import storage
import redis_cache
from lms_login import login_to_lms
from lms_crawler import crawl_all_assignments
from notification_service import send_all_notifications

logger = logging.getLogger(__name__)

def parse_deadline(date_str):
    """마감 기한 문자열을 datetime 객체로 변환 (ISO 8601 및 다양한 형식 지원)"""
    if not date_str:
        return None
    try:
        # ISO 8601 형식 (lms_crawler 결과: 2024-05-25T23:59:00)
        return datetime.fromisoformat(date_str.replace('Z', '+00:00')).replace(tzinfo=timezone.utc)
    except Exception:
        try:
            # 일반 공백 형식 (2024-05-25 23:59)
            return datetime.strptime(date_str, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)
        except Exception:
            try:
                # 날짜만 있는 경우
                return datetime.strptime(date_str, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
            except Exception:
                return None

def check_user_logic(student_id, now):
    """실제 개별 사용자의 알림 체크 및 발송 로직"""
    settings = storage.get_user_settings(student_id)
    
    # 알림 활성화 여부 체크 (프론트엔드 키: isAlarmEnabled)
    if not settings.get("isAlarmEnabled", True):
        return
        
    reminders = settings.get("courseReminders", [])
    if not reminders:
        return

    # 과제 데이터 가져오기 (Redis 세션 우선 활용)
    all_assignments = []
    cached_cookies = redis_cache.get_lms_session(student_id)
    
    session = requests.Session()
    lms_fetched = False
    
    if cached_cookies:
        session.cookies.update(cached_cookies)
        try:
            lms_assignments = crawl_all_assignments(session)
            lms_fetched = True
        except Exception:
            pass
    
    if not lms_fetched:
        loaded_id, password = storage.load_user(student_id)
        if loaded_id and password:
            session, _ = login_to_lms(loaded_id, password)
            if session:
                redis_cache.set_lms_session(student_id, session.cookies.get_dict())
                try:
                    lms_assignments = crawl_all_assignments(session)
                    lms_fetched = True
                except:
                    pass
    
    if lms_fetched:
        for a in lms_assignments:
            all_assignments.append({
                "id": a["assignment_id"],
                "course_id": a.get("course_id", "all"),
                "title": f"[{a['course_name']}] {a['assignment_name']}",
                "deadline": a["due_date"],
                "is_submitted": a["status"] == "제출"
            })
    
    # 커스텀 과제 추가
    custom_assignments = storage.get_custom_assignments(student_id)
    for a in custom_assignments:
        all_assignments.append({
            "id": f"custom_{a['id']}",
            "course_id": "all",
            "title": f"[{a['subject']}] {a['task']}",
            "deadline": a["deadline"],
            "is_submitted": a["isSubmitted"]
        })

    # 마감 임박 체크 및 발송
    for assignment in all_assignments:
        if assignment["is_submitted"]:
            continue
            
        deadline = parse_deadline(assignment["deadline"])
        if not deadline:
            continue
        
        time_diff = deadline - now
        minutes_left = time_diff.total_seconds() / 60
        
        if minutes_left < 0:
            continue
        
        # 해당 과제에 적용되는 알림 설정 필터링
        applicable_reminders = [
            r for r in reminders 
            if r.get("courseId") == "all" or r.get("courseId") == assignment.get("course_id")
        ]

        for r in applicable_reminders:
            val = int(r.get("value", 0))
            unit = r.get("unit", "hour")
            
            threshold_min = val
            if unit == "hour": threshold_min *= 60
            elif unit == "day": threshold_min *= 1440
            
            if minutes_left <= threshold_min:
                alert_type = f"{threshold_min}m_before"
                
                if not storage.is_notification_sent(student_id, assignment["id"], alert_type):
                    title = "과제 마감 임박!"
                    time_str = f"{val}{'분' if unit=='minute' else '시간' if unit=='hour' else '일'}"
                    body = f"'{assignment['title']}' 마감이 {time_str} 남았습니다."
                    
                    send_all_notifications(student_id, title, body)
                    storage.record_notification_sent(student_id, assignment["id"], alert_type)

def process_user_notification_wrapper(student_id, now):
    """에러 핸들링을 포함한 개별 사용자 처리 래퍼"""
    try:
        check_user_logic(student_id, now)
    except Exception:
        pass

def check_and_send_notifications():
    logger.info("마감 알림 체크 스케줄러 실행 중...")
    
    student_ids = storage.get_all_student_ids()
    now = datetime.now(timezone.utc)
    
    # 13,000명 대응을 위한 병렬 처리 (Max 15)
    MAX_WORKERS = 15 
    
    logger.info(f"총 {len(student_ids)}명의 사용자 체크 시작 (병렬 스레드: {MAX_WORKERS})")
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for student_id in student_ids:
            executor.submit(process_user_notification_wrapper, student_id, now)
            time.sleep(0.05) # 초당 20명 정도의 속도로 제한하여 LMS 부하 방지
    
    logger.info("알림 체크 완료")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    check_and_send_notifications()
