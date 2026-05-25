import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import './NoticeTab.css';
import '../assignment-tab/AssignmentDetail.css';
import { API_BASE_URL } from '../../apiConfig';


// Zustand 스토어
const useNoticeStore = create((set, get) => ({
  notices: [],
  isLoading: false,
  isFetched: false,

  fetchNotices: async (accessToken) => {
    if (get().isFetched || !accessToken) return;  // 중복 호출 방지

    set({ isLoading: true });
    try {
      const response = await fetch(`${API_BASE_URL}/api/notices`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`서버 응답 오류 (Status: ${response.status})`);
      }

      const result = await response.json();
      if (result.success) {
        set({ notices: result.data, isFetched: true });
      }
    } catch (error) {
      console.error("공지사항 로드 실패:", error);
    } finally {
      set({ isLoading: false });
    }
  }
}));


function NoticeTab({ accessToken }) {

  const { notices, isLoading, fetchNotices } = useNoticeStore();

  useEffect(() => {
    fetchNotices(accessToken);
  }, [fetchNotices, accessToken]);

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
    ...Array.from(
      new Map(notices.map(n => [n.course_id, n.course_name])).entries()
    ).map(([id, name]) => ({ id, name }))
  ], [notices]);


  // 선택한 과목 필터링 리스트
  const filtered = useMemo(() =>
    selectedCourse === 'all'
      ? notices
      : notices.filter(n => n.course_id === selectedCourse),
  [notices, selectedCourse]);

  // 공지 클릭 시 상세 모달 — description_html 없으면 상세 API 호출
  const handleNoticeClick = async (item) => {
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

  return (
    <div>
      <div className="notice-header">
        <div className="notice-title-group">
          <span className="notice-emoji">📖</span>
          <h2>과목별 공지 및 과제</h2>
        </div>
        <a href="https://lms.chungbuk.ac.kr" target="_blank" rel="noreferrer" className="notice-more-btn">
          LMS 바로가기
        </a>
      </div>

      {/* 상단 과목 필터 버튼들 */}
      <div className="notice-filter-tags">
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

      {/* 공지 리스트 렌더링 */}
      {isLoading ? (
        <p className="notice-empty">공지사항을 불러오는 중입니다...</p>
      ) : (

      <ul className="notice-list">
        {filtered.length === 0 ? (
          <p className="notice-empty">공지사항이 없습니다.</p>
        ) : (
          filtered.map((item, index) => (
            // id가 없으므로 course_id와 index 조합으로 key 생성
            <li 
              key={`${item.course_id}-${index}`} 
              className="notice-item" 
              onClick={() => handleNoticeClick(item)} 
              style={{ cursor: 'pointer' }}
            >
              <div className="notice-title-area">
                <span className="notice-course-tag">[{item.course_name}]</span>
                <span className="notice-item-title">{item.title}</span>
              </div>
            </li>
          ))
        )}
      </ul>
      )}

      {/* Portal을 통한 상세 보기 모달 팝업 */}
      {selectedNotice && createPortal(
        <div className="detail-overlay" onClick={() => setSelectedNotice(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedNotice(null)}>✕</button>
            <h3>공지 상세 정보</h3>
            <div className="detail-info">
              <p><strong>과목:</strong> {selectedNotice.course_name}</p>
              <p><strong>제목:</strong> {selectedNotice.title}</p>
              {selectedNotice.writer && <p><strong>작성자:</strong> {selectedNotice.writer}</p>}
              {selectedNotice.date && <p><strong>작성일:</strong> {selectedNotice.date}</p>}
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
        </div>,
        document.body
      )}
    </div>
  );
}

export default NoticeTab;