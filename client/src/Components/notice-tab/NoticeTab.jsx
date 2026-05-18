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