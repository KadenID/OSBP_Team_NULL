import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import NoticeTab, { useLMSStore } from '../../../../../Project/client/src/Components/notice-tab/NoticeTab';
import { mainPageMockData } from '../../../../mock_data/main_page';

// API 베이스 URL 설정 모킹
vi.mock('../../../../../Project/client/src/apiConfig', () => ({
  API_BASE_URL: 'http://localhost:8000',
}));

// 전역 fetch API 모킹 설정
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('NoticeTab 컴포넌트 유닛 테스트', () => {
  const mockToken = 'mock-access-token';

  beforeEach(() => {
    vi.clearAllMocks();
    // 테스트 콘솔에 출력되는 의도된 에러 스트림을 가리기 위한 스파이 설정
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // zustand 전역 스토어 상태를 매 테스트마다 초기 상태로 리셋
    useLMSStore.setState({
      notices: { data: [], isLoading: false, isFetched: false },
      messages: { data: [], isLoading: false, isFetched: false },
    });
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  // 공지사항 목록 정상 렌더링
  test('공지사항 목록이 정상적으로 렌더링되는가', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);

    expect(await screen.findByText(mainPageMockData.notices[0].title)).toBeInTheDocument();
    expect(await screen.findByText(mainPageMockData.notices[1].title)).toBeInTheDocument();
  });

  // description_html 없는 공지 클릭 시 상세 API 호출
  test('description_html이 없는 공지 클릭 시 상세 내용 API 호출 및 텍스트 렌더링', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    const noticeItem = await screen.findByText(mainPageMockData.notices[1].title);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { description: '성공' } }),
    });

    fireEvent.click(noticeItem);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        `http://localhost:8000/api/notices/${mainPageMockData.notices[1].board_id}/${mainPageMockData.notices[1].notice_id}`,
        expect.any(Object)
      );
    });
  });

  // 상세 API 에러 — success:false 분기 (Line 180)
  test('상세 API 응답이 success:false면 에러 메시지가 출력되는가 (Line 180)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    const noticeItem = await screen.findByText(mainPageMockData.notices[1].title);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false }),
    });

    fireEvent.click(noticeItem);

    await waitFor(() => {
      expect(screen.getByText('공지 내용을 불러오지 못했습니다.')).toBeInTheDocument();
    });
  });

  // 상세 API catch — response.ok:false → throw 분기 (Lines 114-116)
  test('상세 API 호출 도중 response.ok:false로 throw되면 네트워크 에러 메시지를 출력하는가 (Lines 114-116)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    const noticeItem = await screen.findByText(mainPageMockData.notices[1].title);

    // response.ok:false -> throw new Error -> catch 블록으로 진입 유도
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    fireEvent.click(noticeItem);

    await waitFor(() => {
      expect(screen.getByText('네트워크 오류가 발생했습니다.')).toBeInTheDocument();
    });
  });

  // 상세 API catch — fetch 자체 reject (네트워크 크래시)
  test('상세 API fetch가 reject되면 네트워크 오류 메시지가 출력되는가', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    const noticeItem = await screen.findByText(mainPageMockData.notices[1].title);

    mockFetch.mockRejectedValueOnce(new Error('Network Crash'));
    fireEvent.click(noticeItem);

    await waitFor(() => {
      expect(screen.getByText('네트워크 오류가 발생했습니다.')).toBeInTheDocument();
    });
  });

  // 공지 목록 API catch (Lines 58-66)
  test('공지사항 목록 API 호출 실패 시 catch 분기를 처리하는가 (Lines 58-66)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Fetch Error'));

    render(<NoticeTab accessToken={mockToken} />);

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });
  });

  // fetchData — isFetched:true일 때 early return (Line 201)
  test('이미 isFetched된 상태에서 탭을 다시 클릭해도 API를 재호출하지 않는가 (Line 201)', async () => {
    useLMSStore.setState({
      notices: { data: mainPageMockData.notices, isLoading: false, isFetched: true },
      messages: { data: [], isLoading: false, isFetched: false },
    });

    render(<NoticeTab accessToken={mockToken} />);

    // 공지 탭이 이미은 전적(isFetched=true)이 있으므로 fetch가 재호출되지 않아야 함
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // fetchData — accessToken 없을 때 early return
  test('accessToken이 없으면 fetchData가 API를 호출하지 않는가', () => {
    render(<NoticeTab accessToken={null} />);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // description_html 있는 공지 — 캐싱 분기 (추가 API 미호출)
  test('description_html이 있는 공지 클릭 시 추가 API 호출 없이 모달이 열리는가', async () => {
    const noticeWithHtml = [
      { ...mainPageMockData.notices[0], description_html: '<p>이미 로드된 본문</p>' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: noticeWithHtml }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    const noticeItem = await screen.findByText(noticeWithHtml[0].title);

    fireEvent.click(noticeItem);

    await waitFor(() => {
      expect(screen.getByText('이미 로드된 본문')).toBeInTheDocument();
    });

    // 상세 내용 조회를 위한 네트워크 요청이 발생하지 않고 기존 초기 목록 조회 한 번만 처리됨 검증
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // 쪽지함 탭 — 정상 로드
  test('쪽지함 탭 클릭 시 쪽지 목록이 렌더링되는가', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    await screen.findByText(mainPageMockData.notices[0].title);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.messages ?? [] }),
    });

    fireEvent.click(screen.getByRole('button', { name: '쪽지함' }));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8000/api/messages',
        expect.any(Object)
      );
    });
  });

  // 쪽지함 탭 — catch 분기
  test('쪽지함 탭 API가 reject되면 catch 분기가 작동하는가', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    await screen.findByText(mainPageMockData.notices[0].title);

    mockFetch.mockRejectedValueOnce(new Error('Notes Fetch Crash'));
    fireEvent.click(screen.getByRole('button', { name: '쪽지함' }));

    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });
  });

  // 쪽지함 — url 있는 쪽지 링크 렌더링 (Line 301)
  test('쪽지에 url이 있으면 a 태그로 렌더링되고 없으면 span으로 렌더링되는가 (Line 301)', async () => {
    const mockMessages = [
      { message_id: 'm-1', sender: '홍길동', content: 'url 있는 쪽지', date: '2026-06-01', url: 'https://lms.example.com/msg/1' },
      { message_id: 'm-2', sender: '이순신', content: 'url 없는 쪽지', date: '2026-06-02', url: null },
    ];

    useLMSStore.setState({
      notices: { data: [], isLoading: false, isFetched: true },
      messages: { data: mockMessages, isLoading: false, isFetched: true },
    });

    render(<NoticeTab accessToken={mockToken} />);
    fireEvent.click(screen.getByRole('button', { name: '쪽지함' }));

    // url 있는 쪽지는 하이퍼링크(a 태그) 역할을 수행하는지 검증
    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'url 있는 쪽지' });
      expect(link).toHaveAttribute('href', 'https://lms.example.com/msg/1');
    });

    // url 없는 쪽지는 pure span 엘리먼트로 구성되는지 검증
    expect(screen.queryByRole('link', { name: 'url 없는 쪽지' })).not.toBeInTheDocument();
    expect(screen.getByText('url 없는 쪽지')).toBeInTheDocument();
  });

  // 과목 필터 클릭 및 전체 복귀
  test('과목 카테고리 필터 및 전체 필터 클릭 시 필터링 로직이 정상 작동하는가', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);

    // 특정 과목 카테고리 버튼 선택
    const filterBtn = await screen.findByText(mainPageMockData.notices[0].course_name);
    fireEvent.click(filterBtn);

    // 다시 전체 목록 보기 버튼 선택
    const allBtn = screen.getByRole('button', { name: '전체' });
    fireEvent.click(allBtn);
  });

  // 모달 닫기 — ✕ 버튼
  test('공지 상세 모달에서 ✕ 버튼을 클릭하면 모달이 닫히는가', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: mainPageMockData.notices }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    const noticeItem = await screen.findByText(mainPageMockData.notices[0].title);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { description_html: '<p>성공</p>' } }),
    });
    fireEvent.click(noticeItem);

    const closeBtn = await screen.findByText('✕');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('공지 상세 정보')).not.toBeInTheDocument();
    });
  });

  // isLoading 상태에서 로딩 메시지 렌더링
  test('데이터 로딩 중일 때 로딩 메시지가 표시되는가', () => {
    useLMSStore.setState({
      notices: { data: [], isLoading: true, isFetched: false },
      messages: { data: [], isLoading: false, isFetched: false },
    });

    render(<NoticeTab accessToken={mockToken} />);
    expect(screen.getByText('데이터를 불러오는 중입니다...')).toBeInTheDocument();
  });

  // 공지사항 빈 목록 메시지
  test('공지사항이 없으면 빈 목록 메시지가 출력되는가', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    });

    render(<NoticeTab accessToken={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText('공지사항이 없습니다.')).toBeInTheDocument();
    });
  });

  // 쪽지함 빈 목록 메시지
  test('쪽지가 없으면 빈 쪽지함 메시지가 출력되는가', async () => {
    useLMSStore.setState({
      notices: { data: [], isLoading: false, isFetched: true },
      messages: { data: [], isLoading: false, isFetched: true },
    });

    render(<NoticeTab accessToken={mockToken} />);
    fireEvent.click(screen.getByRole('button', { name: '쪽지함' }));

    expect(screen.getByText('받은 쪽지가 없습니다.')).toBeInTheDocument();
  });

  // clearLMSStore 호출 확인
  test('clearLMSStore 호출 시 스토어 상태가 초기화되는가', () => {
    useLMSStore.setState({
      notices: { data: mainPageMockData.notices, isLoading: false, isFetched: true },
      messages: { data: [], isLoading: false, isFetched: true },
    });

    useLMSStore.getState().clearLMSStore();

    const state = useLMSStore.getState();
    expect(state.notices.data).toEqual([]);
    expect(state.notices.isFetched).toBe(false);
    expect(state.messages.isFetched).toBe(false);
  });

  // /api/download href 도메인 치환 확인
  test('description_html의 /api/download 링크가 절대경로로 치환되는가', async () => {
    const noticeWithDownload = [
      {
        ...mainPageMockData.notices[0],
        description_html: '<p><a href="/api/download/file.pdf">파일</a></p>',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: noticeWithDownload }),
    });

    render(<NoticeTab accessToken={mockToken} />);
    fireEvent.click(await screen.findByText(noticeWithDownload[0].title));

    // 상대 경로 호스트 주소가 모킹된 API_BASE_URL 기반 절대 주소로 문자열 바인딩 되는지 검증
    await waitFor(() => {
      const link = screen.getByRole('link', { name: '파일' });
      expect(link.getAttribute('href')).toBe('http://localhost:8000/api/download/file.pdf');
    });
  });
});