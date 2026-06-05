import pytest
import jwt
import time
import importlib
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

# auth 모듈을 임포트하기 전, JWT_SECRET_KEY가 conftest에 의해 세팅되어 있습니다.
import auth

def test_create_access_token():
    """액세스 토큰 생성이 올바르게 이루어지는지 테스트한다."""
    data = {"sub": "user1"}
    token = auth.create_access_token(data)
    
    assert isinstance(token, str)
    
    # 생성된 토큰 디코딩
    payload = auth.decode_token(token)
    assert payload is not None
    assert payload["sub"] == "user1"
    assert payload["type"] == "access"
    assert "exp" in payload
    assert "iat" in payload

def test_create_refresh_token():
    """리프레시 토큰 생성이 올바르게 이루어지는지 테스트한다."""
    data = {"sub": "user2"}
    token = auth.create_refresh_token(data)
    
    assert isinstance(token, str)
    
    payload = auth.decode_token(token)
    assert payload is not None
    assert payload["sub"] == "user2"
    assert payload["type"] == "refresh"

def test_verify_token_type():
    """토큰 타입 검증 함수가 올바르게 작동하는지 테스트한다."""
    access_payload = {"type": "access"}
    refresh_payload = {"type": "refresh"}
    
    assert auth.verify_token_type(access_payload, "access") is True
    assert auth.verify_token_type(access_payload, "refresh") is False
    assert auth.verify_token_type(refresh_payload, "refresh") is True
    assert auth.verify_token_type({}, "access") is False

def test_decode_token_expired():
    """만료된 토큰을 디코딩할 때 None을 반환하는지 테스트한다."""
    # 만료 시간이 과거인 토큰을 강제로 생성
    expired_payload = {
        "sub": "user1",
        "exp": datetime.now(timezone.utc) - timedelta(minutes=1)
    }
    expired_token = jwt.encode(expired_payload, auth.SECRET_KEY, algorithm=auth.ALGORITHM)
    
    # verify_exp=True 인 경우 (기본값)
    assert auth.decode_token(expired_token) is None
    
    # verify_exp=False 인 경우 강제로 디코딩 가능해야 함
    payload = auth.decode_token(expired_token, verify_exp=False)
    assert payload is not None
    assert payload["sub"] == "user1"

def test_decode_token_invalid():
    """올바르지 않은 구조의 토큰 디코딩 시 None을 반환하는지 테스트한다."""
    assert auth.decode_token("invalid.token.string") is None
    assert auth.decode_token(None) is None
    assert auth.decode_token("") is None

def test_decode_token_general_exception():
    """예상치 못한 예외 발생 시 None을 반환하는지 테스트한다."""
    # jwt.decode 자체를 모킹하여 임의의 Exception을 발생시킴
    with patch("jwt.decode", side_effect=Exception("Unexpected Error")):
        # 토큰 문자열 형식이어야 jwt.decode에서 에러를 던질 수 있음
        assert auth.decode_token("a.b.c") is None

# ─── 모듈 로드 및 환경 변수 테스트 ───────────────────────────────────────

def test_missing_secret_key_raises_error(monkeypatch):
    """JWT_SECRET_KEY 환경 변수가 없을 때 ValueError가 발생하는지 테스트한다."""
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
    with pytest.raises(ValueError) as excinfo:
        importlib.reload(auth)
    assert "JWT_SECRET_KEY가 .env 파일에 설정되지 않았습니다" in str(excinfo.value)

def test_secrets_env_path_check_auth():
    """/etc/secrets/.env 경로 체크 분기를 테스트한다."""
    with patch("os.path.exists") as mock_exists:
        mock_exists.side_effect = lambda path: True if path == "/etc/secrets/.env" else False
        with patch("dotenv.load_dotenv") as mock_load:
            importlib.reload(auth)
            mock_load.assert_any_call("/etc/secrets/.env")

# 마지막에 모듈 정상 복구
@pytest.fixture(scope="module", autouse=True)
def restore_auth_module():
    yield
    importlib.reload(auth)
