import requests
from bs4 import BeautifulSoup
from lms_login import login_to_lms

def get_enrolled_courses(session):
    dashboard_url = "https://lms.chungbuk.ac.kr/"

    #대시보드 접근 및 html 파일을 soup 객체로 변환
    resp = session.get(dashboard_url, timeout=10)
    soup = BeautifulSoup(resp.text, 'html.parser')

    #페이지 내 모든 앵커에서 개별 과목 페이지 특유의 URL 구조 탐색
    for link in soup.find_all('a', href=True):
        if 'course/view.php?id=' in link['href']:
            print("찾은 과목:", link.text.strip())
    return {}

if __name__ == "__main__":
    session, message = login_to_lms()
    if session:
        print("LMS 로그인 성공")
        get_enrolled_courses(session)
    else:
        print(f"로그인 실패: {message}")