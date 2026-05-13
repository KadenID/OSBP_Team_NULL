import { create } from 'zustand';

const useAssignmentStore = create((set, get) => ({
  assignment: [],
  isLoading: false,
  isFetched: false
}));

export default useAssignmentStore;