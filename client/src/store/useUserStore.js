import { create } from 'zustand';
import { API_BASE_URL } from '../apiConfig';

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
        emailAlerts: true,
        browserAlerts: true,
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
                newSettings.emailAlerts = settingsResult.data.emailAlerts ?? true;
                newSettings.browserAlerts = settingsResult.data.browserAlerts ?? true;
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
                method: 'POST',
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

    // 로그아웃 시 초기화용
    clearUserStore: () => {
        set({
            userInfo: { name: "", studentId: "", department: "", lmsConnected: false, isLoading: false, isFetched: false },
            settings: { email: "", emailAlerts: true, browserAlerts: true, courseReminders: [], courses: [{ id: "all", name: "전체 과목" }], isLoading: false, isFetched: false },
            history: { data: [], isLoading: false, isFetched: false }
        });
    }
}));

export default useUserStore;
