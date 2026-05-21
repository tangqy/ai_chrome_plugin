import { invoke } from '@tauri-apps/api/core';
import { useCallback } from 'react';
import { useGitContext } from '../contexts/GitContext';
import { RepositoryInfo, BranchInfo, CommitInfo, CommitDetail } from '../types';

export function useGit() {
  const { state, dispatch } = useGitContext();

  const openRepository = useCallback(async (path: string) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const repo = await invoke<RepositoryInfo>('open_repository', { path });
      dispatch({ type: 'SET_REPOSITORY', payload: repo });
      
      const branches = await invoke<BranchInfo[]>('list_branches', { repoPath: path });
      dispatch({ type: 'SET_BRANCHES', payload: branches });
      
      const currentBranch = await invoke<BranchInfo>('get_current_branch', { repoPath: path });
      dispatch({ type: 'SET_CURRENT_BRANCH', payload: currentBranch });
      
      const commits = await invoke<CommitInfo[]>('get_commit_history', {
        repoPath: path,
        page: 0,
        perPage: 20,
      });
      dispatch({ type: 'SET_COMMITS', payload: commits });
      
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: String(error) });
    }
  }, [dispatch]);

  const getBranches = useCallback(async (repoPath?: string) => {
    if (!repoPath && !state.repository) return;
    const path = repoPath || state.repository!.path;
    
    try {
      const branches = await invoke<BranchInfo[]>('list_branches', { repoPath: path });
      dispatch({ type: 'SET_BRANCHES', payload: branches });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: String(error) });
    }
  }, [state.repository, dispatch]);

  const switchBranch = useCallback(async (branchName: string, repoPath?: string) => {
    if (!repoPath && !state.repository) return;
    const path = repoPath || state.repository!.path;
    
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      await invoke('switch_branch', { repoPath: path, branchName });
      await getBranches(path);
      await openRepository(path);
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: String(error) });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, [state.repository, dispatch, getBranches, openRepository]);

  const getCommits = useCallback(async (page: number, perPage: number = 20, repoPath?: string) => {
    if (!repoPath && !state.repository) return;
    const path = repoPath || state.repository!.path;
    
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const commits = await invoke<CommitInfo[]>('get_commit_history', {
        repoPath: path,
        page,
        perPage,
      });
      
      if (page === 0) {
        dispatch({ type: 'SET_COMMITS', payload: commits });
      } else {
        dispatch({ type: 'APPEND_COMMITS', payload: commits });
      }
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: String(error) });
    }
  }, [state.repository, dispatch]);

  const searchCommits = useCallback(async (query: string, repoPath?: string) => {
    if (!repoPath && !state.repository) return;
    const path = repoPath || state.repository!.path;
    
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const commits = await invoke<CommitInfo[]>('search_commits', {
        repoPath: path,
        query,
      });
      dispatch({ type: 'SET_COMMITS', payload: commits });
      dispatch({ type: 'SET_LOADING', payload: false });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: String(error) });
    }
  }, [state.repository, dispatch]);

  const getCommitDetail = useCallback(async (commitHash: string, repoPath?: string): Promise<CommitDetail | null> => {
    if (!repoPath && !state.repository) return null;
    const path = repoPath || state.repository!.path;
    
    try {
      const detail = await invoke<CommitDetail>('get_commit_detail', {
        repoPath: path,
        commitHash,
      });
      return detail;
    } catch (error) {
      console.error('Failed to get commit detail:', error);
      return null;
    }
  }, [state.repository]);

  return {
    repository: state.repository,
    branches: state.branches,
    currentBranch: state.currentBranch,
    commits: state.commits,
    loading: state.loading,
    error: state.error,
    openRepository,
    getBranches,
    switchBranch,
    getCommits,
    searchCommits,
    getCommitDetail,
  };
}
