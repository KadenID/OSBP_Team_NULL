import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AlarmSettings from '../../Project/client/src/Components/my-page/AlarmSettings';

const mocks = vi.hoisted(() => ({
  fetchAssignments: vi.fn(),
  fetchSettingsAndCourses: vi.fn(),
  updateSettings: vi.fn(),
  mockSettings: {},
}));

vi.mock('../../Project/client/src/store/useAssignmentStore', () => ({
  default: () => ({
    fetchAssignments: mocks.fetchAssignments,
  }),
}));

vi.mock('../../Project/client/src/store/useUserStore', () => ({
  default: () => ({
    settings: mocks.mockSettings,
    fetchSettingsAndCourses: mocks.fetchSettingsAndCourses,
    updateSettings: mocks.updateSettings,
  }),
}));

describe('AlarmSettings Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    window.alert = vi.fn();
    window.PushManager = vi.fn();

    global.Notification = {
      permission: 'default',
      requestPermission: vi.fn(() => Promise.resolve('granted')),
    };

    global.fetch = vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ success: true }),
      })
    );

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(() => Promise.resolve(null)),
      },
    });

    mocks.mockSettings = {
      email: 'test@example.com',
      emailAlerts: true,
      browserAlerts: false,
      courseReminders: [],
      courses: [
        { id: 'all', name: '전체 과목' },
        { id: 'course-1', name: '자료구조' },
      ],
      isLoading: false,
      isFetched: true,
    };
  });

  it('accessToken이 있으면 과제 목록과 알림 설정 정보를 조회한다', async () => {
    render(<AlarmSettings accessToken="mock-token" />);

    await waitFor(() => {
      expect(mocks.fetchAssignments).toHaveBeenCalledWith('mock-token');
      expect(mocks.fetchSettingsAndCourses).toHaveBeenCalledWith('mock-token');
    });
  });

  it('accessToken이 없으면 조회 함수를 호출하지 않는다', () => {
    render(<AlarmSettings accessToken={null} />);

    expect(mocks.fetchAssignments).not.toHaveBeenCalled();
    expect(mocks.fetchSettingsAndCourses).not.toHaveBeenCalled();
  });

  it('설정 로딩 중이면 로딩 문구를 표시한다', () => {
    mocks.mockSettings = {
      ...mocks.mockSettings,
      isLoading: true,
      isFetched: false,
    };

    render(<AlarmSettings accessToken="mock-token" />);

    expect(screen.getByText('설정 로드 중...')).toBeInTheDocument();
  });

  it('알림 설정 기본 화면을 렌더링한다', () => {
    render(<AlarmSettings accessToken="mock-token" />);

    expect(screen.getByText('이메일 알림')).toBeInTheDocument();
    expect(screen.getByText('브라우저 푸시 알림')).toBeInTheDocument();
    expect(screen.getByText('테스트 알림 발송')).toBeInTheDocument();
    expect(screen.getByText('과목별 알림 추가')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });

  it('이메일 수정 후 저장하면 updateSettings를 호출한다', () => {
    render(<AlarmSettings accessToken="mock-token" />);

    fireEvent.click(screen.getByText('수정'));

    const emailInput = screen.getByPlaceholderText('이메일 주소 입력');
    fireEvent.change(emailInput, {
      target: { value: 'new@example.com' },
    });

    fireEvent.click(screen.getByText('저장'));

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      {
        email: 'new@example.com',
        emailAlerts: true,
      },
      'mock-token'
    );

    expect(screen.getByText('이메일이 저장되었습니다.')).toBeInTheDocument();
  });

  it('올바르지 않은 이메일 형식이면 저장하지 않고 alert를 호출한다', () => {
    render(<AlarmSettings accessToken="mock-token" />);

    fireEvent.click(screen.getByText('수정'));

    const emailInput = screen.getByPlaceholderText('이메일 주소 입력');
    fireEvent.change(emailInput, {
      target: { value: 'wrong-email' },
    });

    fireEvent.click(screen.getByText('저장'));

    expect(window.alert).toHaveBeenCalledWith('올바른 이메일 형식이 아닙니다.');
    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });

  it('이메일 알림 체크박스 변경 시 updateSettings를 호출한다', () => {
    const { container } = render(<AlarmSettings accessToken="mock-token" />);

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const emailAlertCheckbox = checkboxes[0];

    fireEvent.click(emailAlertCheckbox);

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      { emailAlerts: false },
      'mock-token'
    );
  });

  it('이메일을 빈 값으로 저장하면 emailAlerts를 false로 업데이트한다', () => {
    render(<AlarmSettings accessToken="mock-token" />);

    fireEvent.click(screen.getByText('수정'));

    const emailInput = screen.getByPlaceholderText('이메일 주소 입력');
    fireEvent.change(emailInput, {
      target: { value: '' },
    });

    fireEvent.click(screen.getByText('저장'));

    expect(mocks.updateSettings).toHaveBeenCalledWith(
      {
        email: '',
        emailAlerts: false,
      },
      'mock-token'
    );

    expect(screen.getByText('이메일이 삭제되어 알림이 비활성화되었습니다.')).toBeInTheDocument();
  });

  it('이메일이 없으면 이메일 알림 토글 시 updateSettings를 호출하지 않는다', () => {
    mocks.mockSettings = {
      ...mocks.mockSettings,
      email: '',
      emailAlerts: false,
    };

    const { container } = render(<AlarmSettings accessToken="mock-token" />);

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const emailAlertCheckbox = checkboxes[0];

    fireEvent.click(emailAlertCheckbox);

    expect(mocks.updateSettings).not.toHaveBeenCalled();
  });
});