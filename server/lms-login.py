import os
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()
USER_ID = os.getenv("LMS_ID")
USER_PW = os.getenv("LMS_PW")

if not USER_ID or not USER_PW:
    raise ValueError(".env 파일에 LMS_ID와 LMS_PW가 설정되지 않았습니다")

LOGIN_URL = "https://lms.chungbuk.ac.kr/login/index.php"

def login_to_lms():
    # 쿠키를 유지할 세션 생성
    session = requests.Session()
    
    try:
        # 로그인 페이지 접속 및 logintoken 추출
        get_resp = session.get(LOGIN_URL)
        soup = BeautifulSoup(get_resp.text, 'html.parser')
        token_input = soup.find('input', {'name': 'logintoken'})
        
        if token_input:
            logintoken = token_input.get('value')
        else:
            logintoken = ""
            
        # 데이터 전송 (로그인 시도)
        payload = {
            "username": USER_ID,
            "password": USER_PW,
            "logintoken": logintoken
        }
        post_resp = session.post(LOGIN_URL, data=payload)
        
        # URL에 'login'이 없으면 성공으로 간주
        if "login" not in post_resp.url:
            return session
        # 로그인 실패 시 None 반환
        else:
            return None
            
    # 네트워크 에러 등 예외 발생 시 None 반환
    except Exception:
        return None

# 단독 테스트 코드
if __name__ == "__main__":
    session = login_to_lms()
    print("로그인 세션 객체:", session)