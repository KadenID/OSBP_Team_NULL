import urllib.parse             #ID 추출
import requests                 #서버 통신
import re                       #과목명 정제
from bs4 import BeautifulSoup   #html > python 객체로 변환하여 탐색
from lms_login import login_to_lms

def get_enrolled_courses(session):
    dashboard_url = "https://lms.chungbuk.ac.kr/"
    courses = {}

    try:
        # 대시보드 접근 및 html 파일을 soup 객체로 변환
        resp = session.get(dashboard_url, timeout=10)
        resp.raise_for_status() # 404, 500 에러 발생 시 예외 발생
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
                    course_name = ""
                    
                    if link.get('title'):
                        course_name = link.get('title').strip()
                    
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
                        print(f"ID: {course_id} | 과목명: {course_name}")

        print(f"\n총 {len(courses)}개의 과목을 찾았습니다.")
        return courses

    except Exception as e:
        print(f"[{course_name}] 과목 목록 추출 중 오류 발생: {e}")
        return {}

def get_assignments_for_course(session, course_id, course_name):
    # 과제 목록 페이지 URL 생성
    assign_index_url = f"https://lms.chungbuk.ac.kr/mod/assign/index.php?id={course_id}"
    
    resp = session.get(assign_index_url, timeout=10)
    # 서버 응답이 200인지 확인하여 접속 여부 출력
    if resp.status_code == 200:
        print(f"[접속성공] {course_name} 과제 페이지에 연결되었습니다.")
    else:
        print(f"[접속실패] {course_name} 페이지 응답 코드: {resp.status_code}")
    
    return []

if __name__ == "__main__":
    session, message = login_to_lms()
    if session:
        courses = get_enrolled_courses(session)
        for c_id, c_name in courses.items():
            # 정의한 함수를 여기서 바로 호출하여 접속 테스트 진행
            get_assignments_for_course(session, c_id, c_name)
    else:
        print(f"로그인 실패: {message}")