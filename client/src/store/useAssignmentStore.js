import { create } from 'zustand';
import { API_BASE_URL } from '../apiConfig';

const useAssignmentStore = create((set, get) => ({
  assignment: [],
  isLoading: false,
  isFetched: false,

  // LMS 과제 및 DB 저장된 커스텀 과제 통합 로드
  fetchAssignments: async (accessToken) => {
    if (get().isFetched || !accessToken) return;
    
    set({ isLoading: true });
    try {
      // 1. LMS 과제 가져오기
      const lmsResponse = await fetch(`${API_BASE_URL}/api/assignments`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        credentials: 'include'
      });
      const lmsResult = await lmsResponse.json();
      
      let lmsData = [];
      if (lmsResult.success) {
        lmsData = lmsResult.data.map(item => ({
          id: item.id || item.assignment_id, // 서버 응답 필드 통합
          subject: item.subject || item.course_name,
          task: item.task || item.assignment_name,
          deadline: item.deadline || item.due_date,
          isSubmitted: item.isSubmitted || (item.status && item.status.includes('제출') && !item.status.includes('미제출')),
          source: 'lms'
        }));
      }

      // 2. DB 커스텀 과제 가져오기
      const customResponse = await fetch(`${API_BASE_URL}/api/custom-assignments`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        credentials: 'include'
      });
      const customResult = await customResponse.json();
      
      let customData = [];
      if (customResult.success) {
        customData = customResult.data; // 서버에서 이미 정제된 데이터 반환
      }

      set({
        assignment: [...lmsData, ...customData],
        isFetched: true
      });
    } catch (error) {
      console.error("데이터 로드 중 오류 발생:", error);
    } finally {
      set({ isLoading: false });
    }
  },

  // 새로운 사용자 과제 추가
  addAssignment: async (newItem, accessToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/custom-assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(newItem),
        credentials: 'include'
      });
      const result = await response.json();
      if (result.success) {
        // 서버에서 생성된 실제 ID를 포함하여 상태 업데이트
        const addedItem = { 
          ...newItem, 
          id: String(result.id), 
          source: 'user',
          isSubmitted: newItem.isSubmitted || false,
          description: newItem.description || ""
        };
        set((state) => ({
          assignment: [addedItem, ...state.assignment] // 새 과제를 맨 위에 추가
        }));
      }
    } catch (error) {
      console.error("과제 추가 중 오류 발생:", error);
    }
  },

  // 과제 삭제
  deleteAssignment: async (targetId, accessToken) => {
    const state = get();
    const itemToDelete = state.assignment.find(item => String(item.id) === String(targetId));
    if (!itemToDelete) return;

    if (itemToDelete.source === 'user') {
      try {
        const response = await fetch(`${API_BASE_URL}/api/custom-assignments/${targetId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          credentials: 'include'
        });
        const result = await response.json();
        if (!result.success) return;
      } catch (error) {
        console.error("과제 삭제 중 오류 발생:", error);
        return;
      }
    }

    set((state) => ({
      assignment: state.assignment.filter(item => String(item.id) !== String(targetId))
    }));
  },

  // 제출 상태 토글 및 설명 업데이트 (커스텀 과제 전용)
  updateCustomAssignment: async (id, updates, accessToken) => {
    const state = get();
    const item = state.assignment.find(a => String(a.id) === String(id));
    if (!item) return;

    // LMS 과제는 메모리 상에서만 토글 (서버 저장 불가)
    if (item.source !== 'user') {
      set((state) => ({
        assignment: state.assignment.map(a => String(a.id) === String(id) ? { ...a, ...updates } : a)
      }));
      return;
    }

    // 커스텀 과제는 서버 업데이트 수행
    const updatedItem = { ...item, ...updates };
    try {
      const response = await fetch(`${API_BASE_URL}/api/custom-assignments`, {
        method: 'POST', // 추가/수정 통합 엔드포인트
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(updatedItem),
        credentials: 'include'
      });
      const result = await response.json();
      if (result.success) {
        set((state) => ({
          assignment: state.assignment.map(a => String(a.id) === String(id) ? updatedItem : a)
        }));
      }
    } catch (error) {
      console.error("과제 업데이트 중 오류 발생:", error);
    }
  },

  // 기존 액션들을 updateCustomAssignment로 통합하여 사용 가능
  toggleSubmit: (id, accessToken) => {
    const item = get().assignment.find(a => String(a.id) === String(id));
    if (item) {
      get().updateCustomAssignment(id, { isSubmitted: !item.isSubmitted }, accessToken);
    }
  },

  updateDescription: (id, description, accessToken) => {
    get().updateCustomAssignment(id, { description }, accessToken);
  }
}));

export default useAssignmentStore;
