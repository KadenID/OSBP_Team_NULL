import { create } from 'zustand';

const useAssignmentStore = create((set, get) => ({
  assignment: [],
  isLoading: false,
  isFetched: false, // 데이터를 이미 불러왔는지 확인하는 플래그

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