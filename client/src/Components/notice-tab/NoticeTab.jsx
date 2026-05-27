import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import DOMPurify from 'dompurify';
import './NoticeTab.css';
import '../assignment-tab/AssignmentDetail.css';
import { API_BASE_URL } from '../../apiConfig';


// Zustand 스토어
const useLMSStore = create((set, get) => ({
  notices: { data: [], isLoading: false, isFetched: false },
  messages: { data: [], isLoading: false, isFetched: false },

  fetchData: async (type, accessToken) => {
    const state = get()[type];
    if (state.isFetched || !accessToken) return;

    set((prev) => ({ ...prev, [type]: { ...prev[type], isLoading: true } }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/${type}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        credentials: 'include'
      });

      if (!response.ok) throw new Error(`Status: ${response.status}`);

      const result = await response.json();
      if (result.success) {
        set((prev) => ({ ...prev, [type]: { data: result.data, isLoading: false, isFetched: true } }));
      }
    } catch (error) {
      console.error(`${type} 로드 실패:`, error);
      set((prev) => ({ ...prev, [type]: { ...prev[type], isLoading: false } }));
    }
  }
}));

// 색상 변수 목록
const COLOR_VARS = [
  'var(--tag-color-0)', 'var(--tag-color-1)', 'var(--tag-color-2)', 
  'var(--tag-color-3)', 'var(--tag-color-4)', 'var(--tag-color-5)', 
  'var(--tag-color-6)', 'var(--tag-color-7)', 'var(--tag-color-8)', 
  'var(--tag-color-9)'
];

// 문자를 입력받아 css 변수명 변경(과목 색 변경) - 폴백 및 쪽지함 발신자용
const getColorForString = (str) => {
  if (!str) return 'var(--text-main)';
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % COLOR_VARS.length;
  return COLOR_VARS[index];
};

function NoticeTab({ accessToken }) {
  const [activeTab, setActiveTab] = useState('notices');
  const { notices, messages, fetchData } = useLMSStore();

  useEffect(() => {
    fetchData(activeTab, accessToken);
  }, [activeTab, fetchData, accessToken]);

  const [selectedCourse, setSelectedCourse] = useState('all'); // 선택 과목 ID 상태
  const [selectedNoticeId, setSelectedNoticeId] = useState(null); // 상세보기 모달 상태 (객체 저장)

  // 공지 상세 로딩/에러 상태
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [noticeError, setNoticeError] = useState("");

  const selectedNotice = useMemo(() =>
    notices.data.find(item =>
      String(item.notice_id) === String(selectedNoticeId)
    ) ?? null,
  [notices.data, selectedNoticeId]);

  // 모달 오픈 시 백그라운드 스크롤 방지
  useEffect(() => {
    document.body.classList.toggle('modal-open', !!selectedNoticeId);
    return () => document.body.classList.remove('modal-open');
  }, [selectedNoticeId]);

  // 모달 닫기
  const handleCloseModal = () => {
    setSelectedNoticeId(null);
    setNoticeLoading(false);
    setNoticeError("");
  };

  // 과목 태그 목록 생성 (중복 제거 및 정렬)
  const courses = useMemo(() => {
    const rawCourses = Array.from(new Map(notices.data.map(n => [n.course_id, n.course_name])).entries())
      .map(([id, name]) => ({ id, name }));
      
    // 정렬 로직 (한글 > 영어 > 숫자 순)
    const sorted = rawCourses.sort((a, b) => {
      const getSortKey = (name) => {
        if (!name) return 'z';
        const char = name[0];
        if (/[가-힣]/.test(char)) return '0' + name;
        if (/[a-zA-Z]/.test(char)) return '1' + name.toLowerCase();
        if (/[0-9]/.test(char)) return '2' + name;
        return '3' + name;
      };
      return getSortKey(a.name).localeCompare(getSortKey(b.name), 'ko');
    });

    return [{ id: 'all', name: '전체' }, ...sorted];
  }, [notices.data]);

  // 과목별 고정 색상 맵핑 (중복 방지)
  const courseColorMap = useMemo(() => {
    const map = {};
    // '전체' 제외하고 정렬된 순서대로 색상 할당
    courses.forEach((course, index) => {
      if (course.id === 'all') return;
      map[course.name] = COLOR_VARS[(index - 1) % COLOR_VARS.length];
    });
    return map;
  }, [courses]);

  // 선택한 과목 필터링 리스트
  const filteredNotices = useMemo(() =>
    selectedCourse === 'all'
      ? notices.data
      : notices.data.filter(n => n.course_id === selectedCourse),
  [notices.data, selectedCourse]);


  // 리스트 렌더링용 변수 통합
  const isNotice = activeTab === 'notices';
  const currentData = isNotice ? notices : messages;
  const listItems = isNotice ? filteredNotices : messages.data;
  const emptyText = isNotice ? '공지사항이 없습니다.' : '받은 쪽지가 없습니다.';

  // 공지 클릭 시 상세 모달 — description_html 없으면 상세 API 호출
  const handleNoticeClick = async (item) => {
    if (!isNotice) return;

    setSelectedNoticeId(item.notice_id);
    setNoticeError("");

    // description_html이 없으면 항상 상세 API 호출
     if (!item.description_html) {
      setNoticeLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/notices/${item.board_id}/${item.notice_id}`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            credentials: 'include'
          }
        );
        const result = await response.json();
        if (result.success) {
          useLMSStore.setState(prev => ({
            notices: {
              ...prev.notices,
              data: prev.notices.data.map(n =>
                String(n.notice_id) === String(item.notice_id)
                  ? { ...n, ...result.data }
                  : n
              )
            }
          }));
        } else {
          setNoticeError("공지 내용을 불러오지 못했습니다.");
        }
      } catch (error) {
        console.error("공지 상세 조회 실패:", error);
        setNoticeError("네트워크 오류가 발생했습니다.");
      } finally {
        setNoticeLoading(false);
      }
    }
  };


  return (
    <div>
      <div className="notice-header">
        <div className="notice-title-group">
          <span className="notice-emoji">{isNotice ? '📖' : '✉️'}</span>
          <h2>{isNotice ? '과목별 공지' : '받은 쪽지함'}</h2>
        </div>

          <div className="notice-tab-toggles">
            <button className={`tab-toggle-btn ${isNotice ? 'active' : ''}`} onClick={() => setActiveTab('notices')}>공지사항</button>
            <button className={`tab-toggle-btn ${!isNotice ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>쪽지함</button>
          </div>
        </div>

      {/* 상단 과목 필터 버튼들 */}
      {isNotice && ( <div className="notice-filter-tags">
        {courses.map(c => (
          <button
            key={c.id}
            className={`filter-tag-btn${selectedCourse === c.id ? ' active' : ''}`}
            onClick={() => setSelectedCourse(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
      )}

      {/* 공지 리스트 렌더링 */}
      {currentData.isLoading ? (<div className="notice-empty">데이터를 불러오는 중입니다...</div>
      ) : (

      <ul className="notice-list">
        {listItems.length === 0 ? (
          <p className="notice-empty">{emptyText}</p>
        ) : (
           listItems.map((item, index) => { // 탭에 따라 매핑할 데이터 다르게 설정
              const key = isNotice ? `${item.course_id}-${index}` : item.message_id;
              const tag = isNotice ? item.course_name : item.sender;
              const title = isNotice ? item.title : item.content;
              const date = isNotice ? item.date?.slice(0, 10) : item.date;

              // 과목일 경우 고정 색상 맵에서 가져오고, 쪽지 발신자 등은 기존 해시 방식 사용
              const tagColor = isNotice ? (courseColorMap[tag] || getColorForString(tag)) : getColorForString(tag);

              return (
            <li 
              key={key} 
              className="notice-item" 
              onClick={() => handleNoticeClick(item)} 
              style={{ cursor: isNotice ? 'pointer' : 'default' }}
            >
              <div className="notice-title-area">
                <span 
                    className="notice-course-tag" 
                    style={{ color: tagColor }} 
                  >
                    [{tag}]
                  </span>

                {/* 쪽지이면서 url이 존재할 경우에만 링크 적용 */}
                {!isNotice && item.url ? (
                  <a href={item.url} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="notice-item-title" 
                  style={{ textDecoration: 'none', color: 'inherit' }}>
                      {title}
                    </a>
                  ) : (

                <span className="notice-item-title">{title}</span>
                )}
              </div>

                {date && (
                  <span className="notice-item-date">
                    {date.slice(0, 10)}  {/* 날짜 부분만 표시 */}
                  </span>
                  )}
                </li>
              );
            })
          )}
        </ul>
      )}

      {/* Portal을 통한 상세 보기 모달 팝업 */}
      {selectedNotice && createPortal(
         <div className="detail-overlay" onClick={handleCloseModal}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={handleCloseModal}>✕</button>
            <h3>공지 상세 정보</h3>
            <div className="detail-modal-body">
            <div className="detail-info">
              <p><strong>과목:</strong> {selectedNotice.course_name}</p>
              <p><strong>제목:</strong> {selectedNotice.title}</p>
              {selectedNotice.writer && <p><strong>작성자:</strong> {selectedNotice.writer}</p>}
              {selectedNotice.date && ( <p><strong>작성일: </strong> 
                {selectedNotice.date.replace(/(\d{4}-\d{2}-\d{2})\s*(\d{2})(\d{2})(\d{2})/, '$1 $2:$3')}</p>)}
            </div>
            <hr />

            {/* 첨부파일 영역 rendering */}
            {selectedNotice.attachments && selectedNotice.attachments.length > 0 && (
              <div className="detail-attachments">
                <strong>첨부파일</strong>
                <ul className="attachment-list" style={{ listStyle: 'none', paddingLeft: 0, marginTop: '8px' }}>
                  {selectedNotice.attachments.map((file, idx) => (
                    <li key={idx} style={{ marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
                      <span style={{ marginRight: '8px'}}>📕</span>
                      <a 
                        href={file.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        style={{ textDecoration: 'underline'}}
                      >
                        {file.name}
                      </a>
                    </li>
                  ))}
                </ul>
                <hr />
              </div>
            )}

          
            <span className="detail-section-title">공지 내용</span>
            {noticeLoading && <p className="detail-loading">상세 정보를 불러오는 중...</p>}
            {noticeError && <p className="detail-error">{noticeError}</p>}
            {!noticeLoading && !noticeError && (
            
            /* description_html 있으면 HTML로 렌더링, 없으면 텍스트 폴백 */
            selectedNotice.description_html ? (
              <div
                className="detail-html-content"
                dangerouslySetInnerHTML={{ 
                  __html: DOMPurify.sanitize(selectedNotice.description_html).replace(
                    /href="\/api\/download/g, 
                    `href="${API_BASE_URL}/api/download`
                  ) 
                }}
              />
            ) : (
              <pre className="detail-text">{selectedNotice.description}</pre>
            )
          )}
            {selectedNotice.url && (
              <div className="detail-footer">
                <a href={selectedNotice.url} target="_blank" rel="noopener noreferrer" className="lms-link">
                  LMS 본문 페이지로 이동
                </a>
              </div>
            )}
            </div> 
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default NoticeTab;