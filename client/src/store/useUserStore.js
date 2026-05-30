import { create } from 'zustand';
import { API_BASE_URL } from '../apiConfig';
import useAssignmentStore from './useAssignmentStore';
import { useLMSStore } from '../Components/notice-tab/NoticeTab';

const useUserStore = create((set, get) => ({
    // 유저 프로필 정보
    userInfo: {
        name: "",
        studentId: "",
        department: "",
        lmsConnected: false,
        isLoading: false,
        isFetched: false
    },

    // 알림 설정 정보
    settings: {
        email: "",
        emailAlerts: false,
        browserAlerts: false,
        courseReminders: [],
        courses: [{ id: "all", name: "전체 과목" }],
        isLoading: false,
        isFetched: false
    },

    // 알림 내역 정보
    history: {
        data: [],
        isLoading: false,
        isFetched: false
    },

    // 사용자 프로필 조회
    fetchUserInfo: async (accessToken) => {
        if (get().userInfo.isFetched || !accessToken) return;
        
        set((state) => ({ userInfo: { ...state.userInfo, isLoading: true } }));
        try {
            const response = await fetch(`${API_BASE_URL}/api/me`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (result.success) {
                const profile = result.data || {};
                set({
                    userInfo: {
                        name: profile.name || "",
                        studentId: profile.student_id || "",
                        department: profile.department || "",
                        lmsConnected: true,
                        isLoading: false,
                        isFetched: true
                    }
                });
            }
        } catch (error) {
            console.error("사용자 정보 조회 실패:", error);
            set((state) => ({ userInfo: { ...state.userInfo, isLoading: false } }));
        }
    },

    // 알림 설정 및 과목 목록 조회
    fetchSettingsAndCourses: async (accessToken) => {
        if (get().settings.isFetched || !accessToken) return;

        set((state) => ({ settings: { ...state.settings, isLoading: true } }));
        try {
            // 1. 설정 정보 조회
            const settingsResponse = await fetch(`${API_BASE_URL}/api/user-settings`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const settingsResult = await settingsResponse.json();

            // 2. 과목 목록 조회
            const coursesResponse = await fetch(`${API_BASE_URL}/api/courses?include_custom=true`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const coursesResult = await coursesResponse.json();

            const newSettings = { ...get().settings, isLoading: false, isFetched: true };

            if (settingsResult.success && settingsResult.data) {
                newSettings.email = settingsResult.data.email || "";
                newSettings.emailAlerts = settingsResult.data.emailAlerts ?? false;
                newSettings.browserAlerts = settingsResult.data.browserAlerts ?? false;
                newSettings.courseReminders = settingsResult.data.courseReminders ?? [];
            }

            if (coursesResult.success && Array.isArray(coursesResult.data)) {
                newSettings.courses = [
                    { id: "all", name: "전체 과목" },
                    ...coursesResult.data
                ];
            }

            set({ settings: newSettings });
        } catch (error) {
            console.error("설정 데이터 로드 실패:", error);
            set((state) => ({ settings: { ...state.settings, isLoading: false } }));
        }
    },

    // 알림 내역 조회
    fetchHistory: async (accessToken) => {
        if (get().history.isFetched || !accessToken) return;

        set((state) => ({ history: { ...state.history, isLoading: true } }));
        try {
            const response = await fetch(`${API_BASE_URL}/api/notification-history`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (result.success) {
                set({
                    history: {
                        data: result.data,
                        isLoading: false,
                        isFetched: true
                    }
                });
            }
        } catch (error) {
            console.error("알림 내역 로드 실패:", error);
            set((state) => ({ history: { ...state.history, isLoading: false } }));
        }
    },

    // 설정 업데이트 (서버 저장 및 스토어 갱신)
    updateSettings: async (updates, accessToken) => {
        set((state) => ({ settings: { ...state.settings, ...updates } }));
        
        // 실제 서버 저장은 Debounce 처리 등을 위해 외부에서 호출하거나 여기서 바로 수행
        if (!accessToken) return;
        try {
            const currentSettings = get().settings;
            await fetch(`${API_BASE_URL}/api/user-settings`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    email: currentSettings.email,
                    emailAlerts: currentSettings.emailAlerts,
                    browserAlerts: currentSettings.browserAlerts,
                    courseReminders: currentSettings.courseReminders,
                    ...updates // 즉시 반영할 업데이트 내용
                }),
            });
        } catch (error) {
            console.error("설정 저장 실패:", error);
        }
    },

    // 알림 내역 삭제
    deleteHistoryItem: async (historyId, accessToken) => {
        if (!accessToken) return;
        try {
            const response = await fetch(`${API_BASE_URL}/api/notification-history/${historyId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (result.success) {
                set((state) => ({
                    history: {
                        ...state.history,
                        data: state.history.data.filter(item => item.id !== historyId)
                    }
                }));
            }
        } catch (error) {
            console.error("알림 내역 삭제 실패:", error);
        }
    },

    // 서비스 탈퇴
    withdraw: async (accessToken) => {
        if (!accessToken) return { success: false, message: "인증 정보가 없습니다." };
        try {
            const response = await fetch(`${API_BASE_URL}/auth/withdraw`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const result = await response.json();
            if (result.success) {
                // 로컬 스토리지 데이터 삭제 (저장된 아이디 등)
                // 테마는 사용자 환경 설정이므로 삭제하지 않고 유지함
                localStorage.removeItem("rememberedStudentId");
                
                get().clearUserStore();
                return { success: true };
            }
            return { success: false, message: result.message || "탈퇴 처리 중 오류가 발생했습니다." };
        } catch (error) {
            console.error("서비스 탈퇴 실패:", error);
            return { success: false, message: "서버와의 통신에 실패했습니다." };
        }
    },

    // 로그아웃 시 초기화용
    clearUserStore: () => {
        // 다른 스토어(과제, 공지 등)도 함께 초기화
        useAssignmentStore.getState().clearAssignmentStore();
        useLMSStore.getState().clearLMSStore();

        set({
            userInfo: { name: "", studentId: "", department: "", lmsConnected: false, isLoading: false, isFetched: false },
            settings: { email: "", emailAlerts: false, browserAlerts: false, courseReminders: [], courses: [{ id: "all", name: "전체 과목" }], isLoading: false, isFetched: false },
            history: { data: [], isLoading: false, isFetched: false }
        });
    }
}));

export default useUserStore;
