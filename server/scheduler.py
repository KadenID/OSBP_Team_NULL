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
        email_enabled = settings.get("emailAlerts", False)
        browser_enabled = settings.get("browserAlerts", False)
        
        # 알림이 꺼져 있거나 리마인더 설정이 없으면 기존 예약된 작업들 삭제 후 종료
        reminders = settings.get("courseReminders", [])
        if not (email_enabled or browser_enabled) or not reminders:
            jobs = _scheduler.get_jobs()
            removed_count = 0
            for job in jobs:
                if job.id.startswith(f"notify_{student_id}_"):
                    _scheduler.remove_job(job.id)
                    removed_count += 1
            if removed_count > 0:
                logger.info(f"사용자 {student_id}: 알림 비활성화로 인해 {removed_count}개의 예약된 작업 삭제")
            return

        # 과제 데이터 구성
        all_assignments = []
        
        # 1. LMS 과제 처리
        if lms_assignments is None:
            # 전달받은 데이터가 없으면 캐시된 세션으로 크롤링 시도
            cached_cookies = redis_cache.get_lms_session(student_id)
            if cached_cookies:
                session = requests.Session()
                session.cookies.update(cached_cookies)
                try:
                    lms_assignments = crawl_all_assignments(session, student_id)
                except Exception as e:
                    logger.error(f"사용자 {student_id} 과제 크롤링 실패: {e}")
                    lms_assignments = []
            else:
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
        
        # 2. 커스텀 과제 처리
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

        now = datetime.now(timezone.utc)
        scheduled_count = 0

        for assignment in all_assignments:
            # 제출된 과제는 기존 예약이 있다면 삭제하고 건너뜀
            if assignment["is_submitted"]:
                jobs = _scheduler.get_jobs()
                for job in jobs:
                    if job.id.startswith(f"notify_{student_id}_{assignment['id']}_"):
                        _scheduler.remove_job(job.id)
                continue
                
            deadline = parse_deadline(assignment["deadline"])
            if not deadline:
                continue
                
            # 해당 과제에 적용 가능한 리마인더 필터링
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
                    
                    # 발송 예정 시각 계산
                    run_date = deadline - timedelta(minutes=threshold_min)
                    
                    # 이미 지난 시각이면 예약하지 않음
                    if run_date <= now:
                        continue

                    # 고유 Job ID 생성 (중복 방지 및 업데이트용)
                    r_id = r.get("id", f"{val}{unit}")
                    job_id = f"notify_{student_id}_{assignment['id']}_{r_id}"
                    
                    # 예약 등록 (이미 존재하면 덮어쓰기)
                    _scheduler.add_job(
                        func=send_single_notification_job,
                        trigger='date',
                        run_date=run_date,
                        id=job_id,
                        args=[student_id, assignment, f"{val}{'분' if unit=='minute' else '시간' if unit=='hour' else '일'}", f"{threshold_min}m_before"],
                        replace_existing=True,
                        misfire_grace_time=3600 # 1시간까지는 늦어져도 실행 시도
                    )
                    scheduled_count += 1
                except Exception as e:
                    logger.error(f"사용자 {student_id}: 예약 등록 오류 ({assignment['id']}): {e}")
        
        if scheduled_count > 0:
            logger.info(f"사용자 {student_id}: 총 {scheduled_count}개의 알림 예약 완료")
            
    except Exception as e:
        logger.error(f"사용자 {student_id} 알림 스케줄링 중 치명적 오류: {e}", exc_info=True)

def send_single_notification_job(student_id, assignment, time_str, alert_type):
    """예약된 시점에 실행될 단일 알림 발송 작업 (발송 직전 제출 여부 재확인)"""
    # 1. 이미 발송 기록이 있는지 확인 (중복 방지)
    if storage.is_notification_sent(student_id, assignment["id"], alert_type):
        return

    # 2. 최신 제출 상태 재확인
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

def check_user_logic(student_id, now):
    """실제 개별 사용자의 알림 체크 및 발송 로직"""
    settings = storage.get_user_settings(student_id)
    
    # 알림 활성화 여부 체크 (이메일 혹은 브라우저 중 하나라도 켜져 있어야 함)
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
            lms_assignments = crawl_all_assignments(session, student_id)
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
                    lms_assignments = crawl_all_assignments(session, student_id)
                    lms_fetched = True
                except Exception as e:
                    logger.error(f"사용자 {student_id}: LMS 로그인 후 크롤링 실패 ({e})")
    
    if lms_fetched:
        for a in lms_assignments:
            all_assignments.append({
                "id": a["assignment_id"],
                "course_name": a["course_name"],
                "title": f"[{a['course_name']}] {a['assignment_name']}",
                "deadline": a["due_date"],
                "is_submitted": "제출" in a["status"] and "미제출" not in a["status"],
                "url": a["url"]
            })
    
    # 커스텀 과제 추가
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

    logger.info(f"사용자 {student_id}: 총 {len(all_assignments)}개의 과제를 체크 중...")

    pending_alerts = []

    # 마감 임박 체크
    for assignment in all_assignments:
        if assignment["is_submitted"]:
            continue
            
        deadline = parse_deadline(assignment["deadline"])
        if not deadline:
            continue
        
        time_diff = deadline - now
        minutes_left = time_diff.total_seconds() / 60
        
        # 마감이 너무 오래 지난 과제(30분 이상)는 체크 제외
        if minutes_left < -30:
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
                
                # 중복 발송 방지 및 유연한 윈도우 체크 (기준 시간 이하이고, 마감 후 30분 이내일 때)
                if minutes_left <= threshold_min and minutes_left > -30:
                    alert_type = f"{threshold_min}m_before"
                    if not storage.is_notification_sent(student_id, assignment["id"], alert_type):
                        pending_alerts.append({
                            "assignment": assignment,
                            "alert_type": alert_type,
                            "time_str": f"{val}{'분' if unit=='minute' else '시간' if unit=='hour' else '일'}"
                        })
            except Exception as e:
                logger.error(f"알림 판정 중 오류: {e}")

    # 통합 발송 처리
    if not pending_alerts:
        return

    from notification_service import send_all_notifications
    if len(pending_alerts) == 1:
        alert = pending_alerts[0]
        title = "과제 마감 임박!"
        body = f"{alert['assignment']['title']} 마감이 {alert['time_str']} 남았습니다."
        # 단일 알림 시 ID와 URL 모두 전달
        results = send_all_notifications(student_id, title, body, url=alert['assignment']['url'], assignment_id=alert['assignment']['id'])
        
        # 실제 발송 성공 여부 체크 (이메일 또는 푸시 중 하나라도 성공한 경우에만 기록)
        is_sent = (results.get("email") is True) or any(r is True for r in results.get("push", []))
        if is_sent:
            storage.record_notification_sent(student_id, alert['assignment']['id'], alert['alert_type'])
            logger.info(f"사용자 {student_id}: 단일 알림 발송 성공 및 기록 완료")
        else:
            logger.warning(f"사용자 {student_id}: 단일 알림 발송 실패 (기록 저장 안 함)")
    else:
        title = f"마감 임박 과제가 {len(pending_alerts)}건 있습니다"
        body = "\n".join([f"• {a['assignment']['title']} ({a['time_str']} 전)" for a in pending_alerts])
        # 통합 알림 시 과제 ID들을 합쳐서 기록 (URL은 메인으로)
        all_ids = ",".join([str(a['assignment']['id']) for a in pending_alerts])
        results = send_all_notifications(student_id, title, body, url="/main", assignment_id=all_ids)
        
        is_sent = (results.get("email") is True) or any(r is True for r in results.get("push", []))
        if is_sent:
            for alert in pending_alerts:
                storage.record_notification_sent(student_id, alert['assignment']['id'], alert['alert_type'])
            logger.info(f"사용자 {student_id}: {len(pending_alerts)}건 통합 알림 발송 성공 및 기록 완료")
        else:
            logger.warning(f"사용자 {student_id}: 통합 알림 발송 실패 (기록 저장 안 함)")

def process_user_notification_wrapper(student_id, now):
    """에러 핸들링을 포함한 개별 사용자 처리 래퍼"""
    try:
        check_user_logic(student_id, now)
    except Exception as e:
        logger.error(f"사용자 {student_id} 처리 중 오류 발생: {e}", exc_info=True)

def check_and_send_notifications():
    """전체 사용자를 대상으로 알림 체크를 수행하는 엔트리 포인트 (Redis 락 적용)"""
    import os
    
    # 워커 식별자 (프로세스 ID 포함)
    worker_id = f"worker_{os.getpid()}"
    
    # 스케줄러 주기가 1시간이므로 락 만료 시간은 55분 정도로 길게 설정하여
    # 해당 주기 동안 한 명의 워커만 실행되도록 보장
    if not redis_cache.acquire_scheduler_lock(worker_id, expire_seconds=3300):
        logger.debug(f"[{worker_id}] 다른 워커가 이미 스케줄러를 실행 중이거나 실행했습니다. 스킵합니다.")
        return

    logger.info(f"[{worker_id}] 마감 알림 체크 스케줄러 실행 중...")
    
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
