import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AlarmHistory from '../../Project/client/src/Components/my-page/AlarmHistory';

const mockFetchHistory = vi.fn();
const mockDeleteHistoryItem = vi.fn();

let mockHistory = {
  data: [],
  isLoading: false,
  isFetched: true,
};

vi.mock('../../Project/client/src/store/useUserStore', () => ({
  default: () => ({
    history: mockHistory,
    fetchHistory: mockFetchHistory,
    deleteHistoryItem: mockDeleteHistoryItem,
  }),
}));

describe('AlarmHistory Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockHistory = {
      data: [],
      isLoading: false,
      isFetched: true,
    };

    window.open = vi.fn();
  });

  it('accessToken이 있으면 fetchHistory 함수를 호출한다', async () => {
    render(<AlarmHistory accessToken="mock-token" />);

    await waitFor(() => {
      expect(mockFetchHistory).toHaveBeenCalledWith('mock-token');
    });
  });

  it('accessToken이 없으면 fetchHistory 함수를 호출하지 않는다', () => {
    render(<AlarmHistory accessToken={null} />);

    expect(mockFetchHistory).not.toHaveBeenCalled();
  });

  it('알림 내역이 로딩 중이고 데이터가 없으면 로딩 문구를 표시한다', () => {
    mockHistory = {
      data: [],
      isLoading: true,
      isFetched: false,
    };

    render(<AlarmHistory accessToken="mock-token" />);

    expect(screen.getByText('불러오는 중...')).toBeInTheDocument();
  });

  it('알림 내역이 없으면 빈 내역 문구를 표시한다', () => {
    render(<AlarmHistory accessToken="mock-token" />);

    expect(screen.getByText('최근 알림 발송 내역')).toBeInTheDocument();
    expect(screen.getByText('최근 30일 내역만 표시됩니다.')).toBeInTheDocument();
    expect(screen.getByText('최근 30일간 발송된 알림이 없습니다.')).toBeInTheDocument();
  });

  it('알림 내역 데이터를 화면에 표시한다', () => {
    mockHistory = {
      data: [
        {
          id: 1,
          title: '과제 마감 알림',
          message: '자료구조 과제 마감 1시간 전입니다.',
          channel: 'email',
          sent_at: '2026-06-02T10:00:00',
          url: '/',
        },
      ],
      isLoading: false,
      isFetched: true,
    };

    render(<AlarmHistory accessToken="mock-token" />);

    expect(screen.getByText('과제 마감 알림')).toBeInTheDocument();
    expect(screen.getByText('자료구조 과제 마감 1시간 전입니다.')).toBeInTheDocument();
    expect(screen.getByText('email 발송 완료')).toBeInTheDocument();
  });

  it('url이 있는 알림 내역 클릭 시 새 창을 연다', () => {
    mockHistory = {
      data: [
        {
          id: 1,
          title: '공지 알림',
          message: '새 공지가 등록되었습니다.',
          channel: 'browser',
          sent_at: '2026-06-02T10:00:00',
          url: 'https://example.com/notice',
        },
      ],
      isLoading: false,
      isFetched: true,
    };

    render(<AlarmHistory accessToken="mock-token" />);

    fireEvent.click(screen.getByText('공지 알림'));

    expect(window.open).toHaveBeenCalledWith(
      'https://example.com/notice',
      '_blank'
    );
  });

  it('삭제 버튼 클릭 시 deleteHistoryItem 함수를 호출한다', async () => {
    mockHistory = {
      data: [
        {
          id: 7,
          title: '삭제할 알림',
          message: '삭제 테스트 메시지입니다.',
          channel: 'email',
          sent_at: '2026-06-02T10:00:00',
          url: 'https://example.com/assignment',
        },
      ],
      isLoading: false,
      isFetched: true,
    };

    render(<AlarmHistory accessToken="mock-token" />);

    fireEvent.click(screen.getByTitle('삭제'));

    await waitFor(() => {
      expect(mockDeleteHistoryItem).toHaveBeenCalledWith(7, 'mock-token');
    });

    expect(window.open).not.toHaveBeenCalled();
  });

  it('url이 /가 아니면 과제 바로가기 문구를 표시한다', () => {
    mockHistory = {
      data: [
        {
          id: 3,
          title: '과제 알림',
          message: '과제 링크가 있습니다.',
          channel: 'browser',
          sent_at: '2026-06-02T10:00:00',
          url: 'https://example.com/assignment',
        },
      ],
      isLoading: false,
      isFetched: true,
    };

    render(<AlarmHistory accessToken="mock-token" />);

    expect(screen.getByText('과제 바로가기 ↗')).toBeInTheDocument();
  });
});