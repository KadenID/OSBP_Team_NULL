import urllib.parse             #ID 추출
import requests                 #서버 통신
import re                       #과목명 정제
from bs4 import BeautifulSoup   #html > python 객체로 변환하여 탐색
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
                raw_text = link.text.strip()
                course_name = link.get('title', '').strip()
                
                if not course_name:
                    lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
                    for line in lines:
                        #(5110007-01) 형태의 과목코드 탐색
                        if re.search(r'\([0-9]+-[0-9]+\)', line):
                            course_name = line
                            break
                            
                    if not course_name and '진행중' in lines:
                        idx = lines.index('진행중')
                        if idx + 1 < len(lines):
                            course_name = lines[idx + 1]
                            
                if course_name:
                    courses[course_id] = course_name
                    print(f"[추출] ID: {course_id} | 과목명: {course_name}")

    print(f"\n총 {len(courses)}개의 과목을 찾았습니다.")
    return courses

if __name__ == "__main__":
    session, message = login_to_lms()
    if session:
        print("LMS 로그인 성공\n")
        get_enrolled_courses(session)
    else:
        print(f"로그인 실패: {message}")