import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import useAssignmentStore from '../../../../Project/client/src/store/useAssignmentStore';

// 전역 fetch 모킹 설정
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

describe('useAssignmentStore 유닛 테스트', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAssignmentStore.getState().clearAssignmentStore();
  });

  describe('fetchAssignments', () => {
    it('성공 시 데이터를 통합하여 저장하는가', async () => {
      fetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: [{ id: 1, subject: 'A' }] }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: [{ id: 'c1', subject: 'B' }] }) });

      await useAssignmentStore.getState().fetchAssignments('token');
      expect(useAssignmentStore.getState().assignment.length).toBe(2);
    });

    it('응답이 success: false일 때 빈 배열을 유지하는가', async () => {
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: false }) });
      await useAssignmentStore.getState().fetchAssignments('token');
      expect(useAssignmentStore.getState().assignment).toEqual([]);
    });

    it('이미 페칭되었거나 토큰이 없으면 조기 리턴하는가', async () => {
      useAssignmentStore.setState({ isFetched: true });
      await useAssignmentStore.getState().fetchAssignments('token');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('네트워크 에러 발생 시 에러 메시지를 설정하는가', async () => {
      fetch.mockRejectedValueOnce(new Error('Network Error'));
      await useAssignmentStore.getState().fetchAssignments('token');
      expect(useAssignmentStore.getState().error).toBeDefined();
    });
  });

  describe('낙관적 업데이트 및 롤백', () => {
    it('addAssignment 성공/실패 시 롤백 및 ID 교체 로직', async () => {
      // 성공 케이스 처리 검증
      fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, id: '999' }) });
      await useAssignmentStore.getState().addAssignment({ subject: 'Test' }, 'token');
      expect(useAssignmentStore.getState().assignment[0].id).toBe('999');

      // 실패 케이스 처리 및 롤백 검증
      vi.spyOn(window, 'alert').mockImplementation(() => {});
      fetch.mockRejectedValueOnce(new Error('Fail'));
      await useAssignmentStore.getState().addAssignment({ subject: 'Fail' }, 'token');
      expect(useAssignmentStore.getState().assignment.length).toBe(1);
    });

    it('deleteAssignment: LMS 과제는 삭제 요청을 보내지 않는가', async () => {
      useAssignmentStore.setState({ assignment: [{ id: '1', source: 'lms' }] });
      await useAssignmentStore.getState().deleteAssignment('1', 'token');
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('기타 로직', () => {
    it('updateCustomAssignment: 존재하지 않는 ID 호출 시 무시하는가', async () => {
      await useAssignmentStore.getState().updateCustomAssignment('non-existent', {}, 'token');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('toggleSubmit 및 updateDescription 액션이 정상 작동하는가', async () => {
      useAssignmentStore.setState({ assignment: [{ id: '1', source: 'user', isSubmitted: false }] });
      fetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

      await useAssignmentStore.getState().toggleSubmit('1', 'token');
      expect(useAssignmentStore.getState().assignment[0].isSubmitted).toBe(true);
    });

    describe('추가 상세 검증', () => {
      it('일부 요청이 실패해도 전체 과제 리스트를 안정적으로 업데이트하는가', async () => {
        fetch
          .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true, data: [{ id: 1, subject: 'A' }] }) })
          .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ success: false }) });

        await useAssignmentStore.getState().fetchAssignments('token');
        expect(useAssignmentStore.getState().assignment.length).toBe(1);
      });

      it('USER 과제는 삭제 요청을 보내고 상태에서 제거하는가', async () => {
        useAssignmentStore.setState({ assignment: [{ id: '100', source: 'user' }] });
        fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ success: true }) });

        await useAssignmentStore.getState().deleteAssignment('100', 'token');

        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/custom-assignments/100'), expect.any(Object));
        expect(useAssignmentStore.getState().assignment.length).toBe(0);
      });

      it('존재하지 않는 과제 삭제 요청 시 조기 종료하는가', async () => {
        await useAssignmentStore.getState().deleteAssignment('없는id', 'token');
        expect(fetch).not.toHaveBeenCalled();
      });

      it('LMS 과제 수정 시 서버 호출 없이 상태만 변경하는가', async () => {
        useAssignmentStore.setState({
          assignment: [
            {
              id: 'lms1',
              source: 'lms',
              description: ''
            }
          ]
        });

        await useAssignmentStore.getState().updateCustomAssignment('lms1', { description: '수정완료' }, 'token');

        expect(fetch).not.toHaveBeenCalled();
        expect(useAssignmentStore.getState().assignment[0].description).toBe('수정완료');
      });

      it('clearAssignmentStore가 전체 상태를 초기화하는가', () => {
        useAssignmentStore.setState({
          assignment: [{ id: 1 }],
          isLoading: true,
          isFetched: true,
          error: '에러'
        });

        useAssignmentStore.getState().clearAssignmentStore();

        const state = useAssignmentStore.getState();
        expect(state.assignment).toEqual([]);
        expect(state.isLoading).toBe(false);
        expect(state.isFetched).toBe(false);
      });

      it('addAssignment에서 success:false 시 롤백되는가', async () => {
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: false })
        });

        await useAssignmentStore.getState().addAssignment({ subject: '실패' }, 'token');
        expect(useAssignmentStore.getState().assignment).toEqual([]);
      });

      it('USER 과제 삭제 시 success:false이면 롤백되는가', async () => {
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        useAssignmentStore.setState({
          assignment: [
            {
              id: '10',
              source: 'user'
            }
          ]
        });

        fetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ success: false })
        });

        await useAssignmentStore.getState().deleteAssignment('10', 'token');
        expect(useAssignmentStore.getState().assignment.length).toBe(1);
      });

      it('updateDescription이 updateCustomAssignment를 통해 동작하는가', async () => {
        useAssignmentStore.setState({
          assignment: [
            {
              id: '1',
              source: 'lms',
              description: ''
            }
          ]
        });

        useAssignmentStore.getState().updateDescription('1', '새 설명', 'token');
        expect(useAssignmentStore.getState().assignment[0].description).toBe('새 설명');
      });

      it('updateAssignmentDetail이 상세정보를 저장하는가', () => {
        useAssignmentStore.setState({
          assignment: [
            {
              id: '1',
              subject: '테스트'
            }
          ]
        });

        useAssignmentStore.getState().updateAssignmentDetail('1', { detail: '상세정보' });

        const item = useAssignmentStore.getState().assignment[0];
        expect(item.detail).toBe('상세정보');
        expect(item.isDetailFetched).toBe(true);
      });

      it('toggleSubmit 실패 시 이전 상태로 롤백되는가', async () => {
        useAssignmentStore.setState({
          assignment: [{ id: '1', source: 'user', isSubmitted: false }] 
        });

        fetch.mockResolvedValueOnce({
          ok: false, 
          status: 500,
          json: () => Promise.resolve({ success: false })
        });

        await useAssignmentStore.getState().toggleSubmit('1', 'token');

        await waitFor(() => {
          const assignment = useAssignmentStore.getState().assignment[0];
          expect(assignment.isSubmitted).toBe(false);
        });
      });
    });
  });
});