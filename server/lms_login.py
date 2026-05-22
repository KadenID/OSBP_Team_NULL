import os
import requests
import sys
from bs4 import BeautifulSoup
from dotenv import load_dotenv

if os.path.exists("/etc/secrets/.env"):
    load_dotenv("/etc/secrets/.env")
else:
    load_dotenv()

# LMS 로그인 주소
LOGIN_URL = "https://lms.chungbuk.ac.kr/login/index.php"

# 입력: user_id (학번), user_pw (비밀번호)
# 기능: LMS 로그인 페이지에 접속하여 인증을 수행하고 세션을 획득
# 반환: (requests.Session 객체, 메시지) 튜플
def login_to_lms(user_id, user_pw):
    if not user_id or not user_pw:
        return None, "ID 또는 PW가 제공되지 않았습니다."
    
    if len(user_id) > 20 or len(user_pw) > 20:
        return None, "ID 또는 PW는 최대 20자까지 가능합니다."
    
    # 세션 생성
    session = requests.Session()
    
    try:
        # 로그인 페이지 접속 및 logintoken 추출
        get_resp = session.get(LOGIN_URL, timeout=10)
        get_resp.raise_for_status()     # HTTP 에러 발생 시 예외 발생

        soup = BeautifulSoup(get_resp.text, 'html.parser')
        token_input = soup.find('input', {'name': 'logintoken'})
        
        if not token_input:
            return None, "로그인 토큰을 찾을 수 없습니다. (LMS 페이지 구조 변경)"
        
        logintoken = token_input.get('value')
            
        # 로그인 요청 페이로드
        payload = {
            "username": user_id,
            "password": user_pw,
            "logintoken": logintoken
        }
        post_resp = session.post(LOGIN_URL, data=payload, timeout=10)
        
        # 성공 판별
        if "login" not in post_resp.url:
            return session, "로그인 성공"
        else:
            return None, "로그인 실패: 아이디 또는 비밀번호를 확인하세요."
            
    except requests.exceptions.ConnectionError:
        return None, "네트워크 연결 오류가 발생했습니다."
    except requests.exceptions.Timeout:
        return None, "서버 응답 시간이 초과되었습니다."
    except Exception as e:
        return None, f"알 수 없는 오류 발생: {str(e)}"

# 단독 테스트 코드
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python lms_login.py <student_id> <password>")
        sys.exit(1)
        
    test_id = sys.argv[1]
    test_pw = sys.argv[2]
    
    session, message = login_to_lms(test_id, test_pw)
    if session:
        print(f"{message} | 세션: {session}")
    else:
        print(f"{message}")
