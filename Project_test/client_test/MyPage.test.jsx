import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MyPage from '../../Project/client/src/Components/my-page/MyPage';

const mockNavigate = vi.fn();
const mockWithdraw = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../../Project/client/src/context/ThemeContext.jsx', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('../../Project/client/src/Components/my-page/UserInfo', () => ({
  default: () => <div>사용자 정보</div>,
}));

vi.mock('../../Project/client/src/Components/my-page/AlarmSettings', () => ({
  default: () => <div>알림 설정 내용</div>,
}));

vi.mock('../../Project/client/src/Components/my-page/AlarmHistory', () => ({
  default: () => <div>알림 내역 내용</div>,
}));

vi.mock('../../Project/client/src/store/useUserStore', () => ({
  default: (selector) => {
    const store = {
      withdraw: mockWithdraw,
    };

    return selector ? selector(store) : store;
  },
}));

describe('MyPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    window.confirm = vi.fn();
    window.alert = vi.fn();
  });

  it('마이페이지 화면을 렌더링한다', () => {
    render(<MyPage accessToken="mock-token" onLogout={vi.fn()} />);

    expect(screen.getByText('마이페이지')).toBeInTheDocument();
    expect(screen.getByText('사용자 정보를 확인하세요')).toBeInTheDocument();
    expect(screen.getByText('사용자 정보')).toBeInTheDocument();
    expect(screen.getByText('알림 설정')).toBeInTheDocument();
    expect(screen.getByText('알림 내역')).toBeInTheDocument();
    expect(screen.getByText('로그아웃')).toBeInTheDocument();
    expect(screen.getByText('서비스 탈퇴')).toBeInTheDocument();
  });

  it('Mainpage 버튼 클릭 시 /main으로 이동한다', () => {
    render(<MyPage accessToken="mock-token" onLogout={vi.fn()} />);

    fireEvent.click(screen.getByText('Mainpage'));

    expect(mockNavigate).toHaveBeenCalledWith('/main');
  });

  it('로그아웃 버튼 클릭 시 onLogout 호출 후 /로 이동한다', async () => {
    const onLogout = vi.fn();

    render(<MyPage accessToken="mock-token" onLogout={onLogout} />);

    fireEvent.click(screen.getByText('로그아웃'));

    await waitFor(() => {
      expect(onLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('서비스 탈퇴 취소 시 withdraw를 호출하지 않는다', () => {
    window.confirm.mockReturnValue(false);

    render(<MyPage accessToken="mock-token" onLogout={vi.fn()} />);

    fireEvent.click(screen.getByText('서비스 탈퇴'));

    expect(window.confirm).toHaveBeenCalled();
    expect(mockWithdraw).not.toHaveBeenCalled();
  });

  it('서비스 탈퇴 확인 시 withdraw 호출 후 로그아웃하고 /로 이동한다', async () => {
    window.confirm.mockReturnValue(true);
    mockWithdraw.mockResolvedValue({ success: true });

    const onLogout = vi.fn();

    render(<MyPage accessToken="mock-token" onLogout={onLogout} />);

    fireEvent.click(screen.getByText('서비스 탈퇴'));

    await waitFor(() => {
      expect(mockWithdraw).toHaveBeenCalledWith('mock-token');
      expect(window.alert).toHaveBeenCalled();
      expect(onLogout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

    it('onLogout이 없으면 로그아웃 버튼 클릭 시 /로 이동하지 않는다', async () => {
    render(<MyPage accessToken="mock-token" />);

    fireEvent.click(screen.getByText('로그아웃'));

    await waitFor(() => {
      expect(mockNavigate).not.toHaveBeenCalledWith('/');
    });
  });

  it('서비스 탈퇴 실패 시 실패 메시지를 alert로 표시한다', async () => {
    window.confirm.mockReturnValue(true);
    mockWithdraw.mockResolvedValue({
      success: false,
      message: '탈퇴 실패 테스트 메시지',
    });

    const onLogout = vi.fn();

    render(<MyPage accessToken="mock-token" onLogout={onLogout} />);

    fireEvent.click(screen.getByText('서비스 탈퇴'));

    await waitFor(() => {
      expect(mockWithdraw).toHaveBeenCalledWith('mock-token');
      expect(window.alert).toHaveBeenCalledWith('탈퇴 실패 테스트 메시지');
      expect(onLogout).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalledWith('/');
    });
  });

  it('서비스 탈퇴 실패 시 메시지가 없으면 기본 오류 메시지를 alert로 표시한다', async () => {
    window.confirm.mockReturnValue(true);
    mockWithdraw.mockResolvedValue({
      success: false,
    });

    render(<MyPage accessToken="mock-token" onLogout={vi.fn()} />);

    fireEvent.click(screen.getByText('서비스 탈퇴'));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith('탈퇴 처리 중 오류가 발생했습니다.');
    });
  });

  it('알림 설정 카드 헤더 클릭 시 카드 내용이 닫힌 상태로 변경된다', () => {
    const { container } = render(
      <MyPage accessToken="mock-token" onLogout={vi.fn()} />
    );

    fireEvent.click(screen.getByText('알림 설정'));

    const closedContents = container.querySelectorAll('.mypage-card-content.is-closed');

    expect(closedContents.length).toBeGreaterThan(0);
  });
});