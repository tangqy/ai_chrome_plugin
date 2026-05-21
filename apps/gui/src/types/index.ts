export interface RepositoryInfo {
  path: string;
  name: string;
  branch: string;
}

export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

export interface CommitInfo {
  hash: string;
  short_hash: string;
  message: string;
  author: string;
  timestamp: number;
}

export interface CommitDetail {
  full_hash: string;
  short_hash: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
  files_changed: string[];
}

export interface GitState {
  repository: RepositoryInfo | null;
  branches: BranchInfo[];
  currentBranch: BranchInfo | null;
  commits: CommitInfo[];
  loading: boolean;
  error: string | null;
}

export type GitAction =
  | { type: 'SET_REPOSITORY'; payload: RepositoryInfo }
  | { type: 'SET_BRANCHES'; payload: BranchInfo[] }
  | { type: 'SET_CURRENT_BRANCH'; payload: BranchInfo }
  | { type: 'SET_COMMITS'; payload: CommitInfo[] }
  | { type: 'APPEND_COMMITS'; payload: CommitInfo[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'RESET' };
