import urllib.parse
from bs4 import BeautifulSoup
import logging
from concurrent.futures import ThreadPoolExecutor  # 병렬 처리를 위한 모듈

from lms_crawler import SessionExpiredError, get_enrolled_courses

logger = logging.getLogger(__name__)

# 공통 LMS 공지사항 게시판 ID — 제외 목록
COMMON_BOARD_IDS = {'17'}

# 입력: session (세션 객체), course_id (과목 ID), course_name (과목명)
# 기능: 특정 과목의 공지사항 게시판 ID 추출 후 공지 목록 크롤링
# 반환: 공지 정보 딕셔너리 리스트
def get_notices_for_course(session, course_id, course_name, common_board_ids=None):
    if common_board_ids is None:
        common_board_ids = COMMON_BOARD_IDS
        
    course_url = f"https://lms.chungbuk.ac.kr/course/view.php?id={course_id}"
    notices = []

    try:
        resp = session.get(course_url, timeout=10, allow_redirects=False)
        if resp.status_code in [302, 401]:
            raise SessionExpiredError("LMS 세션이 만료되었습니다.")

        soup = BeautifulSoup(resp.text, 'html.parser')

        # 강의실 홈에서 공지사항 게시판 링크 찾기
        # ubboard 링크 중 과목 ID, 공통 게시판 ID와 다른 첫 번째 링크를 게시판으로 간주
        board_id = None
        for a in soup.find_all('a', href=True):
            href = a['href']
            if 'mod/ubboard/view.php?id=' in href:
                parsed = urllib.parse.urlparse(href)
                bid = urllib.parse.parse_qs(parsed.query).get('id', [None])[0]
                if bid and bid != course_id and bid not in common_board_ids:
                    board_id = bid
                    break

        if not board_id:
            return []

        # 공지 목록 페이지 크롤링
        board_url = f"https://lms.chungbuk.ac.kr/mod/ubboard/view.php?id={board_id}"
        board_resp = session.get(board_url, timeout=10, allow_redirects=False)
        if board_resp.status_code in [302, 401]:
            raise SessionExpiredError("LMS 세션이 만료되었습니다.")

        board_soup = BeautifulSoup(board_resp.text, 'html.parser')

        # 상단 고정 공지 — 페이지 최초 진입 시 펼쳐진 공지
        article_subject = board_soup.select_one('div.article-subject h3')
        article_info = board_soup.select_one('div.article-info')
        article_content = board_soup.select_one('div.article-content div.text_to_html')

        # bwid (게시글 ID) 추출 — 목록 첫 번째 링크에서
        top_bwid = None
        if article_subject:
            # div.article-subject 내부에 있는 <a> 태그 혹은 바로 위/아래 부모 블록 내의 링크를 안전하게 탐색합니다.
            subject_box = board_soup.select_one('div.article-subject')
            top_link = subject_box.find('a', href=True) if subject_box else None
            
            # 만약 제목 내부에 링크가 없다면 article-info 영역 내부의 링크 등 상단 영역에서 bwid 검색
            if not top_link and article_info:
                top_link = article_info.find('a', href=True)

            if top_link:
                href = top_link.get('href', '')
                parsed_href = urllib.parse.urlparse(href)
                top_bwid = urllib.parse.parse_qs(parsed_href.query).get('bwid', [None])[0]

        if article_subject and top_bwid:
            title = article_subject.get_text(strip=True)
            writer, date = "", ""
            if article_info:
                for col in article_info.select('div.col-info'):
                    text = col.get_text(strip=True)
                    if '작성자' in text:
                        writer = text.replace('작성자', '').replace(':', '').strip()
                    elif '작성일' in text:
                        date = text.replace('작성일', '').replace(':', '').strip()

            description = ""
            if article_content:
                description = article_content.get_text(separator='\n', strip=True)

            notices.append({
                'course_id': course_id,
                'course_name': course_name,
                'board_id': board_id,
                'notice_id': top_bwid,
                'title': title,
                'writer': writer,
                'date': date,
                'description': description,
                'url': f"https://lms.chungbuk.ac.kr/mod/ubboard/article.php?bwid={top_bwid}&id={board_id}"
            })

        # 목록 테이블에서 나머지 공지 추출
        table = board_soup.select_one('table.table-ubboard-list tbody')
        if table:
            rows = table.find_all('tr')
            for row in rows:
                cols = row.find_all('td')
                if len(cols) < 4:
                    continue

                a_tag = cols[1].find('a') if len(cols) > 1 else None
                if not a_tag:
                    continue

                href = a_tag.get('href', '')
                parsed_href = urllib.parse.urlparse(href)
                params = urllib.parse.parse_qs(parsed_href.query)

                # bwid와 id 둘 다 있는 링크만 처리
                notice_bwid = params.get('bwid', [None])[0]
                notice_board_id = params.get('id', [None])[0]

                if not notice_bwid or not notice_board_id:
                    continue

                # 중복 방지 (상단 고정 공지와 id가 다를 때만 추가)
                if notice_bwid != top_bwid:
                    title = a_tag.get_text(strip=True)
                    writer = cols[2].get_text(strip=True) if len(cols) > 2 else ''
                    date = cols[3].get_text(strip=True) if len(cols) > 3 else ''

                    notices.append({
                        'course_id': course_id,
                        'course_name': course_name,
                        'board_id': notice_board_id,
                        'notice_id': notice_bwid,
                        'title': title,
                        'writer': writer,
                        'date': date,
                        'description': '',
                        'url': f"https://lms.chungbuk.ac.kr/mod/ubboard/article.php?bwid={notice_bwid}&id={notice_board_id}"
                    })

        return notices

    except SessionExpiredError:
        raise
    except Exception as e:
        logger.error(f"[{course_name}] 공지사항 목록 추출 중 오류 발생: {e}")
        print(f"공지사항 목록 추출 중 오류: {e}")
    return []


# 입력: session (세션 객체), board_id (게시판 ID), notice_id (게시글 ID)
# 기능: 공지사항 상세 페이지 크롤링
# 반환: 상세 정보 딕셔너리
def get_notice_detail(session, board_id, notice_id):
    url = f"https://lms.chungbuk.ac.kr/mod/ubboard/article.php?bwid={notice_id}&id={board_id}"

    try:
        resp = session.get(url, timeout=10, allow_redirects=False)
        if resp.status_code in [302, 401]:
            raise SessionExpiredError("LMS 세션이 만료되었습니다.")

        soup = BeautifulSoup(resp.text, 'html.parser')

        error_box = soup.select_one('div.alert-danger') or soup.select_one('div#notice')
        title_tag = soup.select_one('div.article-subject h3')
        if not title_tag or (error_box and '존재하지' in error_box.get_text()):
            raise ValueError("존재하지 않는 공지사항입니다.")

        title = ""
        title_tag = soup.select_one('div.article-subject h3')
        if title_tag:
            title = title_tag.get_text(strip=True)

        writer, date, views = "", "", ""
        for col in soup.select('div.article-info div.col-info'):
            text = col.get_text(strip=True)
            if '작성자' in text:
                writer = text.replace('작성자', '').replace(':', '').strip()
            elif '작성일' in text:
                date = text.replace('작성일', '').replace(':', '').strip()
            elif '조회수' in text:
                views = text.replace('조회수', '').replace(':', '').strip()

        # 텍스트 대신 HTML 추출 — 이미지 src를 절대 경로로 변환
        # 본문 및 이미지 경로 보정
        description = ""
        description_html = ""
        content_tag = soup.select_one('div.article-content div.text_to_html')
        if content_tag:
            description = content_tag.get_text(separator='\n', strip=True)

            for img in content_tag.find_all('img'):
                src = img.get('src', '')
                if src.startswith('/'):
                    img['src'] = f"https://lms.chungbuk.ac.kr{src}"
            description_html = str(content_tag)

            description = content_tag.get_text(separator='\n', strip=True)
            
        attachments = []
        files_container = soup.select_one('div.article-files') or soup.select_one('ul.files')
        if files_container:
            for file_link in files_container.find_all('a', href=True):
                file_url = file_link['href']
        
                if file_url.startswith('/'):
                    file_url = f"https://lms.chungbuk.ac.kr{file_url}"
                
                file_name = file_link.get_text(strip=True)
                
                if file_url and file_name:
                    attachments.append({
                        'name': file_name,
                        'url': file_url
                    })

        return {
            'title': title,
            'writer': writer,
            'date': date,
            'views': views,
            'description': description,
            'description_html': description_html,
            'attachments': attachments,  # 파싱된 첨부파일 배열 포함
            'url': url
        }

    except SessionExpiredError:
        raise
    except Exception as e:
        logger.error(f"공지사항 상세 조회 중 오류 (Notice ID: {notice_id}): {e}")
        raise Exception(f"공지사항 상세 조회 중 오류: {e}")


# 입력: session (세션 객체), student_id (학번, 캐싱용)
# 기능: 전체 수강 과목의 공지사항 통합 크롤링
# 반환: 공지 리스트
# ThreadPoolExecutor를 사용한 멀티스레드 병렬 크롤링
def crawl_all_notices(session, student_id=None, common_board_ids=None):
    if common_board_ids is None:
        common_board_ids = COMMON_BOARD_IDS

    all_notices = []
    courses = get_enrolled_courses(session, student_id=student_id)
    if not courses:
        return []

    # 과목별 처리를 위한 래퍼 함수 정의 (예외 처리를 개별적으로 수행하기 위함)
    def worker(course_info):
        cid, cdata = course_info
        # cdata가 딕셔너리인 경우와 문자열인 경우 모두 대응
        cname = cdata['name'] if isinstance(cdata, dict) else str(cdata)
        try:
            return get_notices_for_course(session, cid, cname, common_board_ids=common_board_ids)
        except SessionExpiredError:
            return None
        except Exception:
            return []

    # 최대 스레드 수는 수강 과목 수에 맞춤
    with ThreadPoolExecutor(max_workers=7) as executor:
        results = executor.map(worker, courses.items())
        
        for notice_list in results:
            if notice_list is None:
                raise SessionExpiredError("LMS 세션이 만료되었습니다.")
            
            if notice_list:
                all_notices.extend(notice_list)

    # 최신 날짜 순 정렬
    all_notices.sort(key=lambda x: x['date'], reverse=True)

    return all_notices

# 입력: session (requests.Session 객체)
# 기능: LMS 받은 쪽지 목록 크롤링
# 반환: 쪽지 정보 딕셔너리 리스트
def crawl_all_messages(session):
    url = "https://lms.chungbuk.ac.kr/local/ubsend/message/"
    messages = []
    
    try:
        resp = session.get(url, timeout=10, allow_redirects=False)
        if resp.status_code in [302, 401]:
            raise SessionExpiredError("LMS 세션이 만료되었습니다.")
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # 실제 LMS 구조: table이 아니라 <li class="media"> 형태의 리스트임
        message_items = soup.select('li.media')
        
        for idx, item in enumerate(message_items):
            body = item.select_one('div.media-body')
            if not body:
                continue
                
            link_tag = body.select_one('a')
            if not link_tag:
                continue
                
            # 1. 보낸 사람 (h4.media-heading)
            sender_tag = link_tag.select_one('h4.media-heading')
            sender = sender_tag.get_text(strip=True) if sender_tag else "알 수 없음"
            
            # 2. 날짜 (div.time)
            time_tag = link_tag.select_one('div.time')
            date = time_tag.get_text(strip=True) if time_tag else ""
            
            # 3. 내용 (div.msg)
            msg_tag = link_tag.select_one('div.msg')
            content = msg_tag.get_text(strip=True) if msg_tag else ""
            
            # 4. 상세 페이지 URL
            href = link_tag.get('href', '')
            url_link = href if href.startswith('http') else f"https://lms.chungbuk.ac.kr{href}"
            
            message_id = f"{sender}-{idx}"
            
            messages.append({
                'message_id': message_id,
                'sender': sender,
                'content': content,
                'date': date,
                'url': url_link
            })
            
        return messages
        
    except SessionExpiredError:
        raise
    except Exception as e:
        logger.error(f"쪽지 크롤링 중 오류: {e}")
        return []