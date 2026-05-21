import React, { createContext, useContext, useReducer, ReactNode } from 'react';
import { GitState, GitAction } from '../types';

const initialState: GitState = {
  repository: null,
  branches: [],
  currentBranch: null,
  commits: [],
  loading: false,
  error: null,
};

function gitReducer(state: GitState, action: GitAction): GitState {
  switch (action.type) {
    case 'SET_REPOSITORY':
      return { ...state, repository: action.payload, error: null };
    case 'SET_BRANCHES':
      return { ...state, branches: action.payload };
    case 'SET_CURRENT_BRANCH':
      return { ...state, currentBranch: action.payload };
    case 'SET_COMMITS':
      return { ...state, commits: action.payload };
    case 'APPEND_COMMITS':
      return { ...state, commits: [...state.commits, ...action.payload] };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface GitContextType {
  state: GitState;
  dispatch: React.Dispatch<GitAction>;
}

const GitContext = createContext<GitContextType | undefined>(undefined);

export function GitProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(gitReducer, initialState);

  return (
    <GitContext.Provider value={{ state, dispatch }}>
      {children}
    </GitContext.Provider>
  );
}

export function useGitContext() {
  const context = useContext(GitContext);
  if (context === undefined) {
    throw new Error('useGitContext must be used within a GitProvider');
  }
  return context;
}
