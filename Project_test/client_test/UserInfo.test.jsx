import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UserInfo from '../../Project/client/src/Components/my-page/UserInfo';

const mockFetchUserInfo = vi.fn();

let mockUserInfo = {
  name: '홍길동',
  studentId: '20240001',
  department: '컴퓨터공학과',
  lmsConnected: true,
  isLoading: false,
  isFetched: true,
};

vi.mock('../../Project/client/src/store/useUserStore', () => ({
  default: () => ({
    userInfo: mockUserInfo,
    fetchUserInfo: mockFetchUserInfo,
  }),
}));

describe('UserInfo Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUserInfo = {
      name: '홍길동',
      studentId: '20240001',
      department: '컴퓨터공학과',
      lmsConnected: true,
      isLoading: false,
      isFetched: true,
    };
  });

  it('accessToken이 있으면 fetchUserInfo 함수를 호출한다', async () => {
    render(<UserInfo accessToken="mock-token" />);

    await waitFor(() => {
      expect(mockFetchUserInfo).toHaveBeenCalledWith('mock-token');
    });
  });

  it('accessToken이 없으면 fetchUserInfo 함수를 호출하지 않는다', () => {
    render(<UserInfo accessToken={null} />);

    expect(mockFetchUserInfo).not.toHaveBeenCalled();
  });

  it('사용자 정보를 화면에 표시한다', () => {
    render(<UserInfo accessToken="mock-token" />);

    expect(screen.getByText('사용자 정보')).toBeInTheDocument();
    expect(screen.getByText('이름')).toBeInTheDocument();
    expect(screen.getByText('학번')).toBeInTheDocument();
    expect(screen.getByText('학과')).toBeInTheDocument();

    expect(screen.getByText('홍길동')).toBeInTheDocument();
    expect(screen.getByText('20240001')).toBeInTheDocument();
    expect(screen.getByText('컴퓨터공학과')).toBeInTheDocument();
    expect(screen.getByText('LMS 연동 완료')).toBeInTheDocument();
  });

  it('LMS가 연동되지 않은 경우 LMS 미연동 상태를 표시한다', () => {
    mockUserInfo = {
      name: '',
      studentId: '',
      department: '',
      lmsConnected: false,
      isLoading: false,
      isFetched: false,
    };

    render(<UserInfo accessToken="mock-token" />);

    expect(screen.getByText('LMS 미연동')).toBeInTheDocument();
    expect(screen.getAllByText('연동 후 표시됩니다')).toHaveLength(3);
  });

  it('사용자 정보를 불러오는 중이면 불러오는 중 문구를 표시한다', () => {
    mockUserInfo = {
      name: '',
      studentId: '',
      department: '',
      lmsConnected: false,
      isLoading: true,
      isFetched: false,
    };

    render(<UserInfo accessToken="mock-token" />);

    expect(screen.getAllByText('불러오는 중...')).toHaveLength(3);
  });
});