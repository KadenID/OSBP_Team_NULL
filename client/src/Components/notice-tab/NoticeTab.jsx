import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import './NoticeTab.css';
import '../assignment-tab/AssignmentDetail.css';

// 목데이터 정의
const MOCK_NOTICES = [
  {
    course_id: "1",
    course_name: "컴퓨터 구조",
    assignment_name: "중간고사 공지",
    description: "이번 컴퓨터 구조 중간고사 너무 못봤다...",
    url: "https://lms.chungbuk.ac.kr"
  },
  {
    course_id: "1",
    course_name: "컴퓨터 구조",
    assignment_name: "중간고사 점수 확인 관련",
    description: "중간고사 성적 잘 받고 싶다...",
    url: "https://lms.chungbuk.ac.kr"
  },
  {
    course_id: "2",
    course_name: "알고리즘",
    assignment_name: "기말고사 안내",
    description: "알고리즘 기말고사는 쉬웠으면 좋겠다...",
    url: "https://lms.chungbuk.ac.kr"
  }
];

// Zustand 스토어 선언
const useNoticeStore = create((set) => ({
  notices: MOCK_NOTICES,
}));


function NoticeTab() {

  const { notices } = useNoticeStore(); // 스토어 데이터 구독
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

  return (
    <div className="notice-section">
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
      <ul className="notice-list">
        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: '20px', color: '#888' }}>공지사항이 없습니다.</p>
        ) : (
          filtered.map((item, index) => (
            // id가 없으므로 course_id와 index 조합으로 key 생성
            <li 
              key={`${item.course_id}-${index}`} 
              className="notice-item" 
              onClick={() => setSelectedNotice(item)} 
              style={{ cursor: 'pointer' }}
            >
              <div className="notice-title-area">
                <span className="notice-course-tag">[{item.course_name}]</span>
                <span className="notice-item-title">{item.assignment_name}</span>
              </div>
            </li>
          ))
        )}
      </ul>

      {/* Portal을 통한 상세 보기 모달 팝업 */}
      {selectedNotice && createPortal(
        <div className="detail-overlay" onClick={() => setSelectedNotice(null)}>
          <div className="detail-modal" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedNotice(null)}>✕</button>
            <h3>공지 상세 정보</h3>
            <div style={{ marginBottom: '15px', fontSize: '0.9em', color: '#a3a3a3' }}>
              <p><strong>과목:</strong> {selectedNotice.course_name}</p>
              <p><strong>제목:</strong> {selectedNotice.assignment_name}</p>
            </div>
            <hr />
            <span className="detail-section-title">공지 내용</span>
            <pre className="detail-text">{selectedNotice.description}</pre>
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