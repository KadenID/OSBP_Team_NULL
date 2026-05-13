import { create } from 'zustand';

const useAssignmentStore = create((set, get) => ({
  assignment: [],
  isLoading: false,
  isFetched: false, // 데이터를 이미 불러왔는지 확인하는 플래그

  // API 통신으로 과제 불러오기
  fetchAssignments: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch('http://localhost:8000/api/assignments');
      const result = await response.json();
      
      if (!result.success) {
        console.error("데이터를 불러오지 못했습니다:", result.message);
      }
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
  }))
}));

export default useAssignmentStore;