import pytest
import importlib
import urllib.parse
from unittest.mock import patch, MagicMock
from requests.exceptions import HTTPError

from lms_crawler import (
    get_course_sort_key,
    get_enrolled_courses,
    get_user_profile,
    get_assignments_for_course,
    crawl_all_assignments,
    get_assignment_detail,
    SessionExpiredError
)

# ─── get_course_sort_key 테스트 ──────────────────────────────────────────

def test_get_course_sort_key():
    """과목명 정렬 우선순위를 검증한다. (한글 > 영어 > 숫자 > 기타)"""
    assert get_course_sort_key("가나다")[0] == 0
    assert get_course_sort_key("apple")[0] == 1
    assert get_course_sort_key("123")[0] == 2
    assert get_course_sort_key("!@#")[0] == 3
    assert get_course_sort_key("")[0] == 4
    assert get_course_sort_key(None)[0] == 4
    assert get_course_sort_key(123)[0] == 2

# ─── get_enrolled_courses 보강 테스트 ──────────────────────────────────────

@patch("redis_cache.get_cached_courses")
def test_get_enrolled_courses_from_cache(mock_get_cache):
    """캐시된 과목 정보가 있을 때 정렬되어 반환되는지 테스트."""
    mock_get_cache.return_value = {
        "2": {"name": "가나다", "type": "regular"},
        "1": {"name": "abc", "type": "regular"}
    }
    result = get_enrolled_courses(MagicMock(), student_id="user1")
    assert list(result.keys()) == ["2", "1"]

def test_get_enrolled_courses_status_codes():
    """302 및 401 응답 시 세션 만료 예외 발생 확인."""
    mock_session = MagicMock()
    mock_session.get.return_value = MagicMock(status_code=302)
    with pytest.raises(SessionExpiredError):
        get_enrolled_courses(mock_session)
    mock_session.get.return_value = MagicMock(status_code=401)
    with pytest.raises(SessionExpiredError):
        get_enrolled_courses(mock_session)

@patch("storage.get_user_courses")
@patch("redis_cache.get_cached_courses")
def test_get_enrolled_courses_backup_logic(mock_get_cache, mock_get_db):
    """크롤링 실패 시 DB에서 백업 데이터를 로드하는지 테스트."""
    mock_session = MagicMock()
    mock_session.get.return_value = MagicMock(status_code=200, text="<html></html>")
    mock_get_cache.return_value = None
    # DB 반환값 형식을 실제와 동일하게 딕셔너리로 설정
    mock_get_db.return_value = {"999": {"name": "백업과목", "type": "regular"}}
    
    result = get_enrolled_courses(mock_session, student_id="user1")
    assert "999" in result
    assert result["999"]["name"] == "백업과목"

def test_get_enrolled_courses_complex_parsing():
    """복잡한 HTML 구조 및 '진행중' 텍스트 파싱 테스트."""
    mock_session = MagicMock()
    # title 속성 패턴(괄호 코드 포함) 및 '진행중' 분기 커버
    html = """
    <html>
        <a href="course/view.php?id=201" title="알고리즘 (20261-001)"></a>
        <div class="badge-coursetype-on"></div>
        
        <a href="course/view.php?id=202">
            <span>진행중</span>
            <span>데이터베이스</span>
        </a>
    </html>
    """
    mock_session.get.return_value = MagicMock(status_code=200, text=html)
    
    result = get_enrolled_courses(mock_session)
    assert result["201"]["name"] == "알고리즘"
    assert result["201"]["type"] == "comparative"
    assert result["202"]["name"] == "데이터베이스"

def test_sort_courses_bad_data_handling():
    """데이터 형식이 비정상적일 때 정렬 헬퍼 함수가 안전하게 동작하는지 테스트."""
    from lms_crawler import get_enrolled_courses
    mock_session = MagicMock()
    # 크롤링 성공했으나 과목명이 없는 등의 상황 시뮬레이션
    html = '<a href="course/view.php?id=1"></a>'
    mock_session.get.return_value = MagicMock(status_code=200, text=html)
    
    # 예외가 발생하지 않고 빈 결과가 나오거나 안전하게 리턴되어야 함
    result = get_enrolled_courses(mock_session)
    assert isinstance(result, dict)

# ─── get_user_profile 보강 테스트 ──────────────────────────────────────────

def test_get_user_profile_success_variant():
    """다른 sesskey 패턴과 상세 학과 파싱 로직 테스트."""
    mock_session = MagicMock()
    mock_resp1 = MagicMock(status_code=200, text='sesskey=xyz789') # query string 패턴
    
    profile_html = """
    <h4 class="username"> 이몽룡 </h4>
    <div class="department">
        공과대학<br>컴퓨터공학과
    </div>
    """
    mock_resp2 = MagicMock(status_code=200)
    mock_resp2.json.return_value = {"html": profile_html}
    
    mock_session.get.return_value = mock_resp1
    mock_session.post.return_value = mock_resp2
    
    result = get_user_profile(mock_session, "20240002")
    assert result["name"] == "이몽룡"
    assert result["department"] == "컴퓨터공학과"

def test_get_user_profile_errors():
    """프로필 추출 시 다양한 에러 상황 테스트."""
    mock_session = MagicMock()
    mock_session.get.return_value = MagicMock(status_code=200, text="no sesskey")
    with pytest.raises(Exception, match="sesskey"):
        get_user_profile(mock_session, "user1")
        
    mock_session.get.return_value = MagicMock(status_code=200, text='"sesskey":"abc"')
    mock_session.post.return_value = MagicMock(status_code=200, text="")
    with pytest.raises(Exception, match="비어 있습니다"):
        get_user_profile(mock_session, "user1")

# ─── get_assignments_for_course 보강 테스트 ───────────────────────────────

def test_get_assignments_for_course_error():
    """과제 목록 크롤링 시 일반 예외 발생 처리 테스트."""
    mock_session = MagicMock()
    mock_session.get.side_effect = Exception("Network Down")
    with pytest.raises(Exception, match="과제 추출 중 오류"):
        get_assignments_for_course(mock_session, "101", "과목")

def test_get_assignments_date_parsing_edge_cases():
    """과제 마감일 날짜 형식이 특이할 때의 파싱 테스트."""
    mock_session = MagicMock()
    # tbody를 추가하여 rows 탐색 성공 유도
    html = """
    <table class="generaltable">
        <tbody>
            <tr>
                <td>1</td>
                <td><a href="?id=1">과제</a></td>
                <td>2026년 6월 1일 9:0</td>
                <td>제출</td>
            </tr>
        </tbody>
    </table>
    """
    mock_session.get.return_value = MagicMock(status_code=200, text=html)
    result = get_assignments_for_course(mock_session, "101", "과목")
    assert len(result) == 1
    assert "2026-06-01T09:00:00" in result[0]["due_date"]

# ─── get_assignment_detail 보강 테스트 ──────────────────────────────────────

def test_get_assignment_detail_complex():
    """상세 페이지 파싱 및 이미지/파일 경로 변환 보강 테스트."""
    mock_session = MagicMock()
    html = """
    <h2 class="main">과제명</h2>
    <div class="assignmentintro">
        <img src="/pluginfile.php/1.jpg">
        <a href="/pluginfile.php/2.pdf">파일</a>
    </div>
    """
    mock_session.get.return_value = MagicMock(status_code=200, text=html)
    result = get_assignment_detail(mock_session, "1")
    assert result["title"] == "과제명"
    assert "https://lms.chungbuk.ac.kr/pluginfile.php/1.jpg" in result["description_html"]
    assert len(result["attachments"]) == 1

def test_get_assignment_detail_status_codes():
    """상세 페이지 302/401 세션 만료 테스트."""
    mock_session = MagicMock()
    mock_session.get.return_value = MagicMock(status_code=401)
    with pytest.raises(SessionExpiredError):
        get_assignment_detail(mock_session, "1")

# ─── crawl_all_assignments 보강 테스트 ──────────────────────────────────────

@patch("lms_crawler.get_enrolled_courses")
@patch("lms_crawler.get_assignments_for_course")
def test_crawl_all_assignments_worker_error(mock_get_assigns, mock_get_courses):
    """특정 과목 크롤링 중 에러가 발생해도 다른 과목은 정상 수집되는지 테스트."""
    mock_session = MagicMock()
    mock_get_courses.return_value = {"1": "과목1", "2": "과목2"}
    # 첫 번째 과목은 에러, 두 번째는 성공
    mock_get_assigns.side_effect = [Exception("Error"), [{"assignment_id": "99", "due_date": "2026"}]]
    
    result = crawl_all_assignments(mock_session, "user1")
    assert len(result) == 1
    assert result[0]["assignment_id"] == "99"

# ─── 모듈 복구 픽스처 ──────────────────────────────────────────────────

@pytest.fixture(scope="module", autouse=True)
def restore_lms_module():
    yield
    importlib.reload(importlib.import_module("lms_crawler"))
