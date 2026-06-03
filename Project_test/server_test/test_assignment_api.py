import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from assignment_api import app, get_current_user
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

# ─── 1. 인증 및 세션 관리 테스트 ────────────────────────────────────────

def test_health_check():
    assert client.get("/health").status_code == 200

@patch("assignment_api.redis_cache")
@patch("assignment_api.login_to_lms")
@patch("assignment_api.storage")
def test_login_flow(mock_storage, mock_login, mock_redis):
    # 시도 제한 통과 설정
    mock_redis.check_ip_rate_limit.return_value = True
    mock_redis.check_login_rate_limit.return_value = True
    # 로그인 성공 설정
    mock_sess = MagicMock()
    mock_sess.cookies.get_dict.return_value = {"MoodleSession": "mock"}
    mock_login.return_value = (mock_sess, "성공")
    
    response = client.post("/auth/login", json={"student_id": "20240001", "password": "pw"})
    assert response.status_code == 200
    assert "access_token" in response.json()

@patch("assignment_api.auth.decode_token")
@patch("assignment_api.storage.get_refresh_token")
def test_refresh_token_logic(mock_get_rt, mock_decode):
    # 1. 성공 케이스
    mock_decode.return_value = {"sub": "20240001", "type": "refresh", "exp": 9999999999}
    mock_get_rt.return_value = ("valid_rt", None)
    client.cookies.set("refresh_token", "valid_rt")
    assert client.post("/auth/refresh").status_code == 200
    
    # 2. 불일치 케이스
    mock_get_rt.return_value = ("other_rt", None)
    assert client.post("/auth/refresh").status_code == 401

# ─── 2. LMS 크롤링 API 및 예외 처리 ──────────────────────────────────────

@patch("assignment_api.resolve_lms_session")
@patch("assignment_api.get_user_profile")
def test_get_me_api(mock_profile, mock_resolve, auth_override):
    mock_profile.return_value = {"name": "김철수", "student_id": "20240001", "department": "컴공"}
    assert client.get("/api/me").status_code == 200

@patch("assignment_api.resolve_lms_session")
@patch("assignment_api.crawl_all_assignments")
@patch("assignment_api.scheduler_module.schedule_notifications_for_user")
def test_get_assignments_api(mock_sched, mock_crawl, mock_resolve, auth_override):
    mock_crawl.return_value = [{
        "course_id": "1", "course_name": "A", "assignment_id": "1", 
        "assignment_name": "T", "due_date": "2026", "status": "S", "url": "U"
    }]
    assert client.get("/api/assignments").status_code == 200

@patch("assignment_api.resolve_lms_session")
@patch("lms_crawler.get_assignment_detail") # 내부 import 대응
def test_assignment_detail_api_variants(mock_detail, mock_resolve, auth_override):
    # 1. 성공
    mock_detail.return_value = {"title": "T", "description": "D"}
    assert client.get("/api/assignments/123").status_code == 200
    # 2. 404
    mock_detail.side_effect = ValueError("Not Found")
    assert client.get("/api/assignments/999").status_code == 404

@patch("assignment_api.resolve_lms_session")
@patch("assignment_api.crawl_all_notices")
def test_get_notices_api(mock_crawl, mock_resolve, auth_override):
    mock_crawl.return_value = [{
        "course_id": "1", "course_name": "A", "board_id": "1", "notice_id": "1",
        "title": "T", "writer": "W", "date": "2026", "description": "D", "url": "U"
    }]
    assert client.get("/api/notices").status_code == 200

# ─── 3. 커스텀 데이터 및 병합 로직 ───────────────────────────────────────

@patch("lms_crawler.get_enrolled_courses") # 내부 import 대응
@patch("assignment_api.storage")
@patch("assignment_api.redis_cache")
def test_get_courses_merge_final(mock_redis, mock_storage, mock_get_lms, auth_override):
    mock_storage.load_user.return_value = ("1", "p")
    mock_redis.get_lms_session.return_value = None
    mock_get_lms.return_value = {"101": {"name": "LMS", "type": "regular"}}
    mock_storage.get_custom_assignments.return_value = [{"subject": "Custom"}]
    
    response = client.get("/api/courses")
    assert response.status_code == 200
    assert len(response.json()["data"]) >= 2

# ─── 4. 설정 및 보안 테스트 ───────────────────────────────────────────

@patch("assignment_api.storage")
def test_user_settings_api_flow(mock_storage, auth_override):
    # 저장 성공
    assert client.post("/api/user-settings", json={"email": "a@a.com", "settings": {}}).status_code == 200
    # 조회 성공
    mock_storage.get_user_settings.return_value = {"a": 1}
    mock_storage.get_user_email.return_value = "a@a.com"
    assert client.get("/api/user-settings").status_code == 200

def test_proxy_download_security_final(auth_override):
    # SSRF 차단
    assert client.get("/api/download?url=https://naver.com/pluginfile.php").status_code == 403
    # 스킴 차단
    assert client.get("/api/download?url=ftp://lms.chungbuk.ac.kr/f").status_code == 400

# ─── 5. 예외 핸들러 및 내부 로직 ───────────────────────────────────────

def test_validation_handler_v2_support():
    # 수정된 핸들러가 Pydantic v2의 길이 초과 에러를 400으로 잡는지 확인
    response = client.post("/auth/login", json={"student_id": "A"*25, "password": "P"})
    assert response.status_code == 400
    assert "아이디는 최대 20자" in response.json()["message"]

@patch("assignment_api.redis_cache")
@patch("assignment_api.storage")
@patch("assignment_api.login_to_lms")
def test_resolve_lms_session_relogin_flow(mock_login, mock_storage, mock_redis):
    from assignment_api import resolve_lms_session
    from fastapi import HTTPException
    
    # 캐시 만료 상황
    mock_redis.get_lms_session.return_value = {"old": "c"}
    mock_storage.load_user.return_value = ("u", "p")
    mock_login.return_value = (None, "fail") # 재로그인 실패
    
    with patch("assignment_api._is_lms_session_valid", return_value=False):
        with pytest.raises(HTTPException) as exc:
            resolve_lms_session("user1")
        assert exc.value.status_code == 401
