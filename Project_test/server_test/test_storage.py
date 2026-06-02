import pytest
from storage import init_db

def test_storage_init_import():
    """storage 모듈 임포트 및 init_db 존재 확인 테스트 (pytest 스타일)"""
    assert init_db is not None
    print("\n[성공] storage 모듈을 정상적으로 불러왔습니다.")