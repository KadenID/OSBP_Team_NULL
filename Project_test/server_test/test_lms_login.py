import pytest
from unittest.mock import patch, MagicMock
from lms_login import login_to_lms
import os
import requests

# 목 데이터 경로 설정
MOCK_DATA_DIR = os.path.join(os.path.dirname(__file__), "../mock_data")

def read_mock_file(filename):
    with open(os.path.join(MOCK_DATA_DIR, filename), "r", encoding="utf-8") as f:
        return f.read()

def test_lms_login_success(mock_session):
    """로그인 성공 시나리오 테스트 (Mock)"""
    # GET 요청에 대한 응답 (로그인 페이지 HTML)
    mock_get_resp = MagicMock()
    mock_get_resp.status_code = 200
    mock_get_resp.text = read_mock_file("login_page.html")
    mock_session.get.return_value = mock_get_resp
    
    # POST 요청에 대한 응답 (로그인 성공 시 리다이렉트)
    mock_post_resp = MagicMock()
    mock_post_resp.url = "https://lms.chungbuk.ac.kr/my/" # login 단어가 없는 URL
    mock_session.post.return_value = mock_post_resp
    
    # 함수 실행
    session, message = login_to_lms("test_user", "test_pw")
    
    # 검증
    assert session is not None
    assert "성공" in message

def test_lms_login_fail(mock_session):
    """로그인 실패 시나리오 테스트 (Mock)"""
    # 로그인 페이지 로드 성공
    mock_get_resp = MagicMock()
    mock_get_resp.text = read_mock_file("login_page.html")
    mock_session.get.return_value = mock_get_resp
    
    # POST 요청 결과가 다시 로그인 페이지로 돌아옴 (실패 상황)
    mock_post_resp = MagicMock()
    mock_post_resp.url = "https://lms.chungbuk.ac.kr/login/index.php"
    mock_session.post.return_value = mock_post_resp
    
    session, message = login_to_lms("wrong_user", "wrong_pw")
    
    assert session is None
    assert "실패" in message

def test_lms_login_admin(mock_session):
    """admin / testpw 계정 전용 로그인 테스트 (Mock)"""
    # 로그인 페이지 로드 (가짜 토큰 반환)
    mock_get_resp = MagicMock()
    mock_get_resp.text = read_mock_file("login_page.html")
    mock_session.get.return_value = mock_get_resp
    
    # POST 요청에 대한 응답 설정
    def mock_post_side_effect(url, data, timeout=None):
        resp = MagicMock()
        # 입력된 값이 admin / testpw인 경우에만 성공 URL 반환
        if data.get("username") == "admin" and data.get("password") == "testpw":
            resp.url = "https://lms.chungbuk.ac.kr/my/"
        else:
            resp.url = "https://lms.chungbuk.ac.kr/login/index.php"
        return resp

    mock_session.post.side_effect = mock_post_side_effect
    
    # 성공 케이스
    session, message = login_to_lms("admin", "testpw")
    assert session is not None
    assert "성공" in message
    
    # 실패 케이스 (비밀번호 틀림)
    session_fail, message_fail = login_to_lms("admin", "wrong_pw")
    assert session_fail is None
    assert "실패" in message_fail

# ─── [추가] 로그인 예외 처리 및 엣지 케이스 (Try-Except Coverage) ───

def test_lms_login_network_error_get(mock_session):
    """GET 요청(1차) 중 네트워크 오류가 발생했을 때의 예외 처리 확인."""
    # 네트워크 연결 실패 시뮬레이션
    mock_session.get.side_effect = requests.RequestException("Connection Refused")
    
    session, message = login_to_lms("user1", "pw1")
    
    assert session is None
    assert "오류 발생" in message

def test_lms_login_network_error_post(mock_session):
    """POST 요청(2차) 중 네트워크 오류가 발생했을 때의 예외 처리 및 세션 종료 확인."""
    # 1차 GET 성공
    mock_get_resp = MagicMock(status_code=200, text=read_mock_file("login_page.html"))
    mock_session.get.return_value = mock_get_resp
    
    # 2차 POST 실패
    mock_session.post.side_effect = requests.Timeout("Timeout")
    
    session, message = login_to_lms("user1", "pw1")
    
    assert session is None
    assert "초과" in message

def test_lms_login_missing_token(mock_session):
    """HTML 폼 안에 'logintoken'이 존재하지 않을 때의 방어 로직 확인."""
    # 토큰이 없는 비정상적인 HTML 응답
    mock_get_resp = MagicMock(status_code=200, text="<html><body>No Token Here</body></html>")
    mock_session.get.return_value = mock_get_resp
    
    session, message = login_to_lms("user1", "pw1")
    
    assert session is None
    assert "토큰" in message or "실패" in message

def test_lms_login_general_exception(mock_session):
    """알 수 없는 예외가 발생했을 때 안전하게 처리되는지 확인."""
    # BeautifulSoup 등 내부 로직에서 발생할 수 있는 일반 에러 시뮬레이션
    mock_session.get.side_effect = Exception("Unknown Fatal Error")
    
    session, message = login_to_lms("user1", "pw1")
    
    assert session is None
    assert "알 수 없는 오류" in message

# 마지막에 모듈 정상 복구
@pytest.fixture(scope="module", autouse=True)
def restore_api():
    yield
    import importlib
    import lms_login
    importlib.reload(lms_login)
