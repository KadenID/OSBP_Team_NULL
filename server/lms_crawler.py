import urllib.parse
import requests
from bs4 import BeautifulSoup
from lms_login import login_to_lms

def get_enrolled_courses(session):
    dashboard_url = "https://lms.chungbuk.ac.kr/"
    courses = {}

    # 대시보드 접근 및 html 파일을 soup 객체로 변환
    resp = session.get(dashboard_url, timeout=10)
    soup = BeautifulSoup(resp.text, 'html.parser')

    # 페이지 내 모든 앵커에서 개별 과목 페이지 특유의 URL 구조 탐색
    for link in soup.find_all('a', href=True):
        href = link['href']
        if 'course/view.php?id=' in href:
            # 주소 뒤의 쿼리 스트링에서 강의별 ID 추출하여 딕셔너리로 저장
            parsed_url = urllib.parse.urlparse(href)
            course_id = urllib.parse.parse_qs(parsed_url.query).get('id', [None])[0]
            
            if course_id and course_id not in courses:
                # trim
                course_name = link.text.strip().replace('\n', ' ')
                courses[course_id] = course_name
                print(f"   [발견] ID: {course_id} | 과목명: {course_name}")
                
    print(f"\n총 {len(courses)}개의 과목을 찾았습니다.")
    return courses

if __name__ == "__main__":
    session, message = login_to_lms()
    if session:
        print("LMS 로그인 성공")
        get_enrolled_courses(session)
    else:
        print(f"로그인 실패: {message}")