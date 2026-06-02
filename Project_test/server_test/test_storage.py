import sys
import os

# Project/server 경로를 sys.path에 추가 (배포 코드 수정 방지)
current_dir = os.path.dirname(os.path.abspath(__file__))
server_dir = os.path.abspath(os.path.join(current_dir, "../../Project/server"))

if server_dir not in sys.path:
    sys.path.append(server_dir)

import unittest

try:
    from storage import init_db
    import storage
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

class TestStorage(unittest.TestCase):
    def test_import(self):
        """storage 모듈 임포트 테스트"""
        self.assertIsNotNone(init_db)
        print("\n[성공] storage 모듈을 정상적으로 불러왔습니다.")

if __name__ == "__main__":
    unittest.main()
