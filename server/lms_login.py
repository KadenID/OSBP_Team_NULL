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
        get_resp = session.get(LOGIN_URL, timeout=10)
        get_resp.raise_for_status()     # HTTP 에러 발생 시 예외 발생

        soup = BeautifulSoup(get_resp.text, 'html.parser')
        token_input = soup.find('input', {'name': 'logintoken'})
        
        if not token_input:
            return None, "로그인 토큰을 찾을 수 없습니다. (LMS 페이지 구조 변경)"
        
        logintoken = token_input.get('value')
            
        # 데이터 전송 (로그인 시도)
        payload = {
            "username": USER_ID,
            "password": USER_PW,
            "logintoken": logintoken
        }
        post_resp = session.post(LOGIN_URL, data=payload, timeout=10)
        
        # URL에 'login'이 없으면 성공으로 간주
        if "login" not in post_resp.url:
            return session, "로그인 성공"
        # 로그인 실패 시 None 반환
        else:
            return None, "로그인 실패: 아이디 또는 비밀번호를 확인하세요."
            
    # 예외 처리
    except requests.exceptions.ConnectionError:
        return None, "네트워크 연결 오류가 발생했습니다."
    except requests.exceptions.Timeout:
        return None, "서버 응답 시간이 초과되었습니다."
    except Exception as e:
        return None, f"알 수 없는 오류 발생: {str(e)}"

# 단독 테스트 코드
if __name__ == "__main__":
    session, message = login_to_lms()
    if session:
        print(f"{message} | 세션: {session}")
    else:
        print(f"{message}")
