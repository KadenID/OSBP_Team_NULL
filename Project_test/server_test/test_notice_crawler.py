import pytest
from unittest.mock import MagicMock, patch
import logging

from notice_crawler import get_notices_for_course, get_notice_detail, crawl_all_notices, crawl_all_messages
from lms_crawler import SessionExpiredError

# 테스트 중 불필요한 로깅 출력을 방지하기 위해 에러 로그 무시 설정
logging.getLogger('notice_crawler').setLevel(logging.CRITICAL)

# ─── crawl_all_notices 테스트 영역 ───────────────────────────────────────

@patch('notice_crawler.get_enrolled_courses')
@patch('notice_crawler.get_notices_for_course')
def test_crawl_all_notices_success_integration(mock_get_notices, mock_get_courses, mock_session):
    """여러 수강 과목이 있을 때 병렬로 크롤링하고 최신 날짜 순으로 정렬을 잘 수행하는가"""
    mock_get_courses.return_value = {
        "c1": {"name": "과목1"},
        "c2": {"name": "과목2"}
    }
    
    notice_c1 = [{'notice_id': 'n1', 'date': '2026-06-01', 'title': '과목1 공지'}]
    notice_c2 = [{'notice_id': 'n2', 'date': '2026-06-03', 'title': '과목2 공지'}]
    mock_get_notices.side_effect = [notice_c1, notice_c2]
    
    result = crawl_all_notices(mock_session, student_id="202600001")
    
    assert len(result) == 2
    assert result[0]['notice_id'] == 'n2'
    assert result[1]['notice_id'] == 'n1'

@patch('notice_crawler.get_enrolled_courses')
@patch('notice_crawler.get_notices_for_course')
def test_crawl_all_notices_partial_failure(mock_get_notices, mock_get_courses, mock_session):
    """특정 과목 공지 크롤링 중 세션 만료 발생 시 전체 크롤러가 예외를 상위로 전파하는가"""
    mock_get_courses.return_value = {
        "c1": {"name": "과목1"},
        "c2": {"name": "과목2"}
    }
    
    # c1 호출 시 SessionExpiredError 발생하도록 세팅
    mock_get_notices.side_effect = [SessionExpiredError("Expired"), [{'notice_id': 'n2'}]]
    
    with pytest.raises(SessionExpiredError):
        crawl_all_notices(mock_session, "202600001")

@patch('notice_crawler.get_enrolled_courses')
@patch('notice_crawler.get_notices_for_course')
def test_crawl_all_notices_general_exception_worker(mock_get_notices, mock_get_courses, mock_session):
    """특정 과목 크롤링 중 세션 만료 외의 일반 예외가 나면 해당 과목만 빈 리스트로 스킵되는가"""
    mock_get_courses.return_value = {
        "c1": "과목1 문자열형태", # cdata가 dict가 아닌 str인 분기 커버
        "c2": {"name": "과목2"}
    }
    
    # 첫 번째 과목은 RuntimeException 발생, 두 번째는 정상 반환
    mock_get_notices.side_effect = [RuntimeError("DB Crash"), [{'notice_id': 'n2', 'date': '2026-06-02'}]]
    
    result = crawl_all_notices(mock_session, "202600001")
    assert len(result) == 1
    assert result[0]['notice_id'] == 'n2'

@patch('notice_crawler.get_enrolled_courses')
def test_crawl_all_notices_empty_course(mock_get_courses, mock_session):
    """수강 중인 과목 목록이 빈 딕셔너리거나 None일 때 빈 리스트를 반환하는가"""
    mock_get_courses.return_value = {}
    result = crawl_all_notices(mock_session, student_id="202600001")
    assert result == []

    mock_get_courses.return_value = None
    result = crawl_all_notices(mock_session, student_id="202600001")
    assert result == []

@patch('notice_crawler.get_notices_for_course')
@patch('notice_crawler.get_enrolled_courses')
def test_crawl_all_notices_default_board_ids(mock_get_courses, mock_get_notices, mock_session):
    """common_board_ids 인자를 넘기지 않았을 때 기본 고정값(COMMON_BOARD_IDS)이 매핑되는가"""
    mock_get_courses.return_value = {"c1": {"name": "과목1"}}
    mock_get_notices.return_value = []
    
    crawl_all_notices(mock_session, "202600001")
    
    args, kwargs = mock_get_notices.call_args
    assert 'common_board_ids' in kwargs
    assert kwargs['common_board_ids'] == {'17'}


# ─── get_notices_for_course 테스트 영역 ───────────────────────────────────

def test_get_notices_for_course_session_expired(mock_session):
    """코스 홈 또는 게시판 목록 진입 시 302/401 응답 코드를 받으면 세션 만료 예외가 발생하는가"""
    mock_resp = MagicMock(status_code=302)
    mock_session.get.return_value = mock_resp

    with pytest.raises(SessionExpiredError):
        get_notices_for_course(mock_session, "course123", "과목A")

@patch('notice_crawler.BeautifulSoup')
def test_get_notices_for_course_no_board_id(mock_bs, mock_session):
    """강의실 홈에서 유효한 공지사항 board_id 링크를 전혀 찾지 못했을 때 빈 리스트를 리턴하는가"""
    mock_resp = MagicMock(status_code=200, text="홈 HTML")
    mock_session.get.return_value = mock_resp
    
    # 유효하지 않은 링크 구성으로 bid 추출 실패 유도
    mock_a = MagicMock()
    mock_a.__getitem__.return_value = "https://lms.chungbuk.ac.kr/mod/ubboard/view.php?id=course123" # course_id와 같아서 스킵됨
    mock_soup = MagicMock()
    mock_soup.find_all.return_value = [mock_a]
    mock_bs.return_value = mock_soup
    
    result = get_notices_for_course(mock_session, "course123", "과목A")
    assert result == []

@patch('notice_crawler.BeautifulSoup')
def test_get_notices_for_course_board_session_expired(mock_bs, mock_session):
    """강의실 홈은 통과했으나 게시판 목록을 받아올 때 세션이 만료(302)되면 예외를 터트리는가"""
    mock_resp_home = MagicMock(status_code=200, text="홈 HTML")
    mock_resp_board = MagicMock(status_code=302) # 게시판 요청 시 만료
    mock_session.get.side_effect = [mock_resp_home, mock_resp_board]

    mock_a = MagicMock()
    mock_a.__getitem__.return_value = "https://lms.chungbuk.ac.kr/mod/ubboard/view.php?id=999"
    mock_soup = MagicMock()
    mock_soup.find_all.return_value = [mock_a]
    mock_bs.return_value = mock_soup

    with pytest.raises(SessionExpiredError):
        get_notices_for_course(mock_session, "course123", "과목A")

@patch('notice_crawler.BeautifulSoup')
def test_get_notices_for_course_general_exception(mock_bs, mock_session):
    """공지 목록을 파싱하는 도중 예상치 못한 에러가 잡혔을 때 로깅 후 빈 리스트를 반환하는가"""
    mock_session.get.side_effect = Exception("Fatal Network Error")
    result = get_notices_for_course(mock_session, "course123", "과목A")
    assert result == []

@patch('notice_crawler.BeautifulSoup')
def test_get_notices_for_course_success_parsing(mock_bs, mock_session):
    """상단 고정 공지와 하단 일반 테이블 목록을 필드별로 분기 조건에 맞춰 완벽히 파싱하는가"""
    mock_resp_home = MagicMock(status_code=200, text="홈")
    mock_resp_board = MagicMock(status_code=200, text="게시판")
    mock_session.get.side_effect = [mock_resp_home, mock_resp_board]

    mock_soup_home = MagicMock()
    mock_a_link = MagicMock()
    mock_a_link.__getitem__.return_value = "https://lms.chungbuk.ac.kr/mod/ubboard/view.php?id=555"
    mock_soup_home.find_all.return_value = [mock_a_link]

    mock_soup_board = MagicMock()
    
    # 1. 상단 고정 공지 영역 매핑
    mock_subject = MagicMock(get_text=lambda strip: "상단 고정 공지 제목")
    mock_subject_box = MagicMock()
    mock_top_link = MagicMock()
    mock_top_link.get.return_value = "https://lms.chungbuk.ac.kr/mod/ubboard/article.php?bwid=9999&id=555"
    mock_subject_box.find.return_value = mock_top_link
    
    mock_info = MagicMock()
    mock_col1 = MagicMock(get_text=lambda strip: "작성자 : 홍길동")
    mock_col2 = MagicMock(get_text=lambda strip: "작성일 : 2026-06-01")
    mock_info.select.return_value = [mock_col1, mock_col2]
    
    mock_content = MagicMock(get_text=lambda separator, strip: "고정 공지 내용")

    # 2. 하단 일반 테이블 목록 매핑 (컬럼 누락 로우 스킵 분기 포함)
    mock_table = MagicMock()
    mock_row_invalid = MagicMock() # 데이터 개수 부족 채우기용 스킵 타겟
    mock_row_invalid.find_all.return_value = [MagicMock()] 
    
    mock_row_no_a = MagicMock() # 링크 태그 없는 스킵 타겟
    mock_row_no_a.find_all.return_value = [MagicMock(), MagicMock(find=lambda x: None), MagicMock(), MagicMock()]

    mock_row_success = MagicMock() # 정상 파싱 타겟
    mock_td_num = MagicMock(get_text=lambda strip: "1")
    mock_td_title = MagicMock()
    mock_list_a = MagicMock(get_text=lambda strip: "일반 목록 공지 제목")
    mock_list_a.get.return_value = "https://lms.chungbuk.ac.kr/mod/ubboard/article.php?bwid=8888&id=555"
    mock_td_title.find.return_value = mock_list_a
    mock_td_writer = MagicMock(get_text=lambda strip: "이순신")
    mock_td_date = MagicMock(get_text=lambda strip: "2026-06-02")
    mock_row_success.find_all.return_value = [mock_td_num, mock_td_title, mock_td_writer, mock_td_date]
    
    mock_table.find_all.return_value = [mock_row_invalid, mock_row_no_a, mock_row_success]

    def board_select_one_side_effect(selector):
        if 'div.article-subject h3' in selector: return mock_subject
        if 'div.article-subject' in selector: return mock_subject_box
        if 'div.article-info' in selector: return mock_info
        if 'div.article-content div.text_to_html' in selector: return mock_content
        if 'table.table-ubboard-list tbody' in selector: return mock_table
        return None

    mock_soup_board.select_one.side_effect = board_select_one_side_effect
    mock_bs.side_effect = [mock_soup_home, mock_soup_board]

    notices = get_notices_for_course(mock_session, "course_123", "소프트웨어공학")

    assert len(notices) == 2
    assert notices[0]['notice_id'] == "9999"
    assert notices[1]['notice_id'] == "8888"


# ─── get_notice_detail 테스트 영역 ────────────────────────────────────────

def test_get_notice_detail_session_expired(mock_session):
    """공지 상세 내용 조회 시 세션 만료 응답 코드를 잡아서 처리하는가"""
    mock_resp = MagicMock(status_code=401)
    mock_session.get.return_value = mock_resp

    with pytest.raises(SessionExpiredError):
        get_notice_detail(mock_session, "board123", "notice123")

@patch('notice_crawler.BeautifulSoup')
def test_get_notice_detail_not_found(mock_bs, mock_session):
    """에러 박스(alert-danger) 감지 시 ValueError 및 상위 커스텀 Exception을 던지는가"""
    mock_resp = MagicMock(status_code=200, text="Error Page")
    mock_session.get.return_value = mock_resp

    mock_soup = MagicMock()
    mock_error_box = MagicMock()
    mock_error_box.get_text.return_value = "존재하지 않는 게시글입니다."
    
    # title_tag가 아예 비어있거나 error_box 내 '존재하지' 문자열이 매칭될 때의 분기 검증
    mock_soup.select_one.side_effect = lambda selector: mock_error_box if 'alert-danger' in selector else None
    mock_bs.return_value = mock_soup

    with pytest.raises(Exception) as context:
        get_notice_detail(mock_session, "board123", "notice123")
        
    assert "존재하지 않는 공지사항입니다" in str(context.value)

@patch('notice_crawler.BeautifulSoup')
def test_get_notice_detail_success_parsing(mock_bs, mock_session):
    """상세 공지의 제목, 작성일, 조교/교수 정보, 이미지 주소 변환 및 다중 첨부파일 배열까지 전부 완벽 파싱하는가"""
    mock_resp = MagicMock(status_code=200, text="Detail HTML")
    mock_session.get.return_value = mock_resp

    mock_soup = MagicMock()
    
    # 타이틀 및 본문 html 노드 mock 세팅
    mock_title_tag = MagicMock()
    mock_title_tag.get_text.return_value = "팀 NULL 프로젝트 공지사항"
    
    mock_img_tag = MagicMock()
    img_store = {'src': '/images/test.png'}
    mock_img_tag.get.side_effect = lambda key, default=None: img_store.get(key, default)
    mock_img_tag.__getitem__.side_effect = lambda key: img_store[key]
    mock_img_tag.__setitem__.side_effect = lambda key, val: img_store.__setitem__(key, val)
    
    mock_content_tag = MagicMock()
    mock_content_tag.get_text.return_value = "본문 내용입니다."
    mock_content_tag.find_all.return_value = [mock_img_tag]
    mock_content_tag.__str__.return_value = "<div><img src='/images/test.png'>본문</div>"

    # 작성자, 작성일, 조회수 다중 메타데이터 정보 대응
    mock_col1 = MagicMock()
    mock_col1.get_text.return_value = "작성자 : 관리자"
    mock_col2 = MagicMock()
    mock_col2.get_text.return_value = "작성일 : 2026-06-02"
    mock_col3 = MagicMock()
    mock_col3.get_text.return_value = "조회수 : 45"
    mock_soup.select.return_value = [mock_col1, mock_col2, mock_col3]

    # 첨부파일 경로 조합 추출 mock 세팅
    mock_file_link = MagicMock()
    mock_file_link.__getitem__.return_value = "/mod/ubboard/download.php?id=1"
    mock_file_link.get_text.return_value = "과제명세서.pdf"
    mock_files_container = MagicMock()
    mock_files_container.find_all.return_value = [mock_file_link]

    def detail_select_one_side_effect(selector):
        if 'alert-danger' in selector or 'notice' in selector: return None
        if 'article-subject h3' in selector: return mock_title_tag
        if 'text_to_html' in selector: return mock_content_tag
        if 'article-files' in selector: return mock_files_container
        return None

    mock_soup.select_one.side_effect = detail_select_one_side_effect
    mock_bs.return_value = mock_soup

    result = get_notice_detail(mock_session, "board123", "notice123")
    
    assert result['title'] == "팀 NULL 프로젝트 공지사항"
    assert result['writer'] == "관리자"
    assert result['views'] == "45"
    assert result['attachments'][0]['url'] == "https://lms.chungbuk.ac.kr/mod/ubboard/download.php?id=1"
    
    assert img_store['src'] == "https://lms.chungbuk.ac.kr/images/test.png"

@patch('notice_crawler.BeautifulSoup')
def test_get_notice_detail_no_content_or_files(mock_bs, mock_session):
    """본문 글이나 첨부파일 컨테이너가 전혀 없는 빈 상태일 때 기본값 처리가 안전하게 이루어지는가"""
    mock_resp = MagicMock(status_code=200)
    mock_session.get.return_value = mock_resp
    
    mock_soup = MagicMock()
    mock_title_tag = MagicMock()
    mock_title_tag.get_text.return_value = "텍스트 제목"
    
    mock_soup.select_one.side_effect = lambda selector: mock_title_tag if 'article-subject h3' in selector else None
    mock_soup.select.return_value = [] # 빈 메타정보 리스트
    mock_bs.return_value = mock_soup
    
    result = get_notice_detail(mock_session, "board123", "notice123")
    
    assert result['title'] == "텍스트 제목"
    assert result['attachments'] == []
    assert result['description'] == ""


# ─── crawl_all_messages 테스트 영역 ───────────────────────────────────────

def test_crawl_all_messages_session_expired(mock_session):
    """쪽지함 리스트 요청 시 세션 만료 응답 상태 코드가 반환되면 예외를 정상 처리하는가"""
    mock_resp = MagicMock(status_code=302)
    mock_session.get.return_value = mock_resp

    with pytest.raises(SessionExpiredError):
        crawl_all_messages(mock_session)

@patch('notice_crawler.BeautifulSoup')
def test_crawl_all_messages_parsing(mock_bs, mock_session):
    """쪽지함 미디어 아이템 노드 데이터 파싱 시 유효하지 않은 분기를 건너뛰고 정상 데이터만 추출하는가"""
    mock_resp = MagicMock(status_code=200, text="Message HTML")
    mock_session.get.return_value = mock_resp

    mock_soup = MagicMock()
    
    # 1. 스킵될 바디 없는 아이템
    mock_item_no_body = MagicMock(select_one=lambda sel: None if 'media-body' in sel else MagicMock())
    
    # 2. 스킵될 링크 없는 아이템
    mock_body_no_link = MagicMock(select_one=lambda sel: None if 'a' in sel else MagicMock())
    mock_item_no_link = MagicMock(select_one=lambda sel: mock_body_no_link if 'media-body' in sel else None)
    
    # 3. 모든 요소가 다 정상적으로 포함된 정석 아이템
    mock_item_success = MagicMock()
    mock_body = MagicMock()
    mock_link = MagicMock()
    
    mock_sender = MagicMock(get_text=lambda strip: "담당교수A")
    mock_time = MagicMock(get_text=lambda strip: "2026-06-02 14:25")
    mock_msg = MagicMock(get_text=lambda strip: "테스트 쪽지 내용입니다.")

    mock_link.select_one.side_effect = lambda sel: (
        mock_sender if "media-heading" in sel else 
        mock_time if "time" in sel else 
        mock_msg if "msg" in sel else None
    )
    mock_link.get.return_value = "/local/ubsend/message/detail.php"
    
    mock_body.select_one.return_value = mock_link
    mock_item_success.select_one.return_value = mock_body
    
    mock_soup.select.return_value = [mock_item_no_body, mock_item_no_link, mock_item_success]
    mock_bs.return_value = mock_soup

    messages = crawl_all_messages(mock_session)
    
    assert len(messages) == 1
    assert messages[0]['sender'] == "담당교수A"
    assert messages[0]['content'] == "테스트 쪽지 내용입니다."
    assert messages[0]['url'] == "https://lms.chungbuk.ac.kr/local/ubsend/message/detail.php"

@patch('notice_crawler.BeautifulSoup')
def test_crawl_all_messages_empty_or_exception(mock_bs, mock_session):
    """쪽지함 리스트에 항목이 아예 없거나 파싱 에러 발생 시 빈 배열을 안전하게 리턴하는가"""
    mock_resp = MagicMock(status_code=200)
    mock_session.get.return_value = mock_resp
    
    # 빈 목록 처리 반환
    mock_soup = MagicMock()
    mock_soup.select.return_value = []
    mock_bs.return_value = mock_soup
    
    messages = crawl_all_messages(mock_session)
    assert messages == []

    # 통신 장애 등으로 인한 예외 분기 커버
    mock_session.get.side_effect = Exception("Crash Message Center")
    messages = crawl_all_messages(mock_session)
    assert messages == []