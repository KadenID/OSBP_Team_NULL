import urllib.parse             #과목별 ID 추출
import requests                 #서버 통신
import re                       #과목명 정제
from bs4 import BeautifulSoup   #html > python 객체로 변환하여 탐색

class SessionExpiredError(Exception):
    """LMS 세션이 만료되었을 때 발생하는 예외"""
    pass

def get_enrolled_courses(session):
    dashboard_url = "https://lms.chungbuk.ac.kr/"
    courses = {}

    try:
        # 대시보드 접근
        resp = session.get(dashboard_url, timeout=10, allow_redirects=False)
        
        # 302 리다이렉트 발생 시 (로그인 페이지로 튕김) 세션 만료로 간주
        if resp.status_code == 302 or "login" in resp.headers.get("Location", ""):
            raise SessionExpiredError("LMS 세션이 만료되었습니다. (302 Redirect)")
            
        # 401 Unauthorized 발생 시 세션 만료로 간주
        if resp.status_code == 401:
            raise SessionExpiredError("LMS 세션이 유효하지 않습니다. (401 Unauthorized)")
            
        resp.raise_for_status()
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

        return courses

    except SessionExpiredError:
        raise
    except Exception as e:
        print(f"과목 목록 추출 중 오류 발생: {e}")
        return {}

def get_assignments_for_course(session, course_id, course_name):
    # 과제 목록 페이지 URL 생성
    assign_index_url = f"https://lms.chungbuk.ac.kr/mod/assign/index.php?id={course_id}"
    assignments = []

    try:
        resp = session.get(assign_index_url, timeout=10, allow_redirects=False)
        
        # 여기서도 세션 만료 체크
        if resp.status_code in [302, 401]:
             raise SessionExpiredError("LMS 세션이 만료되었습니다.")
             
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

                    parsed_assign_url = urllib.parse.urlparse(a_url)
                    a_id = urllib.parse.parse_qs(parsed_assign_url.query).get('id', [None])[0]
                    
                    try:
                        clean_due = a_due.replace("년 ", "-").replace("월 ", "-").replace("일", "")
                        clean_due = re.sub(r'(?<!\d)(\d)(?!\d)', r'0\1', clean_due)
                        if " " in clean_due:
                            parts = clean_due.split()
                            date_part = parts[0]
                            time_part = parts[1] if len(parts) > 1 else "00:00"
                            a_due_iso = f"{date_part}T{time_part}:00"
                        else:
                            a_due_iso = clean_due
                    except Exception:
                        a_due_iso = a_due

                    assignments.append({
                        'course_id': course_id,
                        'course_name': course_name,
                        'assignment_id': a_id,
                        'assignment_name': a_name,
                        'due_date': a_due_iso,
                        'status': a_status,
                        'url': a_url
                    })

        return assignments
    
    except SessionExpiredError:
        raise
    except Exception as e:
        error_msg = f"과목 목록 추출 중 오류 발생: {str(e)}"
        print(error_msg)
        raise Exception(error_msg)

def crawl_all_assignments(session):
    # 모든 과제 데이터를 하나의 리스트로 통합
    all_assignments = []

    courses = get_enrolled_courses(session)
    
    for course_id, course_name in courses.items():
        assign_list = get_assignments_for_course(session, course_id, course_name)
        all_assignments.extend(assign_list)
    
    # 마감일을 기준으로 오름차순 정렬
    all_assignments.sort(key=lambda x: x['due_date'])

    return all_assignments
