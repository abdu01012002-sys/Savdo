import { create } from 'zustand';
import { DbState, User } from '../types';
import { INITIAL_DB } from '../data';

interface AppStore {
  db: DbState;
  setDb: (action: DbState | ((prev: DbState) => DbState)) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  db: INITIAL_DB,
  setDb: (action) => set((state) => ({
    db: typeof action === 'function' ? action(state.db) : action
  })),
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),
}));
