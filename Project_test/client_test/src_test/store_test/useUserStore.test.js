import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockClearAssignmentStore = vi.fn();
const mockClearLMSStore = vi.fn();

vi.mock('../../../../Project/client/src/store/useAssignmentStore', () => ({
  default: { getState: () => ({ clearAssignmentStore: mockClearAssignmentStore }) }
}));

vi.mock('../../../../Project/client/src/Components/notice-tab/NoticeTab', () => ({
  useLMSStore: { getState: () => ({ clearLMSStore: mockClearLMSStore }) }
}));

import useUserStore from '../../../../Project/client/src/store/useUserStore';

describe('useUserStore 유닛 테스트 (100% 커버리지 목표)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useUserStore.getState().clearUserStore();
    global.fetch = vi.fn();

    Object.defineProperty(window, 'localStorage', {
      value: { removeItem: vi.fn() },
      writable: true
    });

    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('fetchUserInfo', () => {
    it('fetchUserInfo: 토큰 없거나 isFetched=true면 early return', async () => {
      await useUserStore.getState().fetchUserInfo('');
      expect(global.fetch).not.toHaveBeenCalled();

      useUserStore.setState({ userInfo: { isFetched: true } });
      await useUserStore.getState().fetchUserInfo('token');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetchUserInfo: 성공 시 data:null이어도 기본값으로 폴백되는가', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: null }),
      });

      await useUserStore.getState().fetchUserInfo('token');
      const state = useUserStore.getState();
      expect(state.userInfo.name).toBe('');
      expect(state.userInfo.isFetched).toBe(true);
    });
    
    it('fetchUserInfo: catch 발생 시 isLoading=false로 복구되는가', async () => {
      global.fetch.mockRejectedValueOnce(new Error('네트워크 에러'));

      await useUserStore.getState().fetchUserInfo('token');
      const state = useUserStore.getState();
      expect(state.userInfo.isLoading).toBe(false);
      expect(console.error).toHaveBeenCalledWith('사용자 정보 조회 실패:', expect.any(Error));
    });
  });

  describe('fetchSettingsAndCourses', () => {
    it('fetchSettingsAndCourses: 토큰 없거나 isFetched=true면 early return', async () => {
      await useUserStore.getState().fetchSettingsAndCourses('');
      expect(global.fetch).not.toHaveBeenCalled();

      useUserStore.setState({ settings: { isFetched: true } });
      await useUserStore.getState().fetchSettingsAndCourses('token');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetchSettingsAndCourses: settingsResult.success:false면 기본값 유지 (Line 95)', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: false }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: false }) });

      await useUserStore.getState().fetchSettingsAndCourses('token');
      const state = useUserStore.getState();
      expect(state.settings.email).toBe('');
      expect(state.settings.courses).toEqual([{ id: 'all', name: '전체 과목' }]);
      expect(state.settings.isFetched).toBe(true);
    });

    it('fetchSettingsAndCourses: data:null이어도 안전하게 폴백되는가', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: null }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, data: null }) });

      await useUserStore.getState().fetchSettingsAndCourses('token');
      const state = useUserStore.getState();
      expect(state.settings.email).toBe('');
      expect(state.settings.courses.length).toBe(1);
    });

    it('fetchSettingsAndCourses: 성공 시 설정 및 과목 목록이 정상 갱신되는가', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            success: true,
            data: { email: 'a@b.com', emailAlerts: true, browserAlerts: false, courseReminders: ['c1'] },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true, data: [{ id: 'c1', name: '컴퓨터과학' }] }),
        });

      await useUserStore.getState().fetchSettingsAndCourses('token');
      const state = useUserStore.getState();
      expect(state.settings.email).toBe('a@b.com');
      expect(state.settings.emailAlerts).toBe(true);
      expect(state.settings.courses).toHaveLength(2);
      expect(state.settings.isFetched).toBe(true);
    });

    it('fetchSettingsAndCourses: catch 발생 시 isLoading=false로 복구되는가', async () => {
      global.fetch.mockRejectedValueOnce(new Error('API Crash'));

      await useUserStore.getState().fetchSettingsAndCourses('token');
      const state = useUserStore.getState();
      expect(state.settings.isLoading).toBe(false);
      expect(console.error).toHaveBeenCalledWith('설정 데이터 로드 실패:', expect.any(Error));
    });
  });

  describe('fetchHistory', () => {
    it('fetchHistory: 토큰 없거나 isFetched=true면 early return', async () => {
      await useUserStore.getState().fetchHistory('');
      useUserStore.setState({ history: { isFetched: true } });
      await useUserStore.getState().fetchHistory('token');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fetchHistory: 성공 시 history 상태가 갱신되는가', async () => {
      const mockItems = [{ id: 1, title: '알림1' }];
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: mockItems }),
      });

      await useUserStore.getState().fetchHistory('token');
      const state = useUserStore.getState();
      expect(state.history.data).toEqual(mockItems);
      expect(state.history.isFetched).toBe(true);
    });

    it('fetchHistory: success:false면 isFetched가 true로 바뀌지 않는가', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });

      await useUserStore.getState().fetchHistory('token');
      expect(useUserStore.getState().history.isFetched).toBe(false);
    });

    it('fetchHistory: catch 발생 시 isLoading=false로 복구되는가', async () => {
      global.fetch.mockRejectedValueOnce(new Error('DB Error'));
      await useUserStore.getState().fetchHistory('token');

      expect(useUserStore.getState().history.isLoading).toBe(false);
      expect(console.error).toHaveBeenCalledWith('알림 내역 로드 실패:', expect.any(Error));
    });
  });

  describe('updateSettings', () => {
    it('updateSettings: 토큰 없으면 스토어만 갱신하고 fetch 미호출', async () => {
      await useUserStore.getState().updateSettings({ email: 'new@test.com' }, '');
      expect(useUserStore.getState().settings.email).toBe('new@test.com');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('updateSettings: 토큰 있으면 PUT 요청이 전송되는가', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true });
      await useUserStore.getState().updateSettings({ email: 'api@test.com' }, 'token');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/user-settings'),
        expect.objectContaining({ method: 'PUT', body: expect.stringContaining('"email":"api@test.com"') })
      );
    });

    it('updateSettings: catch 발생 시 에러를 로깅하는가', async () => {
      global.fetch.mockRejectedValueOnce(new Error('PUT Failed'));
      await useUserStore.getState().updateSettings({ email: 'err@test.com' }, 'token');
      expect(console.error).toHaveBeenCalledWith('설정 저장 실패:', expect.any(Error));
    });
  });

  describe('deleteHistoryItem', () => {
    it('deleteHistoryItem: 토큰 없으면 fetch 미호출', async () => {
      await useUserStore.getState().deleteHistoryItem(1, '');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('deleteHistoryItem: 성공 시 해당 항목이 목록에서 제거되는가', async () => {
      useUserStore.setState({ history: { data: [{ id: 1 }, { id: 2 }] } });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await useUserStore.getState().deleteHistoryItem(1, 'token');
      expect(useUserStore.getState().history.data).toEqual([{ id: 2 }]);
    });

    it('deleteHistoryItem: success:false면 목록이 변경되지 않는가', async () => {
      useUserStore.setState({ history: { data: [{ id: 1 }, { id: 2 }] } });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });

      await useUserStore.getState().deleteHistoryItem(1, 'token');
      expect(useUserStore.getState().history.data).toHaveLength(2);
    });

    it('deleteHistoryItem: catch 발생 시 에러를 로깅하는가', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Delete Error'));
      await useUserStore.getState().deleteHistoryItem(2, 'token');
      expect(console.error).toHaveBeenCalledWith('알림 내역 삭제 실패:', expect.any(Error));
    });
  });

  describe('withdraw', () => {
    it('withdraw: 토큰 없으면 실패 객체 반환', async () => {
      const result = await useUserStore.getState().withdraw('');
      expect(result).toEqual({ success: false, message: '인증 정보가 없습니다.' });
    });

    it('withdraw: 성공 시 localStorage 클리어 및 스토어 초기화가 이루어지는가', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const result = await useUserStore.getState().withdraw('token');
      expect(result).toEqual({ success: true });
      expect(window.localStorage.removeItem).toHaveBeenCalledWith('rememberedStudentId');
      expect(mockClearAssignmentStore).toHaveBeenCalled();
      expect(mockClearLMSStore).toHaveBeenCalled();
    });

    it('withdraw: success:false면 서버 메시지를 반환하는가', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, message: '탈퇴 불가 조건' }),
      });

      const result = await useUserStore.getState().withdraw('token');
      expect(result).toEqual({ success: false, message: '탈퇴 불가 조건' });
    });

    it('withdraw: success:false이고 message 없으면 기본 메시지를 반환하는가', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false }),
      });

      const result = await useUserStore.getState().withdraw('token');
      expect(result.message).toBe('탈퇴 처리 중 오류가 발생했습니다.');
    });

    it('withdraw: catch 발생 시 통신 실패 객체를 반환하는가', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Server Down'));

      const result = await useUserStore.getState().withdraw('token');
      expect(result).toEqual({ success: false, message: '서버와의 통신에 실패했습니다.' });
      expect(console.error).toHaveBeenCalledWith('서비스 탈퇴 실패:', expect.any(Error));
    });
  });

  describe('clearUserStore', () => {
    it('clearUserStore: 상태 초기화 및 외부 스토어 액션이 트리거되는가', () => {
      useUserStore.setState({ userInfo: { name: '이순신', isFetched: true } });

      useUserStore.getState().clearUserStore();

      const state = useUserStore.getState();
      expect(state.userInfo.name).toBe('');
      expect(mockClearAssignmentStore).toHaveBeenCalled();
      expect(mockClearLMSStore).toHaveBeenCalled();
    });
  });
});