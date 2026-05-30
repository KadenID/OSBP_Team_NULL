import urllib.parse             #과목별 ID 추출
import requests                 #서버 통신
import re                       #과목명 정제
from bs4 import BeautifulSoup   #html > python 객체로 변환하여 탐색
import redis_cache
import storage
import logging
from concurrent.futures import ThreadPoolExecutor

# 로깅 설정
logger = logging.getLogger(__name__)

class SessionExpiredError(Exception): # 세션 만료 예외
    pass

def get_course_sort_key(name):
    """과목명 정렬 키: 한글(0) > 영어(1) > 숫자(2) > 기타(3) 순서"""
    if not name:
        return (4, "")
    # name이 문자열이 아닐 경우를 대비해 변환
    name_str = str(name)
    if not name_str:
        return (4, "")
        
    first_char = name_str[0]
    # 한글: 0
    if '가' <= first_char <= '힣':
        return (0, name_str)
    # 영어: 1
    if ('a' <= first_char <= 'z') or ('A' <= first_char <= 'Z'):
        return (1, name_str.lower())
    # 숫자: 2
    if '0' <= first_char <= '9':
        return (2, name_str)
    # 기타: 3
    return (3, name_str)

# 입력: session (로그인된 세션 객체), student_id (학번, 선택사항)
# 기능: 대시보드 페이지에서 수강 중인 과목 목록 및 ID 추출 (캐싱 지원)
# 반환: {과목ID: {"name": 과목명, "type": "regular"|"comparative"}} 딕셔너리
def get_enrolled_courses(session, student_id=None):
    # 정렬 도우미 함수
    def sort_courses(courses_dict):
        if not courses_dict:
            return {}
        
        def get_type_rank(data):
            if isinstance(data, dict):
                t = data.get('type', 'regular')
                return 0 if t == 'regular' else 1
            return 0 # 기본값 (regular)

        def get_name(data):
            if isinstance(data, dict):
                return data.get('name', '')
            return str(data)

        try:
            return dict(sorted(
                courses_dict.items(), 
                key=lambda x: (get_type_rank(x[1]), get_course_sort_key(get_name(x[1])))
            ))
        except Exception as se:
            logger.error(f"과목 정렬 중 오류 발생: {se}")
            return courses_dict # 정렬 실패 시 원본 반환

    # Redis 캐시 확인
    if student_id:
        try:
            cached = redis_cache.get_cached_courses(student_id)
            if cached:
                logger.info(f"[{student_id}] Redis 캐시에서 과목 목록 로드 성공 ({len(cached)}개)")
                return sort_courses(cached)
        except Exception as re_err:
            logger.warning(f"Redis 캐시 로드 실패: {re_err}")

    # 크롤링 시도 (캐시가 없으면 직접 추출)
    dashboard_url = "https://lms.chungbuk.ac.kr/"
    courses = {}

    try:
        logger.info(f"[{student_id}] LMS 대시보드에서 과목 목록 크롤링 시도...")
        resp = session.get(dashboard_url, timeout=15, allow_redirects=False)
        
        # 302 리다이렉트 발생 시 세션 만료로 간주
        if resp.status_code == 302 or "login" in resp.headers.get("Location", ""):
            logger.warning(f"[{student_id}] LMS 세션 만료 감지 (302 Redirect)")
            raise SessionExpiredError("LMS 세션이 만료되었습니다.")
            
        # 401 Unauthorized 발생 시 세션 만료로 간주
        if resp.status_code == 401:
            logger.warning(f"[{student_id}] LMS 세션 만료 감지 (401 Unauthorized)")
            raise SessionExpiredError("LMS 세션이 유효하지 않습니다.")
            
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        # 개별 과목 페이지 URL 구조 탐색
        links = soup.find_all('a', href=True)
        logger.info(f"[{student_id}] 대시보드 내 링크 총 {len(links)}개 탐색 중...")

        for link in links:
            href = link['href']
            if 'course/view.php?id=' in href:
                parsed_url = urllib.parse.urlparse(href)
                course_id = urllib.parse.parse_qs(parsed_url.query).get('id', [None])[0]
                
                if course_id and course_id not in courses:
                    course_type = "comparative" # 기본값
                    
                    if link.select_one('.badge-coursetype-re') or (link.parent and link.parent.select_one('.badge-coursetype-re')):
                        course_type = "regular"
                    elif link.select_one('.badge-coursetype-on') or (link.parent and link.parent.select_one('.badge-coursetype-on')):
                        course_type = "comparative"
                    
                    course_name = ""
                    if link.get('title'):
                        # title 속성에서 과목 코드 제외하고 이름만 추출
                        title_val = link.get('title').strip()
                        name_match = re.search(r'^(.*?)\s*\([0-9]+-[0-9]+\)', title_val)
                        course_name = name_match.group(1).strip() if name_match else title_val
                    
                    if not course_name:
                        raw_text = link.text.strip()
                        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]
                        for line in lines:
                            # 텍스트 라인에서 과목 코드 제외하고 이름만 추출
                            name_match = re.search(r'^(.*?)\s*\([0-9]+-[0-9]+\)', line)
                            if name_match:
                                course_name = name_match.group(1).strip()
                                break
                                
                        if not course_name and '진행중' in lines:
                            idx = lines.index('진행중')
                            if idx + 1 < len(lines):
                                course_name = lines[idx + 1]
                                
                    if course_name:
                        courses[course_id] = {"name": course_name, "type": course_type}

        logger.info(f"[{student_id}] 크롤링 완료: 총 {len(courses)}개 과목 발견")

        if courses:
            sorted_courses = sort_courses(courses)
            if student_id:
                storage.save_user_courses(student_id, sorted_courses)
                redis_cache.set_cached_courses(student_id, sorted_courses)
            return sorted_courses
            
        # 크롤링 결과가 하나도 없는 경우 DB에서 백업 로드
        if student_id:
            logger.warning(f"[{student_id}] 크롤링된 과목이 없습니다. DB에서 백업을 시도합니다.")
            db_courses = storage.get_user_courses(student_id)
            if db_courses:
                return sort_courses(db_courses)

        return {}

    except SessionExpiredError:
        raise
    except Exception as e:
        logger.error(f"[{student_id}] 과목 목록 추출 중 예외 발생: {e}")
        # 오류 발생 시 DB 데이터라도 반환
        if student_id:
            try:
                db_courses = storage.get_user_courses(student_id)
                if db_courses:
                    logger.info(f"[{student_id}] 예외 발생으로 DB에서 과목 목록 로드 ({len(db_courses)}개)")
                    return sort_courses(db_courses)
            except Exception as db_err:
                logger.error(f"DB 백업 로드 중 오류: {db_err}")
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

# 입력: session (세션 객체), assignment_id (과제 ID)
# 기능: 특정 과제의 상세 페이지를 크롤링하여 설명 추출
# 반환: 과제 상세 정보 딕셔너리
def get_assignment_detail(session, assignment_id):
    detail_url = f"https://lms.chungbuk.ac.kr/mod/assign/view.php?id={assignment_id}"
    BASE_URL = "https://lms.chungbuk.ac.kr"
    PROXY_URL = "/api/download?url="

    try:
        resp = session.get(detail_url, timeout=10, allow_redirects=False)
        if resp.status_code == 302 or "login" in resp.headers.get("Location", ""):
            raise SessionExpiredError("LMS 세션이 만료되었습니다.")
        if resp.status_code == 401:
            raise SessionExpiredError("LMS 세션이 유효하지 않습니다.")

        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        # 과제명
        title = soup.select_one('h2, .page-header-headings h1').get_text(strip=True) if soup.select_one('h2, .page-header-headings h1') else ""
        desc_tag = soup.select_one('div.box.generalbox div[id^="intro"], div#intro, .assignmentintro')

        description, description_html, attachments = "", "", []

        if desc_tag:
            # 이미지 절대경로 변환
            for img in desc_tag.find_all('img', src=True):
                if img['src'].startswith('/'):
                    img['src'] = f"{BASE_URL}{img['src']}"

            description = desc_tag.get_text(separator='\n', strip=True)
            description_html = str(desc_tag)

        submission_box = soup.select_one('.submissionstatustable, #modulespecific_props')
        if submission_box:
            submission_box.decompose() 

        for a in soup.find_all('a', href=True):
            href = a['href']
            if 'pluginfile.php' in href:
                full_url = href if href.startswith('http') else f"{BASE_URL}{href}"
                proxy_url = f"{PROXY_URL}{urllib.parse.quote(full_url, safe='')}"
                
                # HTML 본문 내 링크 변환
                a['href'] = proxy_url
                a['target'] = '_blank'

                # 첨부파일 목록에 추가 (중복 방지)
                if not any(att['url'] == proxy_url for att in attachments):
                    attachments.append({
                        'name': a.get_text(strip=True),
                        'url': proxy_url
                    })

        if not title and not description:
            raise ValueError("과제 정보를 찾을 수 없습니다.")

        return {
            'assignment_id': assignment_id,
            'title': title,
            'description': description,
            'description_html': description_html,
            'attachments': attachments,
            'url': detail_url
        }

    except Exception as e:
        print(f"과제 상세 정보 추출 중 오류 발생: {e}")
        raise e