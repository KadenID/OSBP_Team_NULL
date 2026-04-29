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

        return courses

    except Exception as e:
        print(f"[{course_name}] 과목 목록 추출 중 오류 발생: {e}")
        return {}

def get_assignments_for_course(session, course_id, course_name):
    # 과제 목록 페이지 URL 생성
    assign_index_url = f"https://lms.chungbuk.ac.kr/mod/assign/index.php?id={course_id}"
    assignments = []

    try:
        resp = session.get(assign_index_url, timeout=10)
        soup = BeautifulSoup(resp.text, 'html.parser')
        table = soup.find('table', class_='generaltable')
        
        if table:
            rows = table.find('tbody').find_all('tr') if table.find('tbody') else table.find_all('tr')[1:]
            for row in rows:
                cols = row.find_all(['td', 'th'])
                if len(cols) >= 4 and cols[1].find('a'):
                    # 데이터 추출
                    a_name = cols[1].find('a').text.strip()
                    a_url = cols[1].find('a')['href']
                    a_due = cols[2].text.strip()
                    a_status = cols[3].text.strip()
                    
                    # 데이터 반환을 위해 리스트에 저장
                    assignments.append({
                        'course_name': course_name,
                        'assignment_name': a_name,
                        'due_date': a_due,
                        'status': a_status,
                        'url': a_url
                    })

        return assignments
    
    except Exception as e:
        print(f"[{course_name}] 에러: {e}"); return []

def crawl_all_assignments(session):
    # 모든 과제 데이터를 하나의 리스트로 통합
    all_assignments = []

    courses = get_enrolled_courses(session)
    
    for course_id, course_name in courses.items():
        assign_list = get_assignments_for_course(session, course_id, course_name)
        all_assignments.extend(assign_list)
        
    return all_assignments

if __name__ == "__main__":
    session, message = login_to_lms()
    if session:
        final_assignments = crawl_all_assignments(session)

        print("\n" + "="*50)
        print(f"       학기 과제 현황 요약 (총 {len(final_assignments)}건)")
        print("="*50)
        
        for idx, item in enumerate(final_assignments, 1):
            print(f"{idx:2d}. [{item['course_name']}] {item['assignment_name']}")
            print(f"    - 마감: {item['due_date']} | 상태: {item['status']}")
            print(f"    - 링크: {item['url']}\n")
    else:
        print(f"로그인 실패: {message}")