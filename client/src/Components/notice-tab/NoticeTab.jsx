import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import './NoticeTab.css';
import '../assignment-tab/AssignmentDetail.css';
import { API_BASE_URL } from '../../apiConfig';


// Zustand 스토어
const useLMSStore = create((set, get) => ({
  notices: { data: [], isLoading: false, isFetched: false },
  messages: { data: [], isLoading: false, isFetched: false },


  fetchData: async (type, accessToken) => { // type: 'notices' | 'messages'

    const state = get()[type];
    if (state.isFetched || !accessToken) return;  // 중복 호출 방지

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


function NoticeTab({ accessToken }) {
  const [activeTab, setActiveTab] = useState('notices');
  const { notices, messages, fetchData } = useLMSStore();

   useEffect(() => {
    fetchData(activeTab, accessToken);
  }, [activeTab, fetchData, accessToken]);

  const [selectedCourse, setSelectedCourse] = useState('all'); // 선택 과목 ID 상태
  const [selectedNotice, setSelectedNotice] = useState(null); // 상세보기 모달 상태 (객체 저장)


  // 모달 오픈 시 백그라운드 스크롤 방지
  useEffect(() => {
    document.body.classList.toggle('modal-open', !!selectedNotice);
    return () => document.body.classList.remove('modal-open');
  }, [selectedNotice]);


  // 과목 태그 목록 생성 (중복 제거)
  const courses = useMemo(() => [
    { id: 'all', name: '전체' },
    ...Array.from(new Map(notices.data.map(n => [n.course_id, n.course_name])).entries())
      .map(([id, name]) => ({ id, name }))
  ], [notices.data]);


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

    // description_html이 없으면 항상 상세 API 호출
    if (item.description_html) {
      setSelectedNotice(item);
    } else {
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
          setSelectedNotice({ ...item, ...result.data });
        }
      } catch (error) {
        console.error("공지 상세 조회 실패:", error);
      }
    }
  };

  // 문자를 입력받아 css 변수명 변경(과목 색 변)
  const getColorForString = (str) => {
  if (!str) return 'var(--text-main)';

  const colorVars = [
    'var(--tag-color-0)', 'var(--tag-color-1)', 'var(--tag-color-2)', 
    'var(--tag-color-3)', 'var(--tag-color-4)', 'var(--tag-color-5)', 
    'var(--tag-color-6)', 'var(--tag-color-7)', 'var(--tag-color-8)', 
    'var(--tag-color-9)'
  ];
  
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const index = Math.abs(hash) % colorVars.length;
  return colorVars[index];
};


  return (
    <div>
      <div className="notice-header">
        <div className="notice-title-group">
          <span className="notice-emoji">{isNotice ? '📖' : '✉️'}</span>
          <h2>{isNotice ? '과목별 공지 및 과제' : '받은 쪽지함'}</h2>
        </div>

        <div className="notice-header-right">
          <div className="notice-tab-toggles">
            <button className={`tab-toggle-btn ${isNotice ? 'active' : ''}`} onClick={() => setActiveTab('notices')}>공지사항</button>
            <button className={`tab-toggle-btn ${!isNotice ? 'active' : ''}`} onClick={() => setActiveTab('messages')}>쪽지함</button>
          </div>

          <a href="https://lms.chungbuk.ac.kr" target="_blank" rel="noreferrer" className="notice-more-btn">
            LMS 바로가기
          </a>
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

              const tagColor = getColorForString(tag);

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
        <div className="detail-overlay" onClick={() => setSelectedNotice(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedNotice(null)}>✕</button>
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
            <span className="detail-section-title">공지 내용</span>
            {/* description_html 있으면 HTML로 렌더링, 없으면 텍스트 폴백 */}
            {selectedNotice.description_html ? (
              <div
                className="detail-html-content"
                dangerouslySetInnerHTML={{ __html: selectedNotice.description_html }}
              />
            ) : (
              <pre className="detail-text">{selectedNotice.description}</pre>
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