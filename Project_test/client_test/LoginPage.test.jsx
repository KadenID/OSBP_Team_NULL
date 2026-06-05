import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '../../Project/client/src/Components/login-page/LoginPage';

// 라우터 이동 함수 Mock 설정
const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');

  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// 테마 Context Mock 설정
vi.mock('../../Project/client/src/context/ThemeContext.jsx', () => ({
  useTheme: () => ({
    theme: 'light',
    toggleTheme: vi.fn(),
  }),
}));

describe('LoginPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    global.fetch = vi.fn();
  });
    // 로그인 폼 입력 헬퍼
  const fillLoginForm = (studentId = '20240001', password = 'password123') => {
    fireEvent.change(screen.getByLabelText('아이디'), {
      target: {
        name: 'student_id',
        value: studentId,
      },
    });

    fireEvent.change(screen.getByLabelText('비밀번호'), {
      target: {
        name: 'password',
        value: password,
      },
    });
  };

  it('로그인 페이지 기본 화면을 렌더링한다', () => {
    render(<LoginPage onLogin={vi.fn()} />);

    expect(screen.getByText('CBNU TaskHub')).toBeInTheDocument();
    expect(screen.getByText('아이디')).toBeInTheDocument();
    expect(screen.getByText('비밀번호')).toBeInTheDocument();
    expect(screen.getByText('아이디 기억하기')).toBeInTheDocument();
    expect(screen.getByText('계속하기')).toBeInTheDocument();
  });

  it('저장된 아이디가 있으면 아이디 입력값과 체크박스를 초기화한다', () => {
    localStorage.setItem('rememberedStudentId', '20240001');

    render(<LoginPage onLogin={vi.fn()} />);

    expect(screen.getByLabelText('아이디')).toHaveValue('20240001');
    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  it('아이디 또는 비밀번호가 비어 있으면 오류 메시지를 표시하고 fetch를 호출하지 않는다', () => {
    render(<LoginPage onLogin={vi.fn()} />);

    fireEvent.click(screen.getByText('계속하기'));

    expect(screen.getByText('아이디와 비밀번호를 입력해주세요.')).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('입력값이 20자를 초과하면 오류 메시지를 표시하고 비밀번호를 초기화한다', () => {
    render(<LoginPage onLogin={vi.fn()} />);

    fillLoginForm('123456789012345678901', 'password123');

    fireEvent.click(screen.getByText('계속하기'));

    expect(screen.getByText('아이디와 비밀번호는 20자 이하로 입력해주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText('비밀번호')).toHaveValue('');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('입력값 변경 시 기존 오류 메시지를 제거한다', () => {
    render(<LoginPage onLogin={vi.fn()} />);

    fireEvent.click(screen.getByText('계속하기'));

    expect(screen.getByText('아이디와 비밀번호를 입력해주세요.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('아이디'), {
      target: {
        name: 'student_id',
        value: '20240001',
      },
    });

    expect(screen.queryByText('아이디와 비밀번호를 입력해주세요.')).not.toBeInTheDocument();
  });

  it('로그인 성공 시 onLogin을 호출하고 /main으로 이동한다', async () => {
    // 로그인 성공 응답 Mock
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: 'mock-access-token' }),
      })
    );

    const onLogin = vi.fn();

    // 함수 실행
    render(<LoginPage onLogin={onLogin} />);

    fillLoginForm();

    fireEvent.click(screen.getByText('계속하기'));

    // 검증
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/login'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            student_id: '20240001',
            password: 'password123',
          }),
        })
      );

      expect(onLogin).toHaveBeenCalledWith('mock-access-token');
      expect(mockNavigate).toHaveBeenCalledWith('/main');
    });
  });

  it('아이디 기억하기 체크 시 로그인 성공 후 localStorage에 아이디를 저장한다', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: 'mock-access-token' }),
      })
    );

    render(<LoginPage onLogin={vi.fn()} />);

    fillLoginForm();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByText('계속하기'));

    await waitFor(() => {
      expect(localStorage.getItem('rememberedStudentId')).toBe('20240001');
    });
  });

  it('아이디 기억하기가 해제되어 있으면 로그인 성공 후 저장된 아이디를 삭제한다', async () => {
    localStorage.setItem('rememberedStudentId', '20239999');

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ access_token: 'mock-access-token' }),
      })
    );

    render(<LoginPage onLogin={vi.fn()} />);

    expect(screen.getByRole('checkbox')).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox'));
    fillLoginForm('20240001', 'password123');

    fireEvent.click(screen.getByText('계속하기'));

    await waitFor(() => {
      expect(localStorage.getItem('rememberedStudentId')).toBeNull();
    });
  });

  it('로그인 실패 시 서버 오류 메시지를 표시하고 비밀번호를 초기화한다', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ detail: '로그인 실패 메시지' }),
      })
    );

    render(<LoginPage onLogin={vi.fn()} />);

    fillLoginForm();

    fireEvent.click(screen.getByText('계속하기'));

    await waitFor(() => {
      expect(screen.getByText('로그인 실패 메시지')).toBeInTheDocument();
      expect(screen.getByLabelText('비밀번호')).toHaveValue('');
    });
  });

  it('로그인 실패 응답에 detail이 없으면 기본 실패 메시지를 표시한다', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({}),
      })
    );

    render(<LoginPage onLogin={vi.fn()} />);

    fillLoginForm();

    fireEvent.click(screen.getByText('계속하기'));

    await waitFor(() => {
      expect(screen.getByText('로그인에 실패했습니다.')).toBeInTheDocument();
    });
  });

  it('로그인 성공 응답에 access_token이 없으면 오류 메시지를 표시한다', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      })
    );

    render(<LoginPage onLogin={vi.fn()} />);

    fillLoginForm();

    fireEvent.click(screen.getByText('계속하기'));

    await waitFor(() => {
      expect(screen.getByText('로그인 응답을 확인할 수 없습니다. 다시 시도해주세요.')).toBeInTheDocument();
      expect(screen.getByLabelText('비밀번호')).toHaveValue('');
    });
  });

  it('fetch 오류 발생 시 서버 연결 오류 메시지를 표시한다', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network error')));

    render(<LoginPage onLogin={vi.fn()} />);

    fillLoginForm();

    fireEvent.click(screen.getByText('계속하기'));

    await waitFor(() => {
      expect(screen.getByText('서버에 연결할 수 없습니다.')).toBeInTheDocument();
      expect(screen.getByLabelText('비밀번호')).toHaveValue('');
    });
  });

  it('서버 응답 JSON 파싱 실패 시 기본 실패 메시지를 표시한다', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.reject(new Error('invalid json')),
      })
    );

    render(<LoginPage onLogin={vi.fn()} />);

    fillLoginForm();

    fireEvent.click(screen.getByText('계속하기'));

    await waitFor(() => {
      expect(screen.getByText('로그인에 실패했습니다.')).toBeInTheDocument();
    });
  });

  it('로그인 중에는 버튼 문구를 인증 중으로 표시한다', async () => {
    let resolveFetch;

    global.fetch = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
    );

    render(<LoginPage onLogin={vi.fn()} />);

    fillLoginForm();

    fireEvent.click(screen.getByText('계속하기'));

    expect(screen.getByText('인증 중...')).toBeInTheDocument();
    expect(screen.getByText('인증 중...')).toBeDisabled();

    resolveFetch({
      ok: true,
      json: () => Promise.resolve({ access_token: 'mock-access-token' }),
    });

    await waitFor(() => {
      expect(screen.getByText('계속하기')).toBeInTheDocument();
    });
  });
});