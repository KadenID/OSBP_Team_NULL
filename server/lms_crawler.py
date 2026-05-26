import urllib.parse             #과목별 ID 추출
import requests                 #서버 통신
import re                       #과목명 정제
from bs4 import BeautifulSoup   #html > python 객체로 변환하여 탐색
import redis_cache
import storage
from concurrent.futures import ThreadPoolExecutor

class SessionExpiredError(Exception): # 세션 만료 예외
    pass

def get_course_sort_key(name):
    """과목명 정렬 키: 한글(0) > 영어(1) > 숫자(2) > 기타(3) 순서"""
    if not name:
        return (4, "")
    first_char = name[0]
    # 한글: 0
    if '가' <= first_char <= '힣':
        return (0, name)
    # 영어: 1
    if ('a' <= first_char <= 'z') or ('A' <= first_char <= 'Z'):
        return (1, name.lower())
    # 숫자: 2
    if '0' <= first_char <= '9':
        return (2, name)
    # 기타: 3
    return (3, name)

# 입력: session (로그인된 세션 객체), student_id (학번, 선택사항)
# 기능: 대시보드 페이지에서 수강 중인 과목 목록 및 ID 추출 (캐싱 지원)
# 반환: {과목ID: {"name": 과목명, "type": "regular"|"comparative"}} 딕셔너리
def get_enrolled_courses(session, student_id=None):
    # Redis 캐시 확인
    if student_id:
        cached = redis_cache.get_cached_courses(student_id)
        if cached:
            return cached

    # DB 확인 (Redis에 없거나 student_id가 있는 경우)
    if student_id:
        db_courses = storage.get_user_courses(student_id)
        if db_courses:
            # 정렬 후 반환 및 캐싱 (정규(0) > 비교과(1))
            sorted_db = dict(sorted(
                db_courses.items(), 
                key=lambda x: (0 if x[1]['type'] == 'regular' else 1, get_course_sort_key(x[1]['name']))
            ))
            redis_cache.set_cached_courses(student_id, sorted_db)
            return sorted_db

    # 크롤링 (캐시/DB에 없으면 직접 추출)
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
                    # 1. 과목 타입 판정 (오직 배지 클래스만 사용)
                    course_type = "comparative" # 기본값
                    
                    # badge-coursetype-re: 정규 강좌
                    # badge-coursetype-on: 비교과 과정
                    if link.select_one('.badge-coursetype-re') or (link.parent and link.parent.select_one('.badge-coursetype-re')):
                        course_type = "regular"
                    elif link.select_one('.badge-coursetype-on') or (link.parent and link.parent.select_one('.badge-coursetype-on')):
                        course_type = "comparative"
                    
                    # 2. 과목명 추출
                    raw_text = link.text.strip()
                    course_name = ""
                    
                    if link.get('title'):
                        course_name = link.get('title').strip()
                    
                    if not course_name:
                        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
                        for line in lines:
                            # 학기 정보가 있는 줄을 이름으로 우선 선택
                            if re.search(r'\([0-9]+-[0-9]+\)', line):
                                course_name = line
                                break
                                
                        if not course_name and '진행중' in lines:
                            idx = lines.index('진행중')
                            if idx + 1 < len(lines):
                                course_name = lines[idx + 1]
                                
                    if course_name:
                        courses[course_id] = {
                            "name": course_name,
                            "type": course_type
                        }

        # 최종 정렬 (정규(0) > 비교과(1))
        sorted_courses = dict(sorted(
            courses.items(), 
            key=lambda x: (0 if x[1]['type'] == 'regular' else 1, get_course_sort_key(x[1]['name']))
        ))

        # 결과 저장 (성공적으로 크롤링한 경우 DB와 Redis에 업데이트)
        if student_id and sorted_courses:
            storage.save_user_courses(student_id, sorted_courses)
            redis_cache.set_cached_courses(student_id, sorted_courses)

        return sorted_courses

    except SessionExpiredError:
        raise
    except Exception as e:
        print(f"과목 목록 추출 중 오류 발생: {e}")
        # 오류 발생 시 DB 데이터 정렬하여 반환
        if student_id:
            db_courses = storage.get_user_courses(student_id)
            return dict(sorted(
                db_courses.items(), 
                key=lambda x: (0 if x[1]['type'] == 'regular' else 1, get_course_sort_key(x[1]['name']))
            ))
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
    
    # 병렬 크롤링을 위한 함수 정의
    def fetch_course_assignments(course_info):
        cid, cdata = course_info
        # cdata가 딕셔너리인 경우와 문자열인 경우 모두 대응
        cname = cdata['name'] if isinstance(cdata, dict) else str(cdata)
        try:
            return get_assignments_for_course(session, cid, cname)
        except Exception as e:
            print(f"과목 {cname} 과제 크롤링 실패: {e}")
            return []

    # ThreadPoolExecutor를 사용하여 병렬로 과제 데이터 수집 (최대 10개 스레드)
    # 이 방식은 과목별로 별도의 HTTP 요청을 동시에 날리므로 속도가 비약적으로 향상됩니다.
    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(fetch_course_assignments, courses.items()))
    
    # 결과 통합
    for assign_list in results:
        all_assignments.extend(assign_list)
    
    # 최종 마감일 기준 오름차순 정렬 (사용자 편의)
    all_assignments.sort(key=lambda x: x['due_date'])

    return all_assignments
