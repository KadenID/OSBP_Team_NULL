import pytest
import json
import importlib
from datetime import datetime
from unittest.mock import patch, MagicMock
import storage

@pytest.fixture
def mock_db():
    """psycopg2 커넥션 풀과 커서를 모킹한다."""
    with patch("storage.connection_pool") as mock_pool:
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        
        mock_pool.getconn.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        
        yield {
            "pool": mock_pool,
            "conn": mock_conn,
            "cur": mock_cur
        }

def test_init_db(mock_db):
    """DB 초기화 시 테이블 생성 SQL이 실행되는지 테스트한다."""
    storage.init_db()
    assert mock_db["cur"].execute.call_count >= 5
    mock_db["conn"].commit.assert_called()

def test_save_user(mock_db):
    """사용자 정보 저장 및 암호화 연동을 테스트한다."""
    with patch("storage.encrypt", return_value="enc_pw"):
        storage.save_user("user1", "plain_pw")
        mock_db["cur"].execute.assert_called()
        mock_db["conn"].commit.assert_called_once()

def test_load_user_success(mock_db):
    """사용자 정보 로드 및 복호화 연동을 테스트한다."""
    mock_db["cur"].fetchone.return_value = ("enc_pw",)
    with patch("storage.decrypt", return_value="plain_pw"):
        sid, pw = storage.load_user("user1")
        assert sid == "user1"
        assert pw == "plain_pw"

def test_refresh_token_ops(mock_db):
    """리프레시 토큰 저장, 조회, 삭제 기능을 테스트한다."""
    # 1. 저장
    expires = datetime.now()
    storage.save_refresh_token("user1", "token_val", expires)
    assert "INSERT INTO refresh_tokens" in mock_db["cur"].execute.call_args[0][0]
    
    # 2. 조회
    mock_db["cur"].fetchone.return_value = ("token_val", expires)
    result = storage.get_refresh_token("user1")
    assert result == ("token_val", expires)
    
    # 3. 삭제
    storage.delete_refresh_token("user1")
    assert "DELETE FROM refresh_tokens" in mock_db["cur"].execute.call_args[0][0]

def test_push_subscription_ops(mock_db):
    """푸시 구독 정보 저장, 조회, 삭제 기능을 테스트한다."""
    sub_json = {"endpoint": "url", "keys": {}}
    
    # 1. 저장
    storage.save_push_subscription("user1", sub_json, "Chrome")
    assert "INSERT INTO push_subscriptions" in mock_db["cur"].execute.call_args[0][0]
    
    # 2. 조회
    mock_db["cur"].fetchall.return_value = [(sub_json,)]
    result = storage.get_push_subscriptions("user1")
    assert result == [sub_json]
    
    # 3. 삭제
    storage.delete_push_subscription("user1", sub_json)
    assert "DELETE FROM push_subscriptions" in mock_db["cur"].execute.call_args[0][0]

def test_user_settings_ops(mock_db):
    """사용자 설정 저장 및 조회를 테스트한다."""
    settings = {"emailAlerts": True}
    
    # 저장
    storage.save_user_settings("user1", settings)
    assert json.dumps(settings) in mock_db["cur"].execute.call_args[0][1]
    
    # 조회 (데이터 존재 시)
    mock_db["cur"].fetchone.return_value = (settings,)
    assert storage.get_user_settings("user1") == settings
    
    # 조회 (데이터 없을 시 기본값)
    mock_db["cur"].fetchone.return_value = None
    default_settings = storage.get_user_settings("new_user")
    assert default_settings["emailAlerts"] is False

def test_custom_assignment_ops(mock_db):
    """커스텀 과제 CRUD를 테스트한다."""
    data = {"subject": "Math", "task": "HW", "deadline": "2026", "isSubmitted": False}
    
    # 1. 생성 (Insert)
    mock_db["cur"].fetchone.return_value = (10,)
    assert storage.save_custom_assignment("user1", data) == 10
    
    # 2. 수정 (Update)
    data_with_id = data.copy()
    data_with_id["id"] = "10"
    storage.save_custom_assignment("user1", data_with_id)
    assert "UPDATE custom_assignments" in mock_db["cur"].execute.call_args[0][0]
    
    # 3. 조회
    mock_db["cur"].fetchall.return_value = [(10, "Math", "HW", "2026", False, "desc")]
    results = storage.get_custom_assignments("user1")
    assert len(results) == 1
    assert results[0]["id"] == "10"
    
    # 4. 삭제
    storage.delete_custom_assignment("user1", "10")
    assert "DELETE FROM custom_assignments" in mock_db["cur"].execute.call_args[0][0]

def test_user_courses_ops(mock_db):
    """수강 과목 정보 저장 및 조회를 테스트한다."""
    courses = {"c1": {"name": "Math", "type": "regular"}}
    
    # 저장
    storage.save_user_courses("user1", courses)
    assert mock_db["cur"].execute.call_count >= 2 # Insert + Delete NOT IN
    
    # 조회
    mock_db["cur"].fetchall.return_value = [("c1", "Math", "regular")]
    result = storage.get_user_courses("user1")
    assert result["c1"]["name"] == "Math"

def test_notification_history_ops(mock_db):
    """알림 내역 추가, 조회, 개별 삭제를 테스트한다."""
    # 1. 추가
    storage.add_notification_history("user1", "Title", "Msg", "Email")
    assert "INSERT INTO notification_history" in mock_db["cur"].execute.call_args[0][0]
    
    # 2. 조회
    mock_sent_at = datetime.now()
    mock_db["cur"].fetchall.return_value = [(1, "Title", "Msg", "Email", mock_sent_at, "a1", "url")]
    history = storage.get_notification_history("user1")
    assert history[0]["title"] == "Title"
    assert "sent_at" in history[0]
    
    # 3. 삭제
    mock_db["cur"].rowcount = 1
    assert storage.delete_specific_notification_history("user1", 1) is True

def test_notification_sent_record(mock_db):
    """알림 발송 기록 확인 및 저장을 테스트한다."""
    # 확인
    mock_db["cur"].fetchone.return_value = (1,)
    assert storage.is_notification_sent("u1", "a1", "type") is True
    
    # 기록
    storage.record_notification_sent("u1", "a1", "type")
    assert "INSERT INTO sent_notifications" in mock_db["cur"].execute.call_args[0][0]

def test_cleanup_old_notifications(mock_db):
    """오래된 알림 데이터 정리를 테스트한다."""
    mock_db["cur"].rowcount = 5
    result = storage.cleanup_old_notifications(30)
    assert result == 10 # rowcount가 두 번 더해짐 (sent_notifications + notification_history)
    assert "DELETE FROM sent_notifications" in mock_db["cur"].execute.call_args_list[0][0][0]

def test_user_email_ops(mock_db):
    """이메일 업데이트 및 조회를 테스트한다."""
    storage.update_user_email("user1", "test@test.com")
    assert "UPDATE users SET email" in mock_db["cur"].execute.call_args[0][0]
    
    mock_db["cur"].fetchone.return_value = ("test@test.com",)
    assert storage.get_user_email("user1") == "test@test.com"

def test_get_all_student_ids(mock_db):
    """전체 학생 ID 조회를 테스트한다."""
    mock_db["cur"].fetchall.return_value = [("user1",), ("user2",)]
    assert storage.get_all_student_ids() == ["user1", "user2"]

def test_delete_user_entirely(mock_db):
    """사용자 전체 삭제 기능을 테스트한다."""
    storage.delete_user_entirely("user1")
    assert "DELETE FROM users" in mock_db["cur"].execute.call_args[0][0]

# ─── 예외 및 특수 상황 ──────────────────────────────────────────────────

def test_db_errors_trigger_rollback(mock_db):
    """쿼리 실패 시 롤백이 호출되는지 확인한다."""
    mock_db["cur"].execute.side_effect = Exception("SQL Error")
    
    with pytest.raises(Exception):
        storage.save_user("u1", "p1")
    mock_db["conn"].rollback.assert_called()

def test_all_db_methods_exception_coverage(mock_db):
    """모든 주요 DB 메서드의 except 블록을 실행하여 커버리지를 높인다."""
    mock_db["cur"].execute.side_effect = Exception("Forced DB Error")
    mock_db["cur"].fetchone.side_effect = Exception("Forced DB Error")
    mock_db["cur"].fetchall.side_effect = Exception("Forced DB Error")
    
    # 예외를 상위로 던지는 함수들
    funcs_raising = [
        (storage.init_db, ()),
        (storage.record_notification_sent, ("u", "a", "t")),
        (storage.update_user_email, ("u", "e")),
        (storage.get_user_email, ("u",)),
        (storage.save_push_subscription, ("u", {}, "b")),
        (storage.get_push_subscriptions, ("u",)),
        (storage.delete_push_subscription, ("u", {})),
        (storage.save_user_settings, ("u", {})),
        (storage.save_user, ("u", "p")),
        (storage.load_user, ("u",)),
        (storage.save_refresh_token, ("u", "t", datetime.now())),
        (storage.get_refresh_token, ("u",)),
        (storage.delete_refresh_token, ("u",)),
        (storage.save_custom_assignment, ("u", {"subject": "A", "task": "B", "deadline": "C"})),
        (storage.get_custom_assignments, ("u",)),
        (storage.delete_custom_assignment, ("u", "1")),
    ]
    
    for func, args in funcs_raising:
        with pytest.raises(Exception):
            func(*args)
            
    # 예외를 삼키고 기본값을 반환하는 함수들
    assert storage.is_notification_sent("u", "a", "t") is False
    assert storage.cleanup_old_notifications() == 0
    assert storage.get_all_student_ids() == []
    assert storage.get_user_settings("u") == {"emailAlerts": False, "browserAlerts": False, "courseReminders": []}
    
    # 예외를 삼키는 void 함수들 (에러 발생하지 않아야 함)
    storage.save_user_courses("u", {})
    assert storage.get_user_courses("u") == {}
    storage.add_notification_history("u", "t", "m", "c")
    assert storage.get_notification_history("u") == []
    assert storage.delete_specific_notification_history("u", 1) is False
    assert storage.delete_user_entirely("u") is False

def test_get_db_connection_put_conn(mock_db):
    """DB 연결 사용 후 풀에 반환되는지 확인한다."""
    with storage.get_db_connection() as conn:
        assert conn == mock_db["conn"]
    mock_db["pool"].putconn.assert_called_with(mock_db["conn"])

def test_storage_init_missing_url(monkeypatch):
    """DATABASE_URL 부재 시 에러 발생을 테스트한다."""
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(ValueError):
        importlib.reload(storage)

# 마지막에 모듈 복구
@pytest.fixture(scope="module", autouse=True)
def restore_storage_module():
    yield
    importlib.reload(storage)
