import logging
import time
import requests
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

import storage
import redis_cache
from lms_login import login_to_lms
from lms_crawler import crawl_all_assignments
from notification_service import send_all_notifications

logger = logging.getLogger(__name__)

def parse_deadline(date_str):
    """마감 기한 문자열을 datetime 객체로 변환 (LMS 시간은 KST)"""
    if not date_str:
        return None
    try:
        # ISO 형식 (2024-05-25T23:59:00)
        dt = datetime.fromisoformat(date_str.replace('Z', ''))
    except Exception:
        try:
            # 일반 공백 형식 (2024-05-25 23:59)
            dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M")
        except Exception:
            return None
    
    # 한국 시간(KST)을 UTC로 변환하여 반환
    return dt.replace(tzinfo=timezone.utc) - timedelta(hours=9)

def check_user_logic(student_id, now):
    """실제 개별 사용자의 알림 체크 및 발송 로직"""
    settings = storage.get_user_settings(student_id)
    
    # 1. 알림 활성화 여부 체크 (이메일 혹은 브라우저 중 하나라도 켜져 있어야 함)
    email_enabled = settings.get("emailAlerts", False)
    browser_enabled = settings.get("browserAlerts", False)
    
    if not (email_enabled or browser_enabled):
        logger.debug(f"사용자 {student_id}: 알림 설정이 모두 꺼져 있어 스킵합니다.")
        return
        
    reminders = settings.get("courseReminders", [])
    if not reminders:
        logger.debug(f"사용자 {student_id}: 설정된 리마인더가 없습니다.")
        return

    # 과제 데이터 가져오기
    all_assignments = []
    cached_cookies = redis_cache.get_lms_session(student_id)
    
    session = requests.Session()
    lms_fetched = False
    
    if cached_cookies:
        session.cookies.update(cached_cookies)
        try:
            lms_assignments = crawl_all_assignments(session)
            lms_fetched = True
        except Exception as e:
            logger.debug(f"사용자 {student_id}: 캐시 세션 크롤링 실패 ({e})")
    
    if not lms_fetched:
        loaded_id, password = storage.load_user(student_id)
        if loaded_id and password:
            session, _ = login_to_lms(loaded_id, password)
            if session:
                redis_cache.set_lms_session(student_id, session.cookies.get_dict())
                try:
                    lms_assignments = crawl_all_assignments(session)
                    lms_fetched = True
                except Exception as e:
                    logger.error(f"사용자 {student_id}: LMS 로그인 후 크롤링 실패 ({e})")
    
    if lms_fetched:
        for a in lms_assignments:
            all_assignments.append({
                "id": a["assignment_id"],
                "course_name": a["course_name"], # 프론트엔드와 맞추기 위해 이름 추가
                "title": f"[{a['course_name']}] {a['assignment_name']}",
                "deadline": a["due_date"],
                "is_submitted": a["status"] == "제출"
            })
    
    # 커스텀 과제 추가
    custom_assignments = storage.get_custom_assignments(student_id)
    for a in custom_assignments:
        all_assignments.append({
            "id": f"custom_{a['id']}",
            "course_name": a["subject"], # 프론트엔드와 맞추기 위해 이름 추가
            "title": f"[{a['subject']}] {a['task']}",
            "deadline": a["deadline"],
            "is_submitted": a["isSubmitted"]
        })

    logger.info(f"사용자 {student_id}: 총 {len(all_assignments)}개의 과제를 체크 중...")

    # 마감 임박 체크 및 발송
    for assignment in all_assignments:
        if assignment["is_submitted"]:
            continue
            
        deadline = parse_deadline(assignment["deadline"])
        if not deadline:
            continue
        
        time_diff = deadline - now
        minutes_left = time_diff.total_seconds() / 60
        
        # 마감이 지난 과제는 제외
        if minutes_left < 0:
            continue
        
        # 해당 과제에 적용되는 알림 설정 필터링 (과목명으로 매칭!)
        applicable_reminders = [
            r for r in reminders 
            if r.get("courseId") == "all" or r.get("courseId") == assignment.get("course_name")
        ]

        for r in applicable_reminders:
            try:
                val = int(r.get("value", 0))
                unit = r.get("unit", "hour")
                
                threshold_min = val
                if unit == "hour": threshold_min *= 60
                elif unit == "day": threshold_min *= 1440
                
                logger.info(f"  [체크중] {assignment['title']} - 남은시간: {int(minutes_left)}분 / 설정: {threshold_min}분 전")

                # 발송 조건: 마감까지 남은 시간이 설정한 시간(threshold_min) 이하일 때 발송
                if minutes_left <= threshold_min:
                    alert_type = f"{threshold_min}m_before"
                    
                    if not storage.is_notification_sent(student_id, assignment["id"], alert_type):
                        title = "과제 마감 임박!"
                        time_str = f"{val}{'분' if unit=='minute' else '시간' if unit=='hour' else '일'}"
                        body = f"{assignment['title']} 마감이 {time_str} 남았습니다."
                        
                        logger.info(f"🔔 사용자 {student_id}에게 알림 발송! 과제: {assignment['title']}")
                        send_all_notifications(student_id, title, body)
                        storage.record_notification_sent(student_id, assignment["id"], alert_type)
                    else:
                        logger.debug(f"사용자 {student_id}: 이미 발송된 알림 ({alert_type})")
            except Exception as e:
                logger.error(f"알림 판정 중 오류: {e}")

def process_user_notification_wrapper(student_id, now):
    """에러 핸들링을 포함한 개별 사용자 처리 래퍼"""
    try:
        check_user_logic(student_id, now)
    except Exception as e:
        logger.error(f"사용자 {student_id} 처리 중 오류 발생: {e}", exc_info=True)

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
