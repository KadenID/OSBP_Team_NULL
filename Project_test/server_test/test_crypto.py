import pytest
import base64
import os
import importlib
from unittest.mock import patch
import crypto
from crypto import encrypt, decrypt

def test_encrypt_decrypt_success():
    """정상적인 암복호화 과정을 테스트한다."""
    original_text = "test_password_123!"
    
    # 암호화
    encrypted = encrypt(original_text)
    assert encrypted != original_text
    assert len(encrypted) > 0
    
    # 복호화
    decrypted = decrypt(encrypted)
    assert decrypted == original_text

def test_encrypt_is_randomized():
    """동일한 텍스트를 암호화해도 매번 다른 결과(IV 사용)가 나오는지 테스트한다."""
    plain_text = "same_text"
    
    enc1 = encrypt(plain_text)
    enc2 = encrypt(plain_text)
    
    assert enc1 != enc2
    # 복호화 결과는 같아야 함
    assert decrypt(enc1) == decrypt(enc2)

def test_empty_string_handling():
    """빈 문자열이나 None 입력 시의 처리를 테스트한다."""
    assert encrypt("") == ""
    assert decrypt("") == ""
    assert encrypt(None) == ""
    assert decrypt(None) == ""

def test_decrypt_invalid_data():
    """잘못된 암호문 복호화 시 예외가 발생하는지 테스트한다."""
    # 1. Base64가 아닌 경우
    with pytest.raises(Exception):
        decrypt("not-base64-data!!")
    
    # 2. Base64이지만 AESGCM 구조가 아닌 경우 (데이터 손상)
    invalid_encrypted = base64.b64encode(b"too_short").decode("utf-8")
    with pytest.raises(Exception):
        decrypt(invalid_encrypted)

def test_unicode_handling():
    """한글 등 유니코드 문자열의 암복호화를 테스트한다."""
    unicode_text = "안녕하세요. 팀 NULL입니다! 🚀"
    
    encrypted = encrypt(unicode_text)
    decrypted = decrypt(encrypted)
    
    assert decrypted == unicode_text

def test_long_string_handling():
    """매우 긴 문자열의 암복호화를 테스트한다."""
    long_text = "A" * 10000
    
    encrypted = encrypt(long_text)
    decrypted = decrypt(encrypted)
    
    assert decrypted == long_text

# ─── 커버리지 향상을 위한 추가 테스트 (모듈 로드 로직) ───────────────────────

def test_missing_secret_key_raises_error(monkeypatch):
    """AES_SECRET_KEY 환경 변수가 없을 때 EnvironmentError가 발생하는지 테스트한다."""
    monkeypatch.delenv("AES_SECRET_KEY", raising=False)
    with pytest.raises(EnvironmentError) as excinfo:
        importlib.reload(crypto)
    assert "환경 변수가 설정되지 않았습니다" in str(excinfo.value)

def test_invalid_key_length_raises_error(monkeypatch):
    """AES_SECRET_KEY 길이가 32바이트가 아닐 때 ValueError가 발생하는지 테스트한다."""
    monkeypatch.setenv("AES_SECRET_KEY", "short_key_12345")
    with pytest.raises(ValueError) as excinfo:
        importlib.reload(crypto)
    assert "정확히 32바이트여야 합니다" in str(excinfo.value)

def test_secrets_env_path_check():
    """특정 경로(/etc/secrets/.env)에 .env가 존재하는 경우의 분기를 테스트한다."""
    with patch("os.path.exists") as mock_exists:
        mock_exists.side_effect = lambda path: True if path == "/etc/secrets/.env" else False
        # dotenv.load_dotenv를 패치해야 함 (이미 import된 시점의 crypto.load_dotenv가 아닐 수 있음)
        with patch("dotenv.load_dotenv") as mock_load:
            importlib.reload(crypto)
            # /etc/secrets/.env 경로로 호출되었는지 확인
            mock_load.assert_any_call("/etc/secrets/.env")

# 마지막에 모듈을 정상 상태로 복구 (다른 테스트에 영향을 주지 않기 위함)
@pytest.fixture(scope="module", autouse=True)
def restore_crypto_module():
    yield
    importlib.reload(crypto)
