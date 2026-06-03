import pytest
import importlib
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock, call
import scheduler

@pytest.fixture
def mock_scheduler_instance():
    """APScheduler 인스턴스를 모킹한다."""
    mock_inst = MagicMock()
    # get_jobs가 리스트를 반환하도록 설정
    mock_inst.get_jobs.return_value = []
    scheduler.set_scheduler_instance(mock_inst)
    yield mock_inst
    scheduler.set_scheduler_instance(None)

# ─── 1. 유틸리티 및 기본 테스트 ──────────────────────────────────────────

def test_parse_deadline_all_cases():
    assert scheduler.parse_deadline("2026-06-01T12:00:00").hour == 3
    assert scheduler.parse_deadline("invalid") is None

def test_schedule_no_instance():
    scheduler.set_scheduler_instance(None)
    scheduler.schedule_notifications_for_user("user1")

# ─── 2. 알림 예약 로직 보강 ──────────────────────────────────────────────

@patch("scheduler.storage")
@patch("scheduler.redis_cache")
def test_schedule_notifications_specific_course(mock_redis, mock_storage, mock_scheduler_instance):
    """특정 과목에만 적용되는 리마인더 설정을 테스트."""
    mock_storage.get_user_settings.return_value = {
        "courseReminders": [
            {"courseId": "C1", "value": 1, "unit": "hour", "id": "1h"}, # C1 전용
            {"courseId": "C2", "value": 2, "unit": "hour", "id": "2h"}  # C2 전용
        ]
    }
    # LMS 과제는 C1 소속
    lms_assignments = [{"assignment_id": "L1", "course_id": "C1", "course_name": "M", 
                        "assignment_name": "A", "due_date": "2026-06-10T12:00:00", "status": "미제출", "url": "/u"}]
    
    scheduler.schedule_notifications_for_user("u1", lms_assignments=lms_assignments)
    
    # C1 리마인더만 등록되어야 함 (add_job 1회)
    assert mock_scheduler_instance.add_job.call_count == 1
    assert "1h" in mock_scheduler_instance.add_job.call_args.kwargs['id']

@patch("scheduler.storage")
@patch("scheduler.redis_cache")
def test_schedule_notifications_session_fail(mock_redis, mock_storage, mock_scheduler_instance):
    """LMS 세션 확보 실패 시 LMS를 건너뛰고 커스텀 과제만 처리하는지 확인."""
    mock_storage.get_user_settings.return_value = {"courseReminders": [{"courseId": "all", "value": 1}]}
    # 세션 캐시 없음 + 재로그인 실패
    mock_redis.get_lms_session.return_value = None
    mock_storage.load_user.return_value = (None, None)
    
    # 커스텀 과제는 있음
    mock_storage.get_custom_assignments.return_value = [{"id": "CA1", "subject": "S", "task": "T", 
                                                        "deadline": "2026-06-11T12:00:00", "isSubmitted": False}]
    
    scheduler.schedule_notifications_for_user("u1")
    
    # 커스텀 과제 1개만 예약되어야 함
    assert mock_scheduler_instance.add_job.call_count == 1
    assert "custom_CA1" in mock_scheduler_instance.add_job.call_args.kwargs['id']

# ─── 3. 알림 발송 및 제출 확인 보강 ────────────────────────────────────────

@patch("scheduler.storage")
@patch("scheduler.send_all_notifications")
def test_send_single_notification_lms_submitted(mock_send, mock_storage):
    """LMS 과제가 이미 제출된 상태(is_submitted=True)일 때 발송 스킵 확인."""
    # 과제 객체에 이미 제출됨으로 표시된 경우
    assign = {"id": "L1", "title": "T", "url": "/u", "is_submitted": True}
    mock_storage.is_notification_sent.return_value = False
    
    scheduler.send_single_notification_job("u1", assign, "1h", "t")
    mock_send.assert_not_called()

# ─── 4. 전체 갱신 로직 보강 ─────────────────────────────────────────────

@patch("scheduler.storage")
@patch("scheduler.login_to_lms")
@patch("scheduler.get_enrolled_courses")
def test_refresh_all_user_courses_full(mock_get, mock_login, mock_storage):
    """모든 사용자의 과목 정보를 성공적으로 갱신하는지 확인."""
    mock_storage.get_all_student_ids.return_value = ["u1", "u2"]
    mock_storage.load_user.return_value = ("user", "pass")
    mock_login.return_value = (MagicMock(), "success")
    
    with patch("time.sleep"):
        scheduler.refresh_all_user_courses()
        
    assert mock_get.call_count == 2
    assert mock_login.call_count == 2

# ─── 5. 예외 통합 처리 ───────────────────────────────────────────────

@patch("scheduler.storage")
def test_schedule_fatal_error_handling(mock_storage, mock_scheduler_instance):
    mock_storage.get_user_settings.side_effect = Exception("Critical DB Error")
    # 예외가 내부에서 잡히고 프로세스가 유지되어야 함
    scheduler.schedule_notifications_for_user("u1")

def test_parse_deadline_exception_coverage():
    """날짜 파싱 중 예외 발생 시 None을 반환하는지 테스트."""
    # datetime.fromisoformat 등 내부 함수가 에러를 던지도록 모킹
    with patch("scheduler.datetime") as mock_dt:
        mock_dt.fromisoformat.side_effect = Exception("Date Error")
        assert scheduler.parse_deadline("2026-01-01T00:00:00") is None

@patch("scheduler.storage")
@patch("scheduler.redis_cache")
def test_schedule_notifications_inner_exception_coverage(mock_redis, mock_storage, mock_scheduler_instance):
    """예약 루프 및 클린업 루프 내부에서 예외 발생 시의 커버리지 보강."""
    student_id = "user_err"
    mock_storage.get_user_settings.return_value = {
        "courseReminders": [{"courseId": "all", "value": 1, "unit": "hour"}]
    }
    # 1. 예약 루프 내부 에러
    mock_scheduler_instance.add_job.side_effect = Exception("Add Job Fail")
    scheduler.schedule_notifications_for_user(student_id, lms_assignments=[{
        "assignment_id": "L1", "course_id": "C1", "course_name": "M", 
        "assignment_name": "A", "due_date": "2026-06-10T12:00:00", "status": "미제출", "url": "/u"
    }])
    
    # 2. 클린업 루프 내부 에러
    mock_scheduler_instance.add_job.side_effect = None
    mock_job = MagicMock(id=f"notify_{student_id}_1")
    mock_scheduler_instance.get_jobs.return_value = [mock_job]
    mock_scheduler_instance.remove_job.side_effect = Exception("Remove Fail")
    scheduler.schedule_notifications_for_user(student_id, lms_assignments=[])

@patch("scheduler.storage")
def test_send_single_notification_job_exception_coverage(mock_storage):
    """알림 발송 작업 중 제출 상태 확인 실패 시 예외 처리 보강."""
    assignment = {"id": "custom_1", "title": "T", "url": "/u"}
    mock_storage.is_notification_sent.return_value = False
    # get_custom_assignments 실패 유도
    mock_storage.get_custom_assignments.side_effect = Exception("DB Error")
    
    # 에러 로그를 남기고 함수가 종료되어야 함
    scheduler.send_single_notification_job("u1", assignment, "1h", "t")

@patch("scheduler.redis_cache")
@patch("scheduler.storage")
def test_check_and_send_notifications_loop_exception_coverage(mock_storage, mock_redis):
    """전역 알림 동기화 중 개별 사용자 처리 실패 시 루프 지속 확인."""
    mock_redis.acquire_scheduler_lock.return_value = True
    mock_storage.get_all_student_ids.return_value = ["s1", "s2"]
    
    with patch("scheduler.schedule_notifications_for_user") as mock_sched:
        # 첫 번째 사용자는 에러, 두 번째는 성공
        mock_sched.side_effect = [Exception("User Error"), None]
        with patch("time.sleep"):
            scheduler.check_and_send_notifications()
            # s1이 실패해도 s2가 시도되었어야 함
            assert mock_sched.call_count == 2

# ─── 6. [기존/유지] schedule_notifications 및 send_single_job 보강 ────────

@patch("scheduler.storage")
def test_schedule_notifications_time_units(mock_storage, mock_scheduler_instance):
    """리마인더의 다양한 단위(minute, day) 처리 검증."""
    mock_storage.get_user_settings.return_value = {
        "courseReminders": [
            {"courseId": "all", "value": 30, "unit": "minute", "id": "m1"},
            {"courseId": "all", "value": 1, "unit": "day", "id": "d1"}
        ]
    }
    # 1시간 뒤 마감되는 과제
    future_deadline = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    lms_assignments = [{"assignment_id": "L1", "course_id": "C1", "course_name": "M", 
                        "assignment_name": "A", "due_date": future_deadline, "status": "미제출", "url": "/u"}]
    
    scheduler.schedule_notifications_for_user("u1", lms_assignments=lms_assignments)
    
    assert mock_scheduler_instance.add_job.call_count == 1
    assert "m1" in mock_scheduler_instance.add_job.call_args.kwargs['id']

@patch("scheduler.storage")
@patch("scheduler.send_all_notifications")
def test_send_single_notification_failure_no_record(mock_send, mock_storage):
    """알림 발송 실패 시 발송 기록을 남기지 않는지 확인."""
    assignment = {"id": "L1", "title": "T", "url": "/u", "is_submitted": False}
    mock_storage.is_notification_sent.return_value = False
    mock_send.return_value = {"email": False, "push": [False]}
    scheduler.send_single_notification_job("u1", assignment, "1h", "t")
    mock_storage.record_notification_sent.assert_not_called()

@patch("scheduler.storage")
@patch("scheduler.redis_cache")
def test_schedule_cleanup_on_lms_fetch_failure(mock_redis, mock_storage, mock_scheduler_instance):
    """LMS 크롤링 실패 시 LMS 관련 Job만 남기고 커스텀 Job은 정리하는 로직 확인."""
    student_id = "u1"
    mock_storage.get_user_settings.return_value = {"courseReminders": []}
    mock_job_lms = MagicMock(id=f"notify_{student_id}_L1_1h")
    mock_job_custom = MagicMock(id=f"notify_{student_id}_custom_C1_1h")
    mock_scheduler_instance.get_jobs.return_value = [mock_job_lms, mock_job_custom]
    mock_redis.get_lms_session.return_value = None
    mock_storage.load_user.return_value = (None, None)
    scheduler.schedule_notifications_for_user(student_id)
    mock_scheduler_instance.remove_job.assert_called_once_with(mock_job_custom.id)

# ─── 7. [신규/추가] schedule, send_job, refresh 상세 강화 ───────────────────

@patch("scheduler.storage")
def test_schedule_notifications_disabled_cleanup(mock_storage, mock_scheduler_instance):
    """알림이 완전히 꺼진 경우 모든 기존 Job이 삭제되는지 확인."""
    student_id = "u_off"
    # 알림 설정 자체가 꺼짐
    mock_storage.get_user_settings.return_value = {"emailAlerts": False, "browserAlerts": False}
    mock_job = MagicMock(id=f"notify_{student_id}_job1")
    mock_scheduler_instance.get_jobs.return_value = [mock_job]
    
    scheduler.schedule_notifications_for_user(student_id, lms_assignments=[])
    # 모든 기존 Job이 삭제 루프에 진입해야 함
    mock_scheduler_instance.remove_job.assert_called_with(mock_job.id)

@patch("scheduler.storage")
@patch("scheduler.send_all_notifications")
def test_send_single_notification_job_lms_status_exception(mock_send, mock_storage):
    """LMS 과제 상태 재확인 중 예외 발생 시 안전하게 기존 정보로 진행 확인."""
    assignment = {"id": "LMS_1", "title": "T", "url": "/u", "is_submitted": False}
    mock_storage.is_notification_sent.return_value = False
    mock_send.return_value = {"email": True}
    
    # LMS 상태 확인 로직은 assignment["id"]가 custom_으로 시작하지 않을 때 발생
    # 이 과정에서 예외가 발생하더라도 함수가 끝까지 실행되어야 함
    with patch("scheduler.logger") as mock_logger:
        scheduler.send_single_notification_job("u1", assignment, "1h", "t")
        # 발송은 시도되어야 함
        mock_send.assert_called_once()

@patch("scheduler.storage")
@patch("scheduler.login_to_lms")
@patch("scheduler.get_enrolled_courses")
def test_refresh_all_user_courses_partial_login_fail(mock_get, mock_login, mock_storage):
    """일부 사용자의 로그인이 실패(session=None)할 때의 스킵 로직 확인."""
    mock_storage.get_all_student_ids.return_value = ["u1", "u2"]
    mock_storage.load_user.return_value = ("u", "p")
    # u1은 로그인 성공, u2는 로그인 실패
    mock_login.side_effect = [(MagicMock(), "ok"), (None, "fail")]
    
    with patch("time.sleep"):
        scheduler.refresh_all_user_courses()
    
    # get_enrolled_courses는 로그인에 성공한 u1에 대해서만 1회 호출되어야 함
    assert mock_get.call_count == 1

# 마지막에 모듈 정상 복구
@pytest.fixture(scope="module", autouse=True)
def restore_scheduler():
    yield
    importlib.reload(scheduler)
