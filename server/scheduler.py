import logging
import requests
import time
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor

# 전역 스케줄러 참조 (assignment_api.py에서 설정)
_scheduler = None

def set_scheduler_instance(instance):
    global _scheduler
    _scheduler = instance

def schedule_notifications_for_user(student_id, lms_assignments=None):
    """특정 사용자의 모든 과제에 대해 정확한 발송 시각을 계산하여 예약 (Dynamic Scheduling)"""
    if not _scheduler:
        logger.warning(f"사용자 {student_id}: 스케줄러 인스턴스가 설정되지 않아 예약을 진행할 수 없습니다.")
        return

    try:
        settings = storage.get_user_settings(student_id)
        email_enabled = settings.get("emailAlerts", True)
        browser_enabled = settings.get("browserAlerts", True)
        reminders = settings.get("courseReminders", [])
        
        # 과제 데이터 수집 (LMS + 커스텀)
        all_assignments = []
        lms_fetch_success = True
        
        # LMS 과제 처리
        if lms_assignments is None:
            # 1단계: 캐시된 세션 시도
            cached_cookies = redis_cache.get_lms_session(student_id)
            session = requests.Session()
            if cached_cookies:
                session.cookies.update(cached_cookies)
            
            # 세션 유효성 확인 및 필요시 재로그인 (백그라운드 복구)
            is_valid = False
            if cached_cookies:
                try:
                    resp = session.get("https://lms.chungbuk.ac.kr/", timeout=5, allow_redirects=False)
                    is_valid = (resp.status_code == 200)
                except Exception:
                    is_valid = False
            
            if not is_valid:
                loaded_id, password = storage.load_user(student_id)
                if loaded_id and password:
                    session, _ = login_to_lms(loaded_id, password)
                    if session:
                        redis_cache.set_lms_session(student_id, session.cookies.get_dict())
                        is_valid = True
            
            # 크롤링 실행
            if is_valid:
                try:
                    lms_assignments = crawl_all_assignments(session, student_id)
                except Exception as e:
                    logger.error(f"사용자 {student_id} 과제 크롤링 실패: {e}")
                    lms_fetch_success = False
                    lms_assignments = []
            else:
                logger.warning(f"사용자 {student_id}: 유효한 LMS 세션을 확보할 수 없어 크롤링을 건너뜁니다.")
                lms_fetch_success = False
                lms_assignments = []
                
        for a in lms_assignments:
            all_assignments.append({
                "id": a["assignment_id"],
                "course_name": a["course_name"],
                "title": f"[{a['course_name']}] {a['assignment_name']}",
                "deadline": a["due_date"],
                "is_submitted": "제출" in a["status"] and "미제출" not in a["status"],
                "url": a["url"]
            })
        
        # 커스텀 과제 처리 (커스텀 과제는 DB에서 직접 가져오므로 항상 성공한다고 가정)
        custom_assignments = storage.get_custom_assignments(student_id)
        for a in custom_assignments:
            all_assignments.append({
                "id": f"custom_{a['id']}",
                "course_name": a["subject"],
                "title": f"[{a['subject']}] {a['task']}",
                "deadline": a["deadline"],
                "is_submitted": a["isSubmitted"],
                "url": "/"
            })

        # 알림 예약 계산 및 등록
        now = datetime.now(timezone.utc)
        new_job_ids = set()
        scheduled_count = 0

        if (email_enabled or browser_enabled) and reminders:
            for assignment in all_assignments:
                if assignment["is_submitted"]:
                    continue
                    
                deadline = parse_deadline(assignment["deadline"])
                if not deadline:
                    continue
                    
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
                        
                        run_date = deadline - timedelta(minutes=threshold_min)
                        if run_date <= now:
                            continue

                        r_id = r.get("id", f"{val}{unit}")
                        job_id = f"notify_{student_id}_{assignment['id']}_{r_id}"
                        new_job_ids.add(job_id)
                        
                        _scheduler.add_job(
                            func=send_single_notification_job,
                            trigger='date',
                            run_date=run_date,
                            id=job_id,
                            args=[student_id, assignment, f"{val}{'분' if unit=='minute' else '시간' if unit=='hour' else '일'}", f"{threshold_min}m_before"],
                            replace_existing=True,
                            misfire_grace_time=3600
                        )
                        scheduled_count += 1
                    except Exception as e:
                        logger.error(f"사용자 {student_id}: 예약 등록 오류 ({assignment['id']}): {e}")

        # Cleanup: 유효하지 않은 기존 예약 삭제
        existing_jobs = _scheduler.get_jobs()
        removed_count = 0
        for job in existing_jobs:
            if job.id.startswith(f"notify_{student_id}_"):
                # 방어 로직: LMS 크롤링에 실패했다면, LMS 관련 Job(ID가 'custom_'으로 시작하지 않음)은 건드리지 않음
                is_custom_job = f"notify_{student_id}_custom_" in job.id
                if not lms_fetch_success and not is_custom_job:
                    continue # 이번 턴에서는 LMS 예약 유효성을 판단할 수 없으므로 유지
                
                if job.id not in new_job_ids:
                    try:
                        _scheduler.remove_job(job.id)
                        removed_count += 1
                    except Exception:
                        pass
        
        if removed_count > 0:
            logger.info(f"사용자 {student_id}: 유효하지 않은 기존 예약 {removed_count}개 삭제 완료")
        
        if scheduled_count > 0:
            logger.info(f"사용자 {student_id}: 총 {scheduled_count}개의 알림 예약 완료")
        elif not (email_enabled or browser_enabled) or not reminders:
            # 알림이 완전히 꺼진 경우 (이때는 lms_fetch_success와 무관하게 모든 job 삭제 시도 가능)
            pass 
            
    except Exception as e:
        logger.error(f"사용자 {student_id} 알림 스케줄링 중 치명적 오류: {e}", exc_info=True)

def send_single_notification_job(student_id, assignment, time_str, alert_type):
    """예약된 시점에 실행될 단일 알림 발송 작업 (발송 직전 제출 여부 재확인)"""
    # 이미 발송 기록이 있는지 확인 (중복 방지)
    if storage.is_notification_sent(student_id, assignment["id"], alert_type):
        return

    # 최신 제출 상태 재확인
    is_submitted = False
    try:
        if str(assignment["id"]).startswith("custom_"):
            # 커스텀 과제: DB에서 현재 상태 확인
            actual_id = assignment["id"].replace("custom_", "")
            custom_assignments = storage.get_custom_assignments(student_id)
            for ca in custom_assignments:
                if str(ca["id"]) == actual_id:
                    is_submitted = ca["isSubmitted"]
                    break
        else:
            # LMS 과제: 캐시된 세션이 있다면 크롤링하여 확인 (너무 잦은 크롤링 방지를 위해 캐시 활용 권장)
            # 여기서는 예약 시점의 정보가 어느 정도 유효하다고 가정하되, 
            # 더 정밀하게 하려면 lms_assignments를 다시 가져올 수 있음.
            # 우선은 전달받은 assignment 객체의 상태를 기본으로 하되, 
            # 과제 조회 API 호출 시 예약이 갱신되므로 대부분의 경우 최신 상태가 유지됨.
            is_submitted = assignment.get("is_submitted", False)
    except Exception as e:
        logger.error(f"제출 상태 재확인 중 오류 (student_id: {student_id}): {e}")

    if is_submitted:
        logger.info(f"[Reserved Job] 사용자 {student_id}: 과제가 이미 제출되어 알림을 건너뜁니다. ({assignment['id']})")
        return

    title = "과제 마감 임박!"
    body = f"{assignment['title']} 마감이 {time_str} 남았습니다."
    
    results = send_all_notifications(
        student_id, 
        title, 
        body, 
        url=assignment['url'], 
        assignment_id=assignment['id']
    )
    
    is_sent = (results.get("email") is True) or any(r is True for r in results.get("push", []))
    if is_sent:
        storage.record_notification_sent(student_id, assignment["id"], alert_type)
        logger.info(f"[Reserved Job] 사용자 {student_id}: 알림 발송 성공 ({assignment['id']})")

import storage
import redis_cache
from lms_login import login_to_lms
from lms_crawler import crawl_all_assignments, get_enrolled_courses
from notification_service import send_all_notifications

logger = logging.getLogger(__name__)

def refresh_all_user_courses():
    """모든 사용자의 수강 과목 목록을 강제로 갱신 (매일 새벽용)"""
    logger.info("모든 사용자의 수강 과목 정보 갱신 시작...")
    student_ids = storage.get_all_student_ids()
    
    for student_id in student_ids:
        try:
            loaded_id, password = storage.load_user(student_id)
            if loaded_id and password:
                session, _ = login_to_lms(loaded_id, password)
                if session:
                    # student_id를 전달하면 get_enrolled_courses 내부에서 DB/Redis에 자동 저장함
                    # 캐시를 무시하고 새로 크롤링하기 위해 Redis 캐시 삭제 후 호출 고려 가능
                    # 여기서는 그냥 호출하여 최신화
                    get_enrolled_courses(session, student_id)
                    logger.info(f"사용자 {student_id} 과목 갱신 완료")
                time.sleep(0.5) # LMS 부하 방지
        except Exception as e:
            logger.error(f"사용자 {student_id} 과목 갱신 중 오류: {e}")

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

def check_and_send_notifications():
    """전체 사용자를 대상으로 알림 예약을 최신화하는 안전망 스케줄러 (Redis 락 적용)"""
    import os
    
    # 워커 식별자
    worker_id = f"worker_{os.getpid()}"
    
    # 락 획득 (여러 워커가 동시에 스케줄링을 갱신하는 것 방지)
    if not redis_cache.acquire_scheduler_lock(worker_id, expire_seconds=3300):
        logger.debug(f"[{worker_id}] 다른 워커가 이미 동기화를 진행 중입니다. 스킵합니다.")
        return

    logger.info(f"[{worker_id}] 전역 알림 예약 동기화 시작 (안전망 실행)")
    
    student_ids = storage.get_all_student_ids()
    
    # 부하를 분산하면서 모든 사용자의 예약을 재계산
    for student_id in student_ids:
        try:
            # 개별 사용자의 예약을 현재 상태에 맞춰 갱신
            schedule_notifications_for_user(student_id)
            time.sleep(0.1) # LMS 및 DB 부하 방지 (초당 10명)
        except Exception as e:
            logger.error(f"사용자 {student_id} 예약 갱신 중 오류: {e}")
    
    logger.info("전역 알림 예약 동기화 완료")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    check_and_send_notifications()