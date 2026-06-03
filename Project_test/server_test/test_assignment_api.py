import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, call
from assignment_api import app, get_current_user, restore_all_notifications
import requests
from lms_crawler import SessionExpiredError

client = TestClient(app)

# ─── 의존성 오버라이드 및 유틸리티 ──────────────────────────────────────

@pytest.fixture
def auth_override():
    app.dependency_overrides[get_current_user] = lambda: "20240001"
    yield
    app.dependency_overrides.clear()

def create_mock_response(text="<html></html>", status_code=200):
    mock_resp = MagicMock()
    mock_resp.text = text
    mock_resp.status_code = status_code
    mock_resp.iter_content.return_value = [b"data"]
    mock_resp.headers = {"Content-Type": "text/html"}
    return mock_resp

# ─── 1. [기존/유지] 로그인 및 기본 기능 ───────────────────────────────────

def test_health_check():
    assert client.get("/health").status_code == 200

@patch("assignment_api.redis_cache")
@patch("assignment_api.login_to_lms")
@patch("assignment_api.storage")
def test_login_success(mock_storage, mock_login, mock_redis):
    mock_redis.check_ip_rate_limit.return_value = True
    mock_redis.check_login_rate_limit.return_value = True
    mock_sess = MagicMock()
    mock_sess.cookies.get_dict.return_value = {"MoodleSession": "mock"}
    mock_login.return_value = (mock_sess, "성공")
    response = client.post("/auth/login", json={"student_id": "20240001", "password": "pw"})
    assert response.status_code == 200

# ─── 2. [추가] 로그아웃, 탈퇴, 알림 복구 (성공 경로) ─────────────────────────

@patch("assignment_api.storage")
@patch("assignment_api.redis_cache")
def test_logout_success(mock_redis, mock_storage, auth_override):
    response = client.post("/auth/logout")
    assert response.status_code == 200
    mock_storage.delete_refresh_token.assert_called()

@patch("assignment_api.storage")
@patch("assignment_api.redis_cache")
def test_withdraw_success(mock_redis, mock_storage, auth_override):
    response = client.post("/auth/withdraw")
    assert response.status_code == 200
    mock_storage.delete_user_entirely.assert_called_with("20240001")

@patch("assignment_api.storage.get_all_student_ids")
@patch("assignment_api.scheduler_module.schedule_notifications_for_user")
def test_restore_all_notifications_success(mock_sched, mock_get_ids):
    mock_get_ids.return_value = ["u1", "u2"]
    with patch("time.sleep"):
        restore_all_notifications()
    assert mock_sched.call_count == 2

# ─── 3. [추가] 커스텀 과제 및 설정 (성공 경로 상세) ──────────────────────────

@patch("assignment_api.storage")
@patch("assignment_api.scheduler_module.schedule_notifications_for_user")
def test_custom_assignment_full_crud(mock_sched, mock_storage, auth_override):
    payload = {"subject": "S", "task": "T", "deadline": "D"}
    # 수정
    assert client.put("/api/custom-assignments/123", json=payload).status_code == 200
    # 삭제
    assert client.delete("/api/custom-assignments/123").status_code == 200
    assert mock_sched.call_count == 2

@patch("assignment_api.storage")
def test_save_user_settings_success(mock_storage, auth_override):
    payload = {"email": "new@a.com", "settings": {"a": 1}}
    assert client.post("/api/user-settings", json=payload).status_code == 200
    mock_storage.update_user_email.assert_called_with("20240001", "new@a.com")

# ─── 4. [기존/복구] 전방위 Exception Coverage (Try-Except 공략) ───────────

@pytest.mark.parametrize("endpoint, method, patch_target", [
    ("/auth/withdraw", "post", "assignment_api.storage.delete_user_entirely"),
    ("/api/me", "get", "assignment_api.get_user_profile"),
    ("/api/assignments", "get", "assignment_api.crawl_all_assignments"),
    ("/api/courses", "get", "lms_crawler.get_enrolled_courses"),
    ("/api/custom-assignments", "get", "assignment_api.storage.get_custom_assignments"),
    ("/api/user-settings", "get", "assignment_api.storage.get_user_settings"),
    ("/api/notification-history", "get", "assignment_api.storage.get_notification_history"),
    ("/api/notices", "get", "assignment_api.crawl_all_notices"),
    ("/api/messages", "get", "assignment_api.crawl_all_messages"),
    ("/api/test-notification", "post", "notification_service.send_all_notifications"),
])
def test_api_exception_handling(endpoint, method, patch_target, auth_override):
    """모든 API의 except 블록 커버리지 복구."""
    with patch("assignment_api.storage.load_user", return_value=("20240001", "pw")):
        with patch(patch_target, side_effect=Exception("Crash")):
            with patch("assignment_api.resolve_lms_session", return_value=MagicMock()):
                with patch("assignment_api.login_to_lms", return_value=(MagicMock(), "ok")):
                    if method == "get": resp = client.get(endpoint)
                    else: resp = client.post(endpoint, json={})
                    assert resp.status_code == 500

# ─── 5. [기존/복구] 상세 상황 및 보안 예외 ─────────────────────────────────

@patch("assignment_api.resolve_lms_session")
@patch("assignment_api.get_notice_detail")
def test_notice_detail_errors(mock_detail, mock_resolve, auth_override):
    mock_detail.side_effect = ValueError()
    assert client.get("/api/notices/1/1").status_code == 404
    mock_detail.side_effect = SessionExpiredError()
    assert client.get("/api/notices/1/1").status_code == 401

@patch("assignment_api.resolve_lms_session")
@patch("lms_crawler.get_assignment_detail")
def test_assignment_detail_errors(mock_detail, mock_resolve, auth_override):
    mock_detail.side_effect = ValueError()
    assert client.get("/api/assignments/1").status_code == 404

def test_validation_handler_custom_logic():
    resp = client.post("/auth/login", json={"student_id": "A"*25, "password": "P"})
    assert resp.status_code == 400

@patch("assignment_api.resolve_lms_session")
def test_proxy_download_security_logic(mock_resolve, auth_override):
    assert client.get("/api/download?url=ftp://bad.com").status_code == 400
    assert client.get("/api/download?url=https://evil.com/pluginfile.php").status_code == 403

@patch("assignment_api.redis_cache")
@patch("assignment_api.storage")
@patch("assignment_api.login_to_lms")
def test_resolve_lms_session_exception_flow(mock_login, mock_storage, mock_redis):
    from assignment_api import resolve_lms_session
    mock_redis.get_lms_session.return_value = {"old": "c"}
    mock_storage.load_user.return_value = ("u", "p")
    mock_login.return_value = (None, "fail")
    with patch("assignment_api._is_lms_session_valid", return_value=False):
        with pytest.raises(Exception):
            resolve_lms_session("u1")
