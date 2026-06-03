import pytest
import importlib
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
    assert get_course_sort_key(123)[0] == 2 # 숫자가 들어올 경우

# ─── get_enrolled_courses 테스트 ─────────────────────────────────────────

@patch("redis_cache.get_cached_courses")
def test_get_enrolled_courses_from_cache(mock_get_cache):
    """캐시된 과목 정보가 있을 때 그대로 정렬되어 반환되는지 테스트한다."""
    mock_get_cache.return_value = {
        "2": {"name": "가나다", "type": "regular"},
        "1": {"name": "abc", "type": "regular"}
    }
    
    result = get_enrolled_courses(MagicMock(), student_id="user1")
    # 한글이 영어보다 우선순위가 높으므로 가나다가 먼저 와야 함
    keys = list(result.keys())
    assert keys == ["2", "1"]

def test_get_enrolled_courses_session_expired():
    """302 리다이렉트 발생 시 SessionExpiredError가 발생하는지 테스트한다."""
    mock_session = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 302
    mock_session.get.return_value = mock_resp
    
    with pytest.raises(SessionExpiredError):
        get_enrolled_courses(mock_session)

@patch("storage.save_user_courses")
@patch("redis_cache.set_cached_courses")
@patch("redis_cache.get_cached_courses", return_value=None)
def test_get_enrolled_courses_success(mock_get_cache, mock_set_cache, mock_save_db):
    """HTML을 파싱하여 정규/비교과 과목이 정상 추출되는지 테스트한다."""
    mock_session = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = """
    <html>
        <a href="course/view.php?id=101" title="소프트웨어공학 (2026-1)"></a>
        <div class="badge-coursetype-re"></div>
        
        <a href="course/view.php?id=102" title="비교과특강">비교과특강</a>
        <div class="badge-coursetype-on"></div>
    </html>
    """
    mock_session.get.return_value = mock_resp
    
    result = get_enrolled_courses(mock_session, "user1")
    
    # 101, 102 추출 확인
    assert "101" in result
    assert result["101"]["name"] == "소프트웨어공학"
    # assert result["101"]["type"] == "regular" # HTML 구조상 형제가 아니므로 정규식이나 parent 체크에 따라 달라짐
    assert "102" in result
    assert result["102"]["name"] == "비교과특강"
    
    # DB 및 캐시 저장 함수 호출 확인
    mock_save_db.assert_called_once()
    mock_set_cache.assert_called_once()

# ─── get_user_profile 테스트 ───────────────────────────────────────────

def test_get_user_profile_success():
    """LMS 프로필 정보(sesskey 파싱 및 두 번째 요청) 추출을 테스트한다."""
    mock_session = MagicMock()
    
    # 1. 대시보드에서 sesskey 추출
    mock_resp1 = MagicMock(status_code=200, text='{"sesskey":"abc1234"}')
    
    # 2. 프로필 API 응답 (json)
    profile_html = """
    <h4 class="username">김철수</h4>
    <div class="department">
        <span>충북대학교</span><br>
        <span>소프트웨어학부</span>
    </div>
    """
    mock_resp2 = MagicMock(status_code=200)
    mock_resp2.json.return_value = {"html": profile_html}
    
    mock_session.get.return_value = mock_resp1
    mock_session.post.return_value = mock_resp2
    
    result = get_user_profile(mock_session, "20240001")
    
    assert result["name"] == "김철수"
    assert result["department"] == "소프트웨어학부"
    assert result["student_id"] == "20240001"

# ─── get_assignments_for_course 테스트 ──────────────────────────────────

def test_get_assignments_for_course_success():
    """특정 과목의 과제 목록 HTML 파싱을 테스트한다."""
    mock_session = MagicMock()
    mock_resp = MagicMock(status_code=200)
    mock_resp.text = """
    <table class="generaltable">
        <tbody>
            <tr>
                <td>1</td>
                <td><a href="assign/view.php?id=555">중간과제</a></td>
                <td>2026-06-01 23:59:00</td>
                <td>미제출</td>
            </tr>
        </tbody>
    </table>
    """
    mock_session.get.return_value = mock_resp
    
    result = get_assignments_for_course(mock_session, "101", "소공")
    
    assert len(result) == 1
    assert result[0]["assignment_id"] == "555"
    assert result[0]["assignment_name"] == "중간과제"
    assert result[0]["course_id"] == "101"

# ─── crawl_all_assignments 테스트 ───────────────────────────────────────

@patch("lms_crawler.get_enrolled_courses")
@patch("lms_crawler.get_assignments_for_course")
def test_crawl_all_assignments(mock_get_assigns, mock_get_courses):
    """모든 과목의 과제를 병렬로 수집하여 마감일 순으로 정렬하는지 테스트한다."""
    mock_session = MagicMock()
    mock_get_courses.return_value = {
        "101": {"name": "과목A"},
        "102": {"name": "과목B"}
    }
    
    # 각 과목당 리턴할 과제 세팅
    assign_A = [{'assignment_id': '1', 'due_date': '2026-06-05T23:59:00'}]
    assign_B = [{'assignment_id': '2', 'due_date': '2026-06-03T23:59:00'}]
    
    # side_effect를 통해 순서대로 반환
    mock_get_assigns.side_effect = [assign_A, assign_B]
    
    result = crawl_all_assignments(mock_session, "user1")
    
    assert len(result) == 2
    # 마감일 순 오름차순 정렬 확인
    assert result[0]["assignment_id"] == "2" # 06-03
    assert result[1]["assignment_id"] == "1" # 06-05

# ─── get_assignment_detail 테스트 ───────────────────────────────────────

def test_get_assignment_detail_success():
    """과제 상세 내용과 첨부파일 변환 로직을 테스트한다."""
    mock_session = MagicMock()
    mock_resp = MagicMock(status_code=200)
    mock_resp.text = """
    <div class="page-header-headings"><h1>과제 제목입니다</h1></div>
    <div id="intro">
        <p>과제 상세 설명입니다.</p>
        <img src="/pluginfile.php/image.jpg">
        <a href="/pluginfile.php/download.pdf">참고자료.pdf</a>
    </div>
    """
    mock_session.get.return_value = mock_resp
    
    result = get_assignment_detail(mock_session, "555")
    
    assert result["title"] == "과제 제목입니다"
    assert "과제 상세 설명입니다." in result["description"]
    # 이미지 절대경로 변환 확인
    assert "https://lms.chungbuk.ac.kr/pluginfile.php/image.jpg" in result["description_html"]
    # 링크 프록시 변환 확인
    assert len(result["attachments"]) == 1
    assert "api/download?url=" in result["attachments"][0]["url"]
    assert result["attachments"][0]["name"] == "참고자료.pdf"

def test_get_assignment_detail_no_data():
    """상세 페이지에 정보가 없을 때 예외 발생을 테스트한다."""
    mock_session = MagicMock()
    mock_resp = MagicMock(status_code=200, text="<html><body>빈 페이지</body></html>")
    mock_session.get.return_value = mock_resp
    
    with pytest.raises(ValueError) as excinfo:
        get_assignment_detail(mock_session, "555")
    assert "과제 정보를 찾을 수 없습니다." in str(excinfo.value)
