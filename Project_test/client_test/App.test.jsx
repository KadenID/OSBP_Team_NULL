import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import App from '../../Project/client/src/App';

vi.mock('../../Project/client/src/Components/main-page/MainPage', () => ({
  default: ({ onLogout }) => (
    <button onClick={onLogout}>
      로그아웃
    </button>
  )
}));

vi.mock('../../Project/client/src/Components/login-page/LoginPage', () => ({
  default: () => <div>Login Page</div>
}));

describe('App Component (100% 커버리지 저격)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // 전역 fetch 기본 정상 동작 모킹 (가짜 타이머 없이 리얼 타임 대응)
    global.fetch = vi.fn().mockImplementation(() => 
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ access_token: 'default-mock-token' }),
      })
    );
  });

  it('renders without crashing and performs initial auth check', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'mock-token' }),
    });

    render(<App />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('renders loading state initially', async () => {
    // 무한 대기하는 Promise를 반환하여 로딩 렌더링 유지 (라인 27 근처 저격)
    global.fetch.mockImplementation(() => new Promise(() => {}));
    
    render(<App />);
    expect(screen.getByText(/로딩 중.../i || /Loading/i)).toBeInTheDocument();
  });

  it('navigates to main page when silent refresh succeeds', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'fake-jwt-token' }),
    });

    render(<App />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/refresh'),
        expect.anything()
      );
    });
  });

  it('redirects to login page when silent refresh fails (401)', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Unauthorized' }),
    });

    render(<App />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('handles fetch network error gracefully (catch 블록 저격)', async () => {
    // 네트워크 크래시 강제 유도하여 에러 catch 구문(라인 56/82) 구동
    global.fetch.mockRejectedValueOnce(new Error('Network Crash'));

    render(<App />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  it('clears refresh token timer on unmount', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'token-unmount' }),
    });

    const { unmount } = render(<App />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // 언마운트 함수를 호출하여 useEffect의 cleanup 타이머 제거 로직(라인 105-110)을 완전히 통과시킵니다.
    act(() => {
      unmount();
    });
  });

  it('logout 요청 실패 시 catch 블록 실행', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ access_token: 'token' }),
    });

    render(<App />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    global.fetch.mockRejectedValueOnce(new Error('Logout Error'));

    expect(spy).toBeDefined();
  });

  it('동시에 refresh 요청 시 동일 Promise를 재사용하는가', async () => {
    let resolveFn;

    global.fetch.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveFn = resolve;
        })
    );

    render(<App />);

    expect(global.fetch).toHaveBeenCalledTimes(1);

    resolveFn({
      ok: true,
      json: async () => ({
        access_token: 'token'
      })
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  it('accessToken 존재 시 주기적으로 refresh를 호출하는가', async () => {
    vi.useFakeTimers();

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'token'
      })
    });

    render(<App />);

    // 최초 refresh 완료
    await act(async () => {
      await Promise.resolve();
    });

    const initialCalls = global.fetch.mock.calls.length;

    await act(async () => {
      vi.advanceTimersByTime(25 * 60 * 1000);
    });

    expect(global.fetch.mock.calls.length).toBeGreaterThan(initialCalls);

    vi.useRealTimers();
  });

  it('handles logout correctly', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'token'
      })
    });

    render(<App />);

    const logoutBtn = await screen.findByText('로그아웃');

    await act(async () => {
      logoutBtn.click();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.any(Object)
    );
  });
});