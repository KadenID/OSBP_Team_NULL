import { render, screen, fireEvent } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import MainPage from '../../../../../Project/client/src/Components/main-page/MainPage';

import { mainPageMockData } from '../../../../mock_data/main_page';

// 1. react-router-dom 모킹
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// 2. Custom Context / Theme 모킹
const mockToggleTheme = vi.fn();
let mockCurrentTheme = 'light';
vi.mock('../../../../../Project/client/src/context/ThemeContext.jsx', () => ({
  useTheme: () => ({
    theme: mockCurrentTheme,
    toggleTheme: mockToggleTheme,
  }),
}));

// 3. AssignmentTab 모킹
vi.mock('../../../../../Project/client/src/Components/assignment-tab/AssignmentTab.jsx', () => ({
  default: ({ accessToken }) => (
    <div data-testid="assignment-tab">
      AssignmentTab Mock (Token: {accessToken})
    </div>
  ),
}));

// 4. NoticeTab 모킹
vi.mock('../../../../../Project/client/src/Components/notice-tab/NoticeTab.jsx', () => ({
  default: ({ accessToken }) => (
    <div data-testid="notice-tab">
      NoticeTab Mock (Token: {accessToken})
    </div>
  ),
}));

describe('MainPage 컴포넌트 유닛 테스트', () => {
  const mockAccessToken = mainPageMockData.user.accessToken;

  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentTheme = 'light';
  });

  test('대시보드 헤더 텍스트와 하위 탭 컴포넌트들이 토큰과 함께 정상 렌더링되는가', () => {
    render(<MainPage accessToken={mockAccessToken} onLogout={vi.fn()} />);

    // 대시보드 기본 텍스트 검증
    expect(screen.getByText('학습 대시보드')).toBeInTheDocument();
    expect(screen.getByText('오늘의 과제를 확인하세요!')).toBeInTheDocument();

    // 하위 탭 컴포넌트의 포탈/렌더링 및 토큰 주입 검증
    const assignmentTab = screen.getByTestId('assignment-tab');
    const noticeTab = screen.getByTestId('notice-tab');

    expect(assignmentTab).toBeInTheDocument();
    expect(assignmentTab).toHaveTextContent(mockAccessToken);
    expect(noticeTab).toBeInTheDocument();
    expect(noticeTab).toHaveTextContent(mockAccessToken);
  });

  test('테마가 light일 때 🌞 아이콘이 보이고, 버튼을 누르면 toggleTheme이 실행되는가', () => {
    mockCurrentTheme = 'light';
    render(<MainPage accessToken={mockAccessToken} onLogout={vi.fn()} />);

    const themeButton = screen.getByRole('button', { name: '🌞' });
    expect(themeButton).toBeInTheDocument();

    fireEvent.click(themeButton);
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });

  test('테마가 dark일 때 🌙 아이콘이 정상적으로 표시되는가', () => {
    mockCurrentTheme = 'dark';
    render(<MainPage accessToken={mockAccessToken} onLogout={vi.fn()} />);

    const themeButton = screen.getByRole('button', { name: '🌙' });
    expect(themeButton).toBeInTheDocument();
  });

  test('Mypage 버튼을 누르면 "/mypage" 경로로 화면 이동(navigate)이 일어나는가', () => {
    render(<MainPage accessToken={mockAccessToken} onLogout={vi.fn()} />);

    const mypageButton = screen.getByRole('button', { name: /Mypage/i });
    expect(mypageButton).toBeInTheDocument();

    fireEvent.click(mypageButton);

    expect(mockNavigate).toHaveBeenCalledWith('/mypage');
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});