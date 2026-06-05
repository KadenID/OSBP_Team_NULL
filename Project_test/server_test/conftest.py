import os
import sys
from unittest.mock import MagicMock
import pytest

# 테스트에 필요한 최소한의 가짜 환경 변수 설정
# (실제 .env 파일을 읽지 않고, 코드 실행에 필요한 변수들만 정의합니다.)
os.environ["AES_SECRET_KEY"] = "this_is_a_32_byte_secret_key_123"
os.environ["JWT_SECRET_KEY"] = "test_jwt_secret"
os.environ["DATABASE_URL"] = "postgresql://user:password@localhost:5432/testdb"
os.environ["UPSTASH_REDIS_REST_URL"] = "http://localhost:8080"
os.environ["UPSTASH_REDIS_REST_TOKEN"] = "test_token"

# 데이터베이스 및 Redis 모킹
# 테스트 수집 단계에서 실제 DB/Redis 연결 시도를 완전히 차단합니다.
mock_psycopg2 = MagicMock()
mock_pool = MagicMock()
mock_psycopg2.pool = mock_pool
sys.modules["psycopg2"] = mock_psycopg2
sys.modules["psycopg2.pool"] = mock_pool

# Redis 모킹 추가
mock_redis_module = MagicMock()
mock_redis_instance = MagicMock()
mock_redis_module.Redis.return_value = mock_redis_instance
sys.modules["upstash_redis"] = mock_redis_module

@pytest.fixture(scope="session", autouse=True)
def setup_test_env():
    """테스트 세션 시작 시 필요한 초기화 작업 (현재는 환경 변수만으로 충분)"""
    pass

@pytest.fixture
def mock_session():
    """requests.Session을 모킹하고 세션 인스턴스를 반환하는 공용 픽스처"""
    from unittest.mock import patch
    with patch("requests.Session") as mock_class:
        session_instance = mock_class.return_value
        yield session_instance