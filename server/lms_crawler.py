import urllib.parse             #과목별 ID 추출
import requests                 #서버 통신
import re                       #과목명 정제
from bs4 import BeautifulSoup   #html > python 객체로 변환하여 탐색
import redis_cache
import storage

class SessionExpiredError(Exception): # 세션 만료 예외
    pass

# 입력: session (로그인된 세션 객체), student_id (학번, 선택사항)
# 기능: 대시보드 페이지에서 수강 중인 과목 목록 및 ID 추출 (캐싱 지원)
# 반환: {과목ID: 과목명} 딕셔너리
def get_enrolled_courses(session, student_id=None):
    # 1. Redis 캐시 확인
    if student_id:
        cached = redis_cache.get_cached_courses(student_id)
        if cached:
            return cached

    # 2. DB 확인 (Redis에 없거나 student_id가 있는 경우)
    if student_id:
        db_courses = storage.get_user_courses(student_id)
        if db_courses:
            # DB 데이터를 Redis에 캐싱 (24시간)
            redis_cache.set_cached_courses(student_id, db_courses)
            return db_courses

    # 3. 크롤링 (캐시/DB에 없으면 직접 추출)
    dashboard_url = "https://lms.chungbuk.ac.kr/"
    courses = {}

    try:
        # 대시보드 접근
        resp = session.get(dashboard_url, timeout=10, allow_redirects=False)
        
        # 302 리다이렉트 발생 시 세션 만료로 간주
        if resp.status_code == 302 or "login" in resp.headers.get("Location", ""):
            raise SessionExpiredError("LMS 세션이 만료되었습니다. (302 Redirect)")
            
        # 401 Unauthorized 발생 시 세션 만료로 간주
        if resp.status_code == 401:
            raise SessionExpiredError("LMS 세션이 유효하지 않습니다. (401 Unauthorized)")
            
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        # 개별 과목 페이지 URL 구조 탐색
        for link in soup.find_all('a', href=True):
            href = link['href']
            if 'course/view.php?id=' in href:
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
                            if re.search(r'\([0-9]+-[0-9]+\)', line):
                                course_name = line
                                break
                                
                        if not course_name and '진행중' in lines:
                            idx = lines.index('진행중')
                            if idx + 1 < len(lines):
                                course_name = lines[idx + 1]
                                
                    if course_name:
                        courses[course_id] = course_name

        # 4. 결과 저장 (성공적으로 크롤링한 경우 DB와 Redis에 업데이트)
        if student_id and courses:
            storage.save_user_courses(student_id, courses)
            redis_cache.set_cached_courses(student_id, courses)

        return courses

    except SessionExpiredError:
        raise
    except Exception as e:
        print(f"과목 목록 추출 중 오류 발생: {e}")
        # 오류 발생 시 DB에 저장된 예전 데이터라도 반환 시도
        if student_id:
            return storage.get_user_courses(student_id)
        return {}

# 입력: session (로그인된 세션 객체), student_id (학번)
# 기능: LMS 사용자 정보 API에서 이름, 학과 정보를 추출
# 반환: 사용자 정보 딕셔너리
def get_user_profile(session, student_id):
    dashboard_url = "https://lms.chungbuk.ac.kr/"
    profile_action_url = "https://lms.chungbuk.ac.kr/theme/coursemos/action.php"
    profile_info = {
        "name": "",
        "student_id": student_id,
        "department": ""
    }

    try:
        resp = session.get(dashboard_url, timeout=10, allow_redirects=False)

        if resp.status_code == 302 or "login" in resp.headers.get("Location", ""):
            raise SessionExpiredError("LMS 세션이 만료되었습니다. (302 Redirect)")

        if resp.status_code == 401:
            raise SessionExpiredError("LMS 세션이 유효하지 않습니다. (401 Unauthorized)")

        resp.raise_for_status()

        sesskey_match = re.search(r'"sesskey":"([^"]+)"', resp.text)
        if not sesskey_match:
            sesskey_match = re.search(r"sesskey=([A-Za-z0-9]+)", resp.text)

        if not sesskey_match:
            raise Exception("sesskey를 찾을 수 없습니다.")

        sesskey = sesskey_match.group(1)

        profile_resp = session.post(
            profile_action_url,
            data={
                "coursemostype": "userInfoMy",
                "courseid": "1",
                "sesskey": sesskey
            },
            headers={
                "X-Requested-With": "XMLHttpRequest",
                "Referer": dashboard_url,
                "User-Agent": "Mozilla/5.0"
            },
            timeout=10,
            allow_redirects=False
        )

        if profile_resp.status_code == 302 or "login" in profile_resp.headers.get("Location", ""):
            raise SessionExpiredError("LMS 세션이 만료되었습니다. (302 Redirect)")

        if profile_resp.status_code == 401:
            raise SessionExpiredError("LMS 세션이 유효하지 않습니다. (401 Unauthorized)")

        profile_resp.raise_for_status()

        if not profile_resp.text.strip():
            raise Exception("프로필 API 응답이 비어 있습니다.")
        
        profile_data = profile_resp.json()
        profile_html = profile_data.get("html", "")

        profile_soup = BeautifulSoup(profile_html, 'html.parser')

        name_tag = profile_soup.select_one("h4.username")
        if name_tag:
            profile_info["name"] = name_tag.text.strip()

        department_tag = profile_soup.select_one("div.department")
        if department_tag:
            department_lines = [
                line.strip()
                for line in department_tag.get_text("\n", strip=True).split("\n")
                if line.strip()
            ]

            if department_lines:
                profile_info["department"] = department_lines[-1]

        return profile_info

    except SessionExpiredError:
        raise
    except Exception as e:
        error_msg = f"사용자 프로필 추출 중 오류 발생: {str(e)}"
        print(error_msg)
        raise Exception(error_msg)

# 입력: session (세션 객체), course_id (과목 ID), course_name (과목명)
# 기능: 특정 과목의 과제 목록 페이지를 크롤링하여 상세 정보 추출
# 반환: 과제 정보 딕셔너리 리스트
def get_assignments_for_course(session, course_id, course_name):
    # 과제 목록 페이지 URL
    assign_index_url = f"https://lms.chungbuk.ac.kr/mod/assign/index.php?id={course_id}"
    assignments = []

    try:
        resp = session.get(assign_index_url, timeout=10, allow_redirects=False)
        
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
        error_msg = f"과제 추출 중 오류 발생: {str(e)}"
        print(error_msg)
        raise Exception(error_msg)

# 입력: session (세션 객체), student_id (학번, 캐싱용)
# 기능: 모든 수강 과목의 과제를 통합하여 크롤링하고 마감일 순으로 정렬
# 반환: 정렬된 과제 리스트
def crawl_all_assignments(session, student_id=None):
    all_assignments = []

    courses = get_enrolled_courses(session, student_id)
    
    for course_id, course_name in courses.items():
        assign_list = get_assignments_for_course(session, course_id, course_name)
        all_assignments.extend(assign_list)
    
    # 마감일 기준 오름차순 정렬
    all_assignments.sort(key=lambda x: x['due_date'])

    return all_assignments
