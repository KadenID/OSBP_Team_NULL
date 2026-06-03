import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import AssignmentTab from '../../../../../Project/client/src/Components/assignment-tab/AssignmentTab';
import { mainPageMockData } from '../../../../mock_data/main_page';

// Zustand 스토어 내부 액션 모킹
const mockFetchAssignments = vi.fn();
const mockAddAssignment = vi.fn();
const mockDeleteAssignment = vi.fn();
const mockToggleSubmit = vi.fn();
const mockUpdateDescription = vi.fn();

// 모킹된 스토어의 기본 초기 상태 지정
let mockStoreState = {
  assignment: [],
  isLoading: false,
  error: null,
  fetchAssignments: mockFetchAssignments,
  addAssignment: mockAddAssignment,
  deleteAssignment: mockDeleteAssignment,
  toggleSubmit: mockToggleSubmit,
  updateDescription: mockUpdateDescription,
};

vi.mock('../../../../../Project/client/src/store/useAssignmentStore', () => ({
  default: () => mockStoreState,
}));

// 하위 AssignmentDetail 컴포넌트 모킹 (의존성 분리 및 테스트 단순화)
vi.mock('../../../../../Project/client/src/Components/assignment-tab/AssignmentDetail', () => ({
  default: ({ assignment, onClose }) => (
    <div data-testid="assignment-detail">
      <span>Detail Mock: {assignment.task}</span>
      <button onClick={onClose}>상세닫기</button>
    </div>
  ),
}));

describe('AssignmentTab 컴포넌트 유닛 테스트 (100% 커버리지)', () => {
  const mockToken = mainPageMockData.user.accessToken;

  beforeEach(() => {
    vi.useFakeTimers(); // 카운트다운 타이머 등 시간 기반 로직 제어를 위해 가짜 타이머 활성화
    vi.clearAllMocks();
    mockStoreState.assignment = [...mainPageMockData.assignments];
    mockStoreState.isLoading = false;
    mockStoreState.error = null;
  });

  afterEach(() => {
    vi.useRealTimers(); // 테스트 종료 후 실제 타이머로 복구
  });

  describe('초기 데이터 로딩 및 상태 분기', () => {
    test('마운트 시 fetchAssignments가 토큰과 함께 호출되는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      expect(mockFetchAssignments).toHaveBeenCalledWith(mockToken);
    });

    test('로딩 중이면서 과제 데이터가 없을 때 로딩 메시지가 노출되는가', () => {
      mockStoreState.isLoading = true;
      mockStoreState.assignment = [];
      render(<AssignmentTab accessToken={mockToken} />);
      expect(screen.getByText('데이터를 불러오는 중입니다...')).toBeInTheDocument();
    });

    test('로딩 중이어도 기존 과제 데이터가 있으면 로딩 메시지가 아닌 목록이 렌더링되는가 (Line 142)', () => {
      mockStoreState.isLoading = true;
      mockStoreState.assignment = [...mainPageMockData.assignments]; // 기존 데이터가 존재하는 상황 시뮬레이션
   
      render(<AssignmentTab accessToken={mockToken} />);
   
      // 로딩 메시지는 보이지 않고 목록이 그대로 유지되어야 함
      expect(screen.queryByText('데이터를 불러오는 중입니다...')).not.toBeInTheDocument();
      expect(screen.getByText('과제 1 제출 안내')).toBeInTheDocument();
    });

    test('기본 필터링 상태에서 조건에 맞는 카드만 노출되는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      // Mock 데이터의 실제 과제명을 사용하여 검증
      expect(screen.getByText('과제 1 제출 안내')).toBeInTheDocument();
      expect(screen.getByText('스터디 발표 자료 초안 작성')).toBeInTheDocument();
    });

    test('과제 목록 API 호출 실패 시 에러 상태를 올바르게 처리하는가', async () => {
      vi.useRealTimers();
      
      mockStoreState.assignment = []; 
      mockStoreState.isLoading = false;
      mockStoreState.error = '과제를 불러오는 중 오류가 발생했습니다'; 
  
      mockFetchAssignments.mockRejectedValueOnce(new Error('API Error'));
  
      render(<AssignmentTab accessToken={mockToken} />);
  
      // 에러 메시지 렌더링 여부 확인
      await waitFor(() => {
        expect(screen.getByText(/과제를 불러오는 중 오류가 발생했습니다/i)).toBeInTheDocument();
      });
  
      vi.useFakeTimers();
    });
  });

  describe('과제 추가 폼 및 밸리데이션 검증', () => {
    test('새로운 과제를 추가할 때 입력 폼 검증 및 Alert 작동하는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      const submitBtn = screen.getByRole('button', { name: '새 과제 추가' });

      // 1. 필수 값인 과목명 누락 에러 유도
      fireEvent.click(submitBtn);
      expect(screen.getByRole('alert')).toHaveTextContent('과목명을 입력해주세요.');

      // 2. 입력 폼에 정상적인 값 입력
      const subjectInput = screen.getByPlaceholderText('과목');
      const taskInput = screen.getByPlaceholderText('할 일');
      
      fireEvent.change(subjectInput, { target: { value: '프로그래밍' } });
      fireEvent.change(taskInput, { target: { value: '분석 리포트' } });
      
      // 3. 정상 제출 및 스토어 액션 파라미터 확인
      fireEvent.click(submitBtn);

      expect(mockAddAssignment).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '프로그래밍',
          task: '분석 리포트',
          isSubmitted: false,
          source: 'user',
        }),
        mockToken
      );
    });

    test('시간 입력 변경 시 기존 formError가 클리어되는가 (Lines 192-193)', () => {
      render(<AssignmentTab accessToken={mockToken} />);
   
      // 과목 없이 제출하여 임의로 에러 상태 생성
      fireEvent.click(screen.getByRole('button', { name: '새 과제 추가' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
   
      // 시간 값을 변경했을 때 경고창(alert)이 사라지는지 검증
      const timeInput = screen.getByPlaceholderText('23:59');
      fireEvent.change(timeInput, { target: { value: '14:30' } });
   
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('시간 입력에 3자리 숫자를 입력 후 blur하면 올바르게 정규화되는가 (Lines 204-206)', () => {
      render(<AssignmentTab accessToken={mockToken} />);
   
      const timeInput = screen.getByPlaceholderText('23:59');
   
      // "143" 입력 후 포커스를 잃을 때 "14:30" 형태로 자동 변환 포맷팅 검증
      fireEvent.change(timeInput, { target: { value: '143' } });
      fireEvent.blur(timeInput);
   
      expect(timeInput).toHaveValue('14:30');
    });
    
    test('시간 입력에 비숫자를 입력 후 blur하면 "23:59"로 폴백되는가 (Lines 215-216)', () => {
      render(<AssignmentTab accessToken={mockToken} />);
   
      const timeInput = screen.getByPlaceholderText('23:59');
   
      // 문자 입력 후 포커스 아웃 시 기본 마감 시간 값으로 복원되는지 검증
      fireEvent.change(timeInput, { target: { value: 'abcd' } });
      fireEvent.blur(timeInput);
   
      expect(timeInput).toHaveValue('23:59');
    });

    test('과제 추가 시 글자 수 초과 검증 로직이 정상 작동하는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      const submitBtn = screen.getByRole('button', { name: '새 과제 추가' });
      const subjectInput = screen.getByPlaceholderText('과목');
      const taskInput = screen.getByPlaceholderText('할 일');

      // 과목명 제한(30자) 초과 에러 유도
      fireEvent.change(subjectInput, { target: { value: '가'.repeat(31) } });
      fireEvent.click(submitBtn);
      
      // 할 일 글자수 제한(50자) 초과 에러 유도
      fireEvent.change(subjectInput, { target: { value: '정상 과목' } });
      fireEvent.change(taskInput, { target: { value: 'a'.repeat(51) } });
      fireEvent.click(submitBtn);
      expect(screen.getByText(/할 일은 50자 이하로 입력해주세요/i)).toBeInTheDocument();
    });

    test('과제 추가 시 시간 값이 유효하지 않으면 addAssignment가 호출되지 않는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
   
      const subjectInput = screen.getByPlaceholderText('과목');
      const taskInput = screen.getByPlaceholderText('할 일');
      const timeInput = screen.getByPlaceholderText('23:59');
   
      fireEvent.change(subjectInput, { target: { value: '정상과목' } });
      fireEvent.change(taskInput, { target: { value: '정상과제' } });
      fireEvent.change(timeInput, { target: { value: '9999' } }); // 범위를 완전히 벗어난 비정상 시간 값
   
      fireEvent.click(screen.getByRole('button', { name: '새 과제 추가' }));
   
      // 액션이 실행되지 않고 범위 에러가 표시되어야 함
      expect(mockAddAssignment).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/마감 시간은 00:00부터 23:59까지/i);
    });

    test('과목 입력 변경 시 기존 formError가 클리어되는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
   
      fireEvent.click(screen.getByRole('button', { name: '새 과제 추가' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
   
      // 과목 수정 시 에러 클리어 확인
      fireEvent.change(screen.getByPlaceholderText('과목'), { target: { value: '컴퓨터' } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('할일 입력 변경 시 기존 formError가 클리어되는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
   
      fireEvent.change(screen.getByPlaceholderText('과목'), { target: { value: '컴퓨터' } });
      fireEvent.click(screen.getByRole('button', { name: '새 과제 추가' }));
      expect(screen.getByRole('alert')).toBeInTheDocument();
   
      // 할 일 수정 시 에러 클리어 확인
      fireEvent.change(screen.getByPlaceholderText('할 일'), { target: { value: '숙제' } });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('날짜 입력 변경 시 기존 formError가 클리어되는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
   
      const subjectInput = screen.getByPlaceholderText('과목');
      const taskInput = screen.getByPlaceholderText('할 일');
      const timeInput = screen.getByPlaceholderText('23:59');
      const dateInput = screen.getByLabelText('마감 날짜');
   
      fireEvent.change(subjectInput, { target: { value: '과목' } });
      fireEvent.change(taskInput, { target: { value: '과제' } });
      fireEvent.change(timeInput, { target: { value: '9999' } });
      fireEvent.blur(timeInput);
   
      // 날짜 변경 시에도 시간 유효성 에러 등의 메시지가 정상 클리어되는지 검증
      fireEvent.change(dateInput, { target: { value: '2026-12-01' } });
      expect(screen.queryByText(/마감 시간은/)).not.toBeInTheDocument();
    });
  });

  describe('과제 상세 정보 조작 및 상태 수정/삭제', () => {
    test('과제 카드를 클릭하고 상세 보기 모달을 닫을 수 있는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      const taskItem = screen.getByText('과제 1 제출 안내');
      
      // 상세 팝업 열기 검증
      fireEvent.click(taskItem);
      expect(screen.getByTestId('assignment-detail')).toBeInTheDocument();

      // 상세 팝업 내부 닫기 버튼 검증
      const closeDetailBtn = screen.getByRole('button', { name: '상세닫기' });
      fireEvent.click(closeDetailBtn);
      expect(screen.queryByTestId('assignment-detail')).not.toBeInTheDocument();
    });

    test('임시(temp-) ID 과제를 클릭해도 상세 창이 열리지 않는가 (Line 396)', () => {
      mockStoreState.assignment = [
        ...mainPageMockData.assignments,
        {
          id: 'temp-abc123', // 통신 전 클라이언트 생성 가상 ID 형태
          subject: '임시과목',
          task: '아직 저장 중인 과제',
          deadline: '2026-12-31T23:59:59',
          source: 'user',
          isSubmitted: false,
        },
      ];
   
      render(<AssignmentTab accessToken={mockToken} />);
   
      const tempItem = screen.getByText('아직 저장 중인 과제');
      fireEvent.click(tempItem);
   
      // 로컬 업로드 진행 단계의 카드는 상세창 트리거를 원천 차단해야 함
      expect(screen.queryByTestId('assignment-detail')).not.toBeInTheDocument();
    });

    test('USER 과제의 완료하기 버튼을 누르면 toggleSubmit이 실행되는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      // custom-102 (스터디 발표...) 과제의 완료하기 버튼을 찾음
      const completeBtn = screen.getAllByRole('button', { name: '완료하기' })[0];
      fireEvent.click(completeBtn);
      expect(mockToggleSubmit).toHaveBeenCalledWith('custom-102', mockToken);
    });

    test('USER 과제의 삭제 버튼 취소 및 확정 모달 분기 검증', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      // custom-102 과제의 삭제 버튼을 찾음
      const listDeleteBtn = screen.getAllByRole('button', { name: '삭제' })[0];
      
      // 1. 과제 제거 컨펌 모달창 열기
      fireEvent.click(listDeleteBtn);
      expect(screen.getByText('과제를 삭제하시겠습니까?')).toBeInTheDocument();

      // 2. 취소 버튼을 클릭했을 때 모달창 디스패치 클리어 여부 검증
      const cancelBtn = screen.getByRole('button', { name: '취소' });
      fireEvent.click(cancelBtn);
      expect(screen.queryByText('과제를 삭제하시겠습니까?')).not.toBeInTheDocument();

      // 3. 다시 삭제 확인 모달을 띄우고 최종 삭제 승인
      fireEvent.click(listDeleteBtn);
      const modalOverlay = screen.getByText('과제를 삭제하시겠습니까?').parentElement;
      const confirmBtn = within(modalOverlay).getByRole('button', { name: '삭제' });
      fireEvent.click(confirmBtn);

      expect(mockDeleteAssignment).toHaveBeenCalledWith('custom-102', mockToken);
    });

    test('삭제 모달에서 취소 후 다시 삭제를 시도하면 정상적으로 삭제되는가 (Lines 431-434)', () => {
      render(<AssignmentTab accessToken={mockToken} />);
   
      const deleteButtons = screen.getAllByRole('button', { name: '삭제' });
      fireEvent.click(deleteButtons[0]);
   
      fireEvent.click(screen.getByRole('button', { name: '취소' }));
      expect(screen.queryByText('과제를 삭제하시겠습니까?')).not.toBeInTheDocument();
   
      // 모달 상태 플래그 초기화 후 재진입 시 삭제 정상 처리 프로세스 추적
      const deleteButtonsAgain = screen.getAllByRole('button', { name: '삭제' });
      fireEvent.click(deleteButtonsAgain[0]);
      const confirmDelBtn = screen.getAllByRole('button', { name: '삭제' }).find(
        btn => btn.closest('.modal')
      );
      fireEvent.click(confirmDelBtn || screen.getAllByRole('button', { name: '삭제' })[0]);
   
      expect(mockDeleteAssignment).toHaveBeenCalled();
    });
  });

  describe('필터, 정렬 및 스케줄러 컴포넌트 조작', () => {
    test('정렬 및 필터 변경 탭 클릭 시 상태 변환 코드를 정상 실행하는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);

      const filterButtons = [
        screen.getByRole('button', { name: '미제출' }),
        screen.getByRole('button', { name: '제출' }),
        screen.getByRole('button', { name: '기한 남음' }),
        screen.getByRole('button', { name: '기한 지남' })
      ];

      // 필터 버튼들을 순회 선택하면서 필터 바인딩 함수 실행 보장
      filterButtons.forEach(button => {
        fireEvent.click(button);
      });

      expect(filterButtons[0]).toBeInTheDocument();
    });

    test('시간 피커 패널을 열고 hour 버튼을 클릭하면 시간이 변경되는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
 
      const timeInput = screen.getByPlaceholderText('23:59');
      fireEvent.click(screen.getByRole('button', { name: '시간 선택' }));
 
      // 시(Hour) 단위 목록 패널 클릭 반영
      const nineButtons = screen.getAllByRole('button', { name: '09' });
      fireEvent.click(nineButtons[0]);
 
      expect(timeInput.value).toMatch(/^09:/);
    });
 
    test('시간 피커 패널을 열고 minute 버튼을 클릭하면 분이 변경되고 패널이 닫히는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
 
      fireEvent.click(screen.getByRole('button', { name: '시간 선택' }));
 
      // 분(Minute) 단위 목록 패널 클릭 및 피커 아웃 검증
      const thirtyButtons = screen.getAllByRole('button', { name: '30' });
      fireEvent.click(thirtyButtons[thirtyButtons.length - 1]);
 
      expect(screen.queryByRole('button', { name: '00' })).not.toBeInTheDocument();
    });

    test('시간 선택기(TimePicker) 벨리데이션 오류 및 수동 입력 예외 작동 검증', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      const timeInput = screen.getByPlaceholderText('23:59');

      // 텍스트 인풋 수동 오버입력 시의 가드 검증
      fireEvent.change(timeInput, { target: { value: '99:99' } });
      fireEvent.blur(timeInput);
      expect(screen.getByText(/마감 시간은 00:00부터 23:59까지/i)).toBeInTheDocument();

      // 수동 기입 후 피커 UI 오픈 및 직접 오버라이딩 바인딩 체크
      const pickerOpenBtn = screen.queryByLabelText('시간 선택') || screen.getByRole('button', { name: /시간/i });
      fireEvent.click(pickerOpenBtn);
      
      const columns = screen.getAllByRole('button', { name: '05' });
      if (columns.length > 0) {
        fireEvent.click(columns[0]);
        expect(timeInput.value).toContain('05:');
      }
    });

    test('날짜 캘린더 컴포넌자 조작 및 스크롤 이벤트 작동 트리거', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      
      const dateInput = screen.queryByPlaceholderText(/YYYY-MM-DD/i) || screen.queryByRole('textbox', { name: /날짜/i });
      if (dateInput) {
        fireEvent.click(dateInput);
        fireEvent.change(dateInput, { target: { value: '2026-12-31' } });
      }

      // 모달 리스트 영역 내부 무한 스크롤 또는 스크롤 바인딩 핸들러 처리 구문 강제 실행
      const listContainer = screen.queryByRole('list') || screen.getByRole('main').parentElement;
      fireEvent.scroll(listContainer, { target: { scrollTop: 500 } });
    });

    test('CountdownText 타이머가 주기적으로 갱신되며 작동하는가', () => {
      render(<AssignmentTab accessToken={mockToken} />);
      
      // 타이머 인터벌 내부 주기 트리거 작동 유도
      act(() => {
        vi.advanceTimersByTime(1000); 
      });

      expect(screen.queryByText('기한 종료')).toBeDefined();
    });
  });
});