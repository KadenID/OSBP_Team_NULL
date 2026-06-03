import pytest
import json
import importlib
from unittest.mock import patch, MagicMock
import redis_cache

@pytest.fixture
def mock_redis_client():
    """redis_cache의 redis_client를 모킹한다."""
    with patch("redis_cache.redis_client") as mock_client:
        yield mock_client

def test_set_lms_session(mock_redis_client):
    """LMS 세션이 Redis에 올바르게 저장되는지 테스트한다."""
    student_id = "20240001"
    cookies = {"MoodleSession": "mock_cookie_val"}
    
    redis_cache.set_lms_session(student_id, cookies)
    
    mock_redis_client.set.assert_called_once_with(
        f"lms_session:{student_id}",
        json.dumps(cookies),
        ex=1500
    )

def test_get_lms_session_success(mock_redis_client):
    """Redis에서 세션 정보를 성공적으로 가져오는지 테스트한다."""
    student_id = "20240001"
    mock_data = json.dumps({"MoodleSession": "stored_val"})
    mock_redis_client.get.return_value = mock_data
    
    result = redis_cache.get_lms_session(student_id)
    
    assert result == {"MoodleSession": "stored_val"}
    mock_redis_client.get.assert_called_once_with(f"lms_session:{student_id}")

def test_get_lms_session_none(mock_redis_client):
    """데이터가 없을 때 None을 반환하는지 테스트한다."""
    mock_redis_client.get.return_value = None
    assert redis_cache.get_lms_session("unknown") is None

def test_delete_lms_session(mock_redis_client):
    """세션 삭제 기능이 호출되는지 테스트한다."""
    redis_cache.delete_lms_session("20240001")
    mock_redis_client.delete.assert_called_once_with("lms_session:20240001")

def test_set_cached_courses(mock_redis_client):
    """과목 목록 캐싱 기능을 테스트한다."""
    student_id = "20240001"
    courses = {"c1": "Math", "c2": "CS"}
    
    redis_cache.set_cached_courses(student_id, courses)
    mock_redis_client.set.assert_called_with(
        f"user_courses:{student_id}",
        json.dumps(courses),
        ex=86400
    )

def test_get_cached_courses(mock_redis_client):
    """캐싱된 과목 목록 조회 기능을 테스트한다."""
    mock_redis_client.get.return_value = json.dumps({"math": "A"})
    assert redis_cache.get_cached_courses("20240001") == {"math": "A"}

def test_delete_user_data(mock_redis_client):
    """사용자와 관련된 모든 데이터를 삭제하는지 테스트한다."""
    student_id = "20240001"
    redis_cache.delete_user_data(student_id)
    
    assert mock_redis_client.delete.call_count >= 3
    calls = [
        f"lms_session:{student_id}",
        f"user_courses:{student_id}",
        f"login_attempts:{student_id}"
    ]
    for key in calls:
        mock_redis_client.delete.assert_any_call(key)

def test_check_login_rate_limit_pass(mock_redis_client):
    """로그인 시도 제한이 통과되는 경우를 테스트한다."""
    mock_redis_client.incr.return_value = 1
    
    result = redis_cache.check_login_rate_limit("20240001", max_attempts=5)
    
    assert result is True
    mock_redis_client.incr.assert_called_once_with("login_attempts:20240001")
    # 첫 시도 시 만료 시간 설정 확인
    mock_redis_client.expire.assert_called_once()

def test_check_login_rate_limit_fail(mock_redis_client):
    """로그인 시도 제한이 걸리는 경우를 테스트한다."""
    mock_redis_client.incr.return_value = 6 # max 5 초과
    
    result = redis_cache.check_login_rate_limit("20240001", max_attempts=5)
    assert result is False

def test_reset_login_attempts(mock_redis_client):
    """로그인 시도 횟수 초기화를 테스트한다."""
    redis_cache.reset_login_attempts("20240001")
    mock_redis_client.delete.assert_called_once_with("login_attempts:20240001")

def test_check_ip_rate_limit(mock_redis_client):
    """IP 기반 시도 제한을 테스트한다."""
    mock_redis_client.incr.return_value = 21
    assert redis_cache.check_ip_rate_limit("127.0.0.1", max_attempts=20) is False

def test_acquire_scheduler_lock_success(mock_redis_client):
    """스케줄러 락 획득 성공을 테스트한다."""
    mock_redis_client.set.return_value = True
    
    result = redis_cache.acquire_scheduler_lock("worker-1")
    
    assert result is True
    mock_redis_client.set.assert_called_once_with(
        "scheduler_lock", "worker-1", ex=120, nx=True
    )

def test_acquire_scheduler_lock_fail(mock_redis_client):
    """스케줄러 락 획득 실패를 테스트한다."""
    mock_redis_client.set.return_value = False
    assert redis_cache.acquire_scheduler_lock("worker-2") is False

def test_release_scheduler_lock(mock_redis_client):
    """스케줄러 락 해제를 테스트한다."""
    redis_cache.release_scheduler_lock()
    mock_redis_client.delete.assert_called_once_with("scheduler_lock")

# ─── 특수 상황 테스트 ──────────────────────────────────────────────────

def test_redis_disabled_handling():
    """Redis 클라이언트가 None일 때 함수들이 에러 없이 동작하는지 테스트한다."""
    with patch("redis_cache.redis_client", None):
        # 반환값이 있는 함수들
        assert redis_cache.get_lms_session("any") is None
        assert redis_cache.get_cached_courses("any") is None
        assert redis_cache.check_login_rate_limit("any") is True # 락 걸리지 않음
        assert redis_cache.check_ip_rate_limit("any") is True
        assert redis_cache.acquire_scheduler_lock("any") is True # 단일 워커 가정
        
        # 반환값 없는 함수들 (예외가 발생하지 않아야 함)
        redis_cache.set_lms_session("any", {})
        redis_cache.set_cached_courses("any", {})
        redis_cache.delete_lms_session("any")
        redis_cache.delete_user_data("any")
        redis_cache.reset_login_attempts("any")
        redis_cache.release_scheduler_lock()

def test_redis_exception_handling(mock_redis_client):
    """Redis 작업 중 예외 발생 시 에러를 포착하고 안전하게 처리하는지 테스트한다."""
    mock_redis_client.get.side_effect = Exception("Redis Down")
    mock_redis_client.set.side_effect = Exception("Redis Down")
    
    # 예외가 상위로 전파되지 않고 None이나 기본값을 반환해야 함
    assert redis_cache.get_lms_session("any") is None
    redis_cache.set_lms_session("any", {}) # 에러 없이 통과
    assert redis_cache.check_login_rate_limit("any") is True # 에러 시 통과 허용

def test_redis_init_no_env(monkeypatch):
    """환경 변수가 없을 때 클라이언트가 None으로 설정되는지 테스트한다."""
    monkeypatch.delenv("UPSTASH_REDIS_REST_URL", raising=False)
    monkeypatch.delenv("UPSTASH_REDIS_REST_TOKEN", raising=False)
    
    importlib.reload(redis_cache)
    assert redis_cache.redis_client is None

def test_redis_init_success(monkeypatch):
    """환경 변수가 있을 때 클라이언트가 정상적으로 생성되는지 테스트한다."""
    monkeypatch.setenv("UPSTASH_REDIS_REST_URL", "http://test")
    monkeypatch.setenv("UPSTASH_REDIS_REST_TOKEN", "token")
    
    # 모듈이 import할 upstash_redis.Redis 자체를 패치
    with patch("upstash_redis.Redis") as mock_redis_class:
        importlib.reload(redis_cache)
        assert redis_cache.redis_client is not None
        mock_redis_class.assert_called()

def test_all_methods_exception_coverage(mock_redis_client):
    """모든 메서드의 except 블록을 실행하여 커버리지를 높인다."""
    mock_redis_client.set.side_effect = Exception("fail")
    mock_redis_client.get.side_effect = Exception("fail")
    mock_redis_client.delete.side_effect = Exception("fail")
    mock_redis_client.incr.side_effect = Exception("fail")
    mock_redis_client.expire.side_effect = Exception("fail")

    # 각 함수를 호출하여 except 블록 진입 유도
    redis_cache.set_lms_session("id", {})
    redis_cache.set_cached_courses("id", {})
    redis_cache.get_cached_courses("id")
    redis_cache.get_lms_session("id")
    redis_cache.delete_lms_session("id")
    redis_cache.delete_user_data("id")
    redis_cache.check_login_rate_limit("id")
    redis_cache.reset_login_attempts("id")
    redis_cache.check_ip_rate_limit("ip")
    redis_cache.acquire_scheduler_lock("worker")
    redis_cache.release_scheduler_lock()

def test_secrets_env_path_check_redis():
    """/etc/secrets/.env 경로 체크 분기를 테스트한다."""
    with patch("os.path.exists") as mock_exists:
        mock_exists.side_effect = lambda path: True if path == "/etc/secrets/.env" else False
        with patch("dotenv.load_dotenv") as mock_load:
            importlib.reload(redis_cache)
            mock_load.assert_any_call("/etc/secrets/.env")
@pytest.fixture(scope="module", autouse=True)
def restore_redis_module():
    yield
    importlib.reload(redis_cache)
