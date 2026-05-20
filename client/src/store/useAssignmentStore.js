import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // 생성과제 로컬스토리지를 위한 persist
import { API_BASE_URL } from '../apiConfig';

const useAssignmentStore = create(persist(
  (set, get) => ({
    assignment: [],
    isLoading: false,
    isFetched: false, // 데이터를 이미 불러왔는지 확인하는 플래그

  // API 통신으로 과제 불러오기
  fetchAssignments: async (accessToken) => {
    // 이미 데이터를 불러온 적이 있거나 토큰이 없으면 중단
    if (get().isFetched || !accessToken) return;
    
    set({ isLoading: true });
    try {
      const response = await fetch(`${API_BASE_URL}/api/assignments`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        },
        credentials: 'include'
      });
      const result = await response.json();
      
      if (result.success) {
        const fetchedData = result.data.map(item => ({
          id: item.assignment_id,
          subject: item.course_name,
          task: item.assignment_name,
          deadline: item.due_date,
          isSubmitted: item.status.includes('제출 완료'),
          source: 'lms'
        }));

        // 데이터 저장 및 호출 완료 플래그 설정
        set((state) => ({
        assignment: [...fetchedData, ...state.assignment.filter(a => a.source === 'user')], // get()에서 콜백 방식으로 수정
        isFetched: true
      }));
      } else {
        console.error("데이터를 불러오지 못했습니다:", result.message);
      } 
    } catch (error) {
      console.error("API 호출 중 오류 발생:", error);
    } finally {
      set({ isLoading: false }); // 성공 여부와 관계없이 로딩 종료
    }
  },

  // 새로운 사용자 과제 추가
  addAssignment: (newItem) => set((state) => ({
    assignment: [...state.assignment, newItem]
  })),

  // 과제 삭제
  deleteAssignment: (targetId) => set((state) => ({
    assignment: state.assignment.filter(item => item.id !== targetId)
  })),

  // 제출 상태 토글
  toggleSubmit: (id) => set((state) => ({
    assignment: state.assignment.map(item => 
      item.id === id ? { ...item, isSubmitted: !item.isSubmitted } : item
    )
  })),
  
  // 커스텀 과제 설명 작성
  updateDescription: (id, description) => set((state) => ({
    assignment: state.assignment.map(item =>
      item.id === id ? { ...item, description } : item
    )
  }))
}),
    {
      name: 'assignment-storage',
      // user 과제만 저장, 새로고침마다 LMS 갱신
      partialize: (state) => ({
        assignment: state.assignment.filter(item => item.source === 'user')
      }),
    }
  )
);
export default useAssignmentStore;