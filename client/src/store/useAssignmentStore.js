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

  // 새로운 사용자 과제 추가 (낙관적 업데이트 적용)
  addAssignment: async (newItem, accessToken) => {
    const tempId = `temp-${Date.now()}`;
    const optimisticItem = { 
      ...newItem, 
      id: tempId, 
      source: 'user',
      isSubmitted: newItem.isSubmitted || false,
      description: newItem.description || ""
    };

    // 1. UI 즉시 업데이트
    set((state) => ({
      assignment: [optimisticItem, ...state.assignment]
    }));

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
        // 2. 성공 시 서버에서 받은 실제 ID로 교체
        set((state) => ({
          assignment: state.assignment.map(a => 
            a.id === tempId ? { ...a, id: String(result.id) } : a
          )
        }));
      } else {
        throw new Error("서버 저장 실패");
      }
    } catch (error) {
      console.error("과제 추가 실패 (복구 진행):", error);
      // 3. 실패 시 롤백
      set((state) => ({
        assignment: state.assignment.filter(a => a.id !== tempId)
      }));
      alert("과제 추가에 실패했습니다. 다시 시도해주세요.");
    }
  },

  // 과제 삭제 (낙관적 업데이트 적용)
  deleteAssignment: async (targetId, accessToken) => {
    const previousAssignment = get().assignment;
    const itemToDelete = previousAssignment.find(item => String(item.id) === String(targetId));
    if (!itemToDelete) return;

    // 1. UI 즉시 업데이트
    set((state) => ({
      assignment: state.assignment.filter(item => String(item.id) !== String(targetId))
    }));

    if (itemToDelete.source === 'user') {
      try {
        const response = await fetch(`${API_BASE_URL}/api/custom-assignments/${targetId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          credentials: 'include'
        });
        const result = await response.json();
        if (!result.success) throw new Error("서버 삭제 실패");
      } catch (error) {
        console.error("과제 삭제 실패 (복구 진행):", error);
        // 2. 실패 시 롤백
        set({ assignment: previousAssignment });
        alert("과제 삭제에 실패했습니다. 다시 시도해주세요.");
      }
    }
  },

  // 제출 상태 토글 및 설명 업데이트 (낙관적 업데이트 적용)
  updateCustomAssignment: async (id, updates, accessToken) => {
    const previousAssignment = get().assignment;
    const item = previousAssignment.find(a => String(a.id) === String(id));
    if (!item) return;

    // 1. UI 즉시 업데이트
    const updatedItem = { ...item, ...updates };
    set((state) => ({
      assignment: state.assignment.map(a => String(a.id) === String(id) ? updatedItem : a)
    }));

    // LMS 과제는 서버 저장 없이 메모리 업데이트로 종료
    if (item.source !== 'user') return;

    // 커스텀 과제는 서버 업데이트 수행
    try {
      const response = await fetch(`${API_BASE_URL}/api/custom-assignments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(updatedItem),
        credentials: 'include'
      });
      const result = await response.json();
      if (!result.success) throw new Error("서버 업데이트 실패");
    } catch (error) {
      console.error("과제 업데이트 실패 (복구 진행):", error);
      // 2. 실패 시 롤백
      set({ assignment: previousAssignment });
      alert("상태 변경 저장에 실패했습니다.");
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
  },

  // LMS 과제 상세 정보 캐싱용 업데이트 함수 추가
  updateAssignmentDetail: (id, detailData) => {
    set((state) => ({
      assignment: state.assignment.map(a => 
        String(a.id) === String(id) ? { ...a, ...detailData, isDetailFetched: true } : a
      )
    }));
  }
}));

export default useAssignmentStore;
