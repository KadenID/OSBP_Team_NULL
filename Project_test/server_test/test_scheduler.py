import pytest
import importlib
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock, call
import scheduler

@pytest.fixture
def mock_scheduler_instance():
    """APScheduler 인스턴스를 모킹한다."""
    mock_inst = MagicMock()
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

# 마지막에 모듈 정상 복구
@pytest.fixture(scope="module", autouse=True)
def restore_scheduler():
    yield
    importlib.reload(scheduler)
