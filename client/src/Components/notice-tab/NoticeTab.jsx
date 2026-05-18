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