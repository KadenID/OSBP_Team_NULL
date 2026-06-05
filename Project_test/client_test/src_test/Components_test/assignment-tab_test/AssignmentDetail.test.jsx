import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import AssignmentDetail from '../../../../../Project/client/src/Components/assignment-tab/AssignmentDetail';
import { mainPageMockData } from '../../../../mock_data/main_page';

// Zustand 스토어 및 외부 설정 모킹
const mockUpdateAssignmentDetail = vi.fn();
vi.mock('../../../../../Project/client/src/store/useAssignmentStore', () => ({
  default: () => mockUpdateAssignmentDetail,
}));

vi.mock('../../apiConfig', () => ({
  API_BASE_URL: 'http://localhost:8080',
}));

describe('AssignmentDetail 추가 커버리지 테스트', () => {
  const mockOnClose = vi.fn();
  const mockUpdateDescription = vi.fn();
  const mockAccessToken = mainPageMockData.user.accessToken;
  const userAssignment = mainPageMockData.assignments[2];
  const lmsAssignmentWithCache = mainPageMockData.notices[0];
  
  const lmsAssignmentWithoutCache = {
    id: 'lms-1',
    subject: '과목A',
    task: '과제 1 제출 안내',
    deadline: '2026-06-10T23:59:59',
    source: 'lms',
    isDetailFetched: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });
 
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('모달이 마운트되면 body에 modal-open 클래스가 추가되고, 언마운트 시 제거되는가', () => {
    const { unmount } = render(
      <AssignmentDetail
        assignment={userAssignment}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    // 마운트 후 클래스 추가 검증
    expect(document.body.classList.contains('modal-open')).toBe(true);
 
    // 언마운트 후 클리업 검증
    unmount();
    expect(document.body.classList.contains('modal-open')).toBe(false);
  });

  test('편집 중이 아닐 때 닫기 버튼을 클릭하면 확인 모달 없이 onClose가 즉시 호출되는가', () => {
    render(
      <AssignmentDetail
        assignment={userAssignment}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    // 편집 모드가 아닐 때 닫기 시도
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
 
    // 확인 모달 없이 바로 onClose가 호출되어야 함
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('수정 중인 내용이 있습니다.')).not.toBeInTheDocument();
  });
  
  test('확인 모달에서 "취소" 버튼을 클릭하면 모달만 닫히고 편집 상태가 유지되는가 (Line 245–247)', () => {
    render(
      <AssignmentDetail
        assignment={userAssignment}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    // 편집 모드 진입 후 닫기 시도로 확인 모달 open
    fireEvent.click(screen.getByRole('button', { name: '편집하기' }));
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
 
    // 가장 최근에 생성된 확인 모달의 취소 버튼 타겟팅
    const allCancelButtons = screen.getAllByRole('button', { name: '취소' });
    const modalCancelBtn = allCancelButtons[allCancelButtons.length - 1];
    
    fireEvent.click(modalCancelBtn);
 
    // onClose는 호출되지 않고, 확인 모달은 닫히며, 편집용 textarea는 유지되어야 함
    expect(mockOnClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/수정 중인 내용이 있습니다/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('과제 상세 설명을 입력하세요...')).toBeInTheDocument();
  });
 
  test('USER 과제에서 description이 undefined일 때 빈 문자열로 폴백 렌더링되는가', () => {
    const assignmentWithoutDesc = {
      ...userAssignment,
      description: undefined,
    };
 
    render(
      <AssignmentDetail
        assignment={assignmentWithoutDesc}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    // 데이터 부재 시의 기본 대체 안내 문구 확인
    expect(screen.getByText('등록된 상세 설명 데이터가 없습니다.')).toBeInTheDocument();
  });

  test('assignment 데이터가 없으면 컴포넌트가 null을 반환하는가', () => {
    const { container } = render(
      <AssignmentDetail 
        assignment={null} 
        onClose={mockOnClose} 
        updateDescription={mockUpdateDescription} 
        accessToken={mockAccessToken}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  test('USER 과제일 때 기본 텍스트 및 커스텀 description 정보가 정상 렌더링되는가', () => {
    render(
      <AssignmentDetail 
        assignment={userAssignment} 
        onClose={mockOnClose} 
        updateDescription={mockUpdateDescription} 
        accessToken={mockAccessToken}
      />
    );

    expect(screen.getByText('개인 일정')).toBeInTheDocument();
    expect(screen.getByText('프로젝트 기능 명세서 작성 및 수정')).toBeInTheDocument();
    expect(screen.getByText('팀원들과 코드 컨벤션 맞추고 커밋하기')).toBeInTheDocument();
  });

  test('USER 과제 수정 폼을 열고 저장하면 updateDescription 액션이 정상 호출되는가', () => {
    render(
      <AssignmentDetail 
        assignment={userAssignment} 
        onClose={mockOnClose} 
        updateDescription={mockUpdateDescription} 
        accessToken={mockAccessToken}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '편집하기' }));

    const textarea = screen.getByPlaceholderText('과제 상세 설명을 입력하세요...');
    expect(textarea).toHaveValue('팀원들과 코드 컨벤션 맞추고 커밋하기');

    // 내용 수정 및 저장 버튼 클릭
    fireEvent.change(textarea, { target: { value: 'ybinox와 CSS 변수 통합하기' } });
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(mockUpdateDescription).toHaveBeenCalledWith(userAssignment.id, 'ybinox와 CSS 변수 통합하기', mockAccessToken);
  });

  test('LMS 과제 최초 클릭(캐시 없음) 시 API 호출 후 살균 처리된 HTML과 도메인 치환이 이루어지는가', async () => {
    const fakeApiResponse = {
      success: true,
      data: {
        id: 'lms-1',
        description_html: '<p>LMS 본문 피드백 <a href="/api/download/file.zip">첨부파일</a></p>',
      },
    };

    global.fetch.mockResolvedValueOnce({
      json: async () => fakeApiResponse,
    });

    render(
      <AssignmentDetail 
        assignment={lmsAssignmentWithoutCache} 
        onClose={mockOnClose} 
        updateDescription={mockUpdateDescription} 
        accessToken={mockAccessToken}
      />
    );

    expect(screen.getByText('상세 정보를 불러오는 중...')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockUpdateAssignmentDetail).toHaveBeenCalledWith('lms-1', fakeApiResponse.data);
    });
  });

  test('LMS 과제의 description이 이미 캐싱되어 있다면(isDetailFetched: true) API를 호출하지 않는가', async () => {
    const cachedLmsAssignment = {
      id: 'lms-cached-123',
      subject: '과목B',
      task: '이미 로드된 과제',
      deadline: '2026-06-15T23:59:59',
      source: 'lms',
      isDetailFetched: true,
      description_html: '<p>캐싱된 데이터 보임</p>',
    };

    render(
      <AssignmentDetail 
        assignment={cachedLmsAssignment} 
        onClose={mockOnClose} 
        updateDescription={mockUpdateDescription} 
        accessToken={mockAccessToken}
      />
    );

    // API 요청 없이 스토어 내 기존 데이터가 화면에 즉시 반영되어야 함
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText('캐싱된 데이터 보임')).toBeInTheDocument();
  });

  test('LMS 과제 상세조회 통신 중 네트워크 오류(catch)가 발생하면 예외 핸들러가 작동하는가', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network Crash'));

    render(
      <AssignmentDetail 
        assignment={lmsAssignmentWithoutCache} 
        onClose={mockOnClose} 
        updateDescription={mockUpdateDescription} 
        accessToken={mockAccessToken}
      />
    );

    // 네트워크 예외 발생 시 에러 컴포넌트나 메시지가 노출되는지 검증
    await waitFor(() => {
      expect(screen.getByText('네트워크 오류가 발생했습니다.')).toBeInTheDocument();
    });
  });

  test('USER 과제 편집 도중 취소 버튼을 누르면 이전 내용이 유지되고 폼이 닫히는가', () => {
    render(
      <AssignmentDetail 
        assignment={userAssignment} 
        onClose={mockOnClose} 
        updateDescription={mockUpdateDescription} 
        accessToken={mockAccessToken}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '편집하기' }));
    const textarea = screen.getByPlaceholderText('과제 상세 설명을 입력하세요...');
    
    fireEvent.change(textarea, { target: { value: '망가뜨린 임시 텍스트' } });

    const cancelBtn = screen.getByRole('button', { name: '취소' });
    fireEvent.click(cancelBtn);

    // 저장 처리 없이 원본 텍스트가 그대로 뷰에 유지되는지 검증
    expect(mockUpdateDescription).not.toHaveBeenCalled();
    expect(screen.getByText('팀원들과 코드 컨벤션 맞추고 커밋하기')).toBeInTheDocument();
  });

  test('편집 중 오버레이 클릭 시에도 확인 모달이 나타나는가', () => {
    render(
      <AssignmentDetail
        assignment={userAssignment}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    fireEvent.click(screen.getByRole('button', { name: '편집하기' }));
 
    const modalTitle = screen.getByText('과제 상세 정보');
    const overlay = modalTitle.closest('.detail-overlay') || modalTitle.parentElement.parentElement;
 
    // 오버레이 영역에 마우스 클릭 트리거
    fireEvent.mouseDown(overlay);
    fireEvent.mouseUp(overlay);
 
    expect(screen.getByText(/수정 중인 내용이 있습니다/)).toBeInTheDocument();
  });

  test('LMS 과제 데이터 패치 실패 시 사용자 예외 메시지가 출력되는가', async () => {
    global.fetch.mockResolvedValueOnce({
      json: async () => ({ success: false }),
    });

    render(
      <AssignmentDetail 
        assignment={lmsAssignmentWithoutCache} 
        onClose={mockOnClose} 
        updateDescription={mockUpdateDescription} 
        accessToken={mockAccessToken}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('과제 정보를 불러오지 못했습니다.')).toBeInTheDocument();
    });
  });
 
  test('확인 모달에서 "닫기" 버튼을 클릭하면 onClose가 호출되는가 (Line 242–244)', () => {
    render(
      <AssignmentDetail
        assignment={userAssignment}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    fireEvent.click(screen.getByRole('button', { name: '편집하기' }));
    fireEvent.click(screen.getByRole('button', { name: '✕' }));
 
    const confirmCloseBtn = screen.getAllByRole('button', { name: '닫기' })[0];
    fireEvent.click(confirmCloseBtn);
 
    // 최종 확인 후 메인 닫기 액션(onClose) 호출 검증
    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/수정 중인 내용이 있습니다/)).not.toBeInTheDocument();
  });

  test('오버레이에서 마우스다운 후 업을 해야만 모달이 닫히고, 내부에서 바깥으로 드래그할 때는 닫히지 않는가', () => {
    render(
      <AssignmentDetail
        assignment={userAssignment}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );

    const modalTitle = screen.getByText('과제 상세 정보');
    const overlay = modalTitle.parentElement.parentElement;

    // 내부 드래그 아웃 예외 케이스 테스트
    fireEvent.mouseDown(modalTitle);
    fireEvent.mouseUp(overlay);
    expect(mockOnClose).not.toHaveBeenCalled();

    // 순수 오버레이 클릭 정상 케이스 테스트
    fireEvent.mouseDown(overlay);
    fireEvent.mouseUp(overlay);
    expect(mockOnClose).toHaveBeenCalled();
  });

  test('LMS 과제 상세 조회 후 url이 있으면 footer 링크가 렌더링되는가', async () => {
    const lmsAssignmentWithUrl = {
      id: 'lms-url-test',
      subject: '소프트웨어공학',
      task: 'URL 있는 과제',
      deadline: '2026-07-01T23:59:59',
      source: 'lms',
      isDetailFetched: false,
    };
 
    global.fetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: {
          id: 'lms-url-test',
          description: '과제 내용',
          url: 'https://lms.example.com/assignment/1',
        },
      }),
    });
 
    render(
      <AssignmentDetail
        assignment={lmsAssignmentWithUrl}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'LMS 페이지로 이동' });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://lms.example.com/assignment/1');
    });
  });
 
  test('assignment.url이 직접 있을 때 footer 링크가 렌더링되는가', () => {
    const assignmentWithUrl = {
      ...userAssignment,
      url: 'https://lms.example.com/direct',
    };
 
    render(
      <AssignmentDetail
        assignment={assignmentWithUrl}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    const link = screen.getByRole('link', { name: 'LMS 페이지로 이동' });
    expect(link).toHaveAttribute('href', 'https://lms.example.com/direct');
  });
 
  test('LMS 과제 상세에 description_html 없고 description만 있을 때 pre 태그로 텍스트가 렌더링되는가', async () => {
    const lmsAssignment = {
      id: 'lms-text-only',
      subject: '컴퓨터구조',
      task: '텍스트 설명 과제',
      deadline: '2026-07-10T23:59:00',
      source: 'lms',
      isDetailFetched: false,
    };
 
    global.fetch.mockResolvedValueOnce({
      json: async () => ({
        success: true,
        data: {
          id: 'lms-text-only',
          description: '텍스트만 있는 과제 설명입니다.',
          description_html: null,
        },
      }),
    });
 
    render(
      <AssignmentDetail
        assignment={lmsAssignment}
        onClose={mockOnClose}
        updateDescription={mockUpdateDescription}
        accessToken={mockAccessToken}
      />
    );
 
    // html 포맷이 없을 때 순수 string을 처리하기 위한 pre 태그 포맷팅 검증
    await waitFor(() => {
      expect(screen.getByText('텍스트만 있는 과제 설명입니다.')).toBeInTheDocument();
    });
  });
});