use git2::{Repository, BranchType};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tracing::{error, info};

#[derive(Debug, Serialize, Deserialize)]
pub struct RepositoryInfo {
    pub path: String,
    pub name: String,
    pub branch: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_current: bool,
    pub is_remote: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommitDetail {
    pub full_hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub files_changed: Vec<String>,
}

#[tauri::command]
pub async fn open_repository(path: String) -> Result<RepositoryInfo, String> {
    info!("Opening repository: {}", path);
    
    let repo = Repository::open(&path).map_err(|e| {
        error!("Failed to open repository: {}", e);
        format!("Failed to open repository: {}", e)
    })?;
    
    let repo_path = Path::new(&path);
    let name = repo_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Unknown")
        .to_string();
    
    let branch = repo.head()
        .ok()
        .and_then(|h| h.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "HEAD".to_string());
    
    Ok(RepositoryInfo {
        path,
        name,
        branch,
    })
}

#[tauri::command]
pub async fn get_current_branch(repo_path: String) -> Result<BranchInfo, String> {
    info!("Getting current branch for: {}", repo_path);
    
    let repo = Repository::open(&repo_path).map_err(|e| {
        error!("Failed to open repository: {}", e);
        format!("Failed to open repository: {}", e)
    })?;
    
    let head = repo.head().map_err(|e| {
        error!("Failed to get HEAD: {}", e);
        format!("Failed to get HEAD: {}", e)
    })?;
    
    let name = head.shorthand()
        .ok_or_else(|| "Failed to get branch name".to_string())?
        .to_string();
    
    Ok(BranchInfo {
        name,
        is_current: true,
        is_remote: false,
    })
}

#[tauri::command]
pub async fn list_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    info!("Listing branches for: {}", repo_path);
    
    let repo = Repository::open(&repo_path).map_err(|e| {
        error!("Failed to open repository: {}", e);
        format!("Failed to open repository: {}", e)
    })?;
    
    let head = repo.head().ok();
    let current_branch_name = head
        .as_ref()
        .and_then(|h| h.shorthand())
        .map(|s| s.to_string());
    
    let mut branches = Vec::new();
    
    let local_branches = repo.branches(Some(BranchType::Local)).map_err(|e| {
        error!("Failed to get local branches: {}", e);
        format!("Failed to get branches: {}", e)
    })?;
    
    for branch in local_branches {
        if let Ok((branch, _)) = branch {
            if let Some(name) = branch.name().ok().flatten() {
                branches.push(BranchInfo {
                    name: name.to_string(),
                    is_current: Some(name.to_string()) == current_branch_name,
                    is_remote: false,
                });
            }
        }
    }
    
    Ok(branches)
}

#[tauri::command]
pub async fn switch_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    info!("Switching to branch: {} in {}", branch_name, repo_path);
    
    let repo = Repository::open(&repo_path).map_err(|e| {
        error!("Failed to open repository: {}", e);
        format!("Failed to open repository: {}", e)
    })?;
    
    let reference_name = if branch_name.starts_with("refs/heads/") {
        branch_name.clone()
    } else {
        format!("refs/heads/{}", branch_name)
    };
    
    let reference = repo.find_reference(&reference_name).map_err(|e| {
        error!("Failed to find branch: {}", e);
        format!("Failed to find branch: {}", e)
    })?;
    
    let tree = reference.peel_to_tree().map_err(|e| {
        error!("Failed to peel to tree: {}", e);
        format!("Failed to peel to tree: {}", e)
    })?;
    
    let object = tree.as_object();
    
    repo.checkout_tree(&object, None).map_err(|e| {
        error!("Failed to checkout tree: {}", e);
        format!("Failed to checkout tree: {}", e)
    })?;
    
    repo.set_head(&reference_name).map_err(|e| {
        error!("Failed to set HEAD: {}", e);
        format!("Failed to set HEAD: {}", e)
    })?;
    
    info!("Successfully switched to branch: {}", branch_name);
    Ok(())
}

#[tauri::command]
pub async fn get_commit_history(
    repo_path: String,
    page: u32,
    per_page: u32,
) -> Result<Vec<CommitInfo>, String> {
    info!("Getting commit history for: {} (page: {}, per_page: {})", repo_path, page, per_page);
    
    let repo = Repository::open(&repo_path).map_err(|e| {
        error!("Failed to open repository: {}", e);
        format!("Failed to open repository: {}", e)
    })?;
    
    let mut revwalk = repo.revwalk().map_err(|e| {
        error!("Failed to create revwalk: {}", e);
        format!("Failed to create revwalk: {}", e)
    })?;
    
    revwalk.push_head().map_err(|e| {
        error!("Failed to push HEAD: {}", e);
        format!("Failed to push HEAD: {}", e)
    })?;
    
    let start = (page * per_page) as usize;
    let end = start + per_page as usize;
    let mut commits = Vec::new();
    let mut count = 0;
    
    for oid in revwalk {
        if count >= end {
            break;
        }
        
        if count >= start {
            if let Ok(oid) = oid {
                if let Ok(commit) = repo.find_commit(oid) {
                    let author = commit.author();
                    let timestamp = commit.time().seconds();
                    
                    commits.push(CommitInfo {
                        hash: oid.to_string(),
                        short_hash: oid.to_string()[..7].to_string(),
                        message: commit.summary().unwrap_or("").to_string(),
                        author: author.name().unwrap_or("Unknown").to_string(),
                        timestamp,
                    });
                }
            }
        }
        count += 1;
    }
    
    Ok(commits)
}

#[tauri::command]
pub async fn search_commits(repo_path: String, query: String) -> Result<Vec<CommitInfo>, String> {
    info!("Searching commits in: {} for: {}", repo_path, query);
    
    let repo = Repository::open(&repo_path).map_err(|e| {
        error!("Failed to open repository: {}", e);
        format!("Failed to open repository: {}", e)
    })?;
    
    let mut revwalk = repo.revwalk().map_err(|e| {
        error!("Failed to create revwalk: {}", e);
        format!("Failed to create revwalk: {}", e)
    })?;
    
    revwalk.push_head().map_err(|e| {
        error!("Failed to push HEAD: {}", e);
        format!("Failed to push HEAD: {}", e)
    })?;
    
    let query_lower = query.to_lowercase();
    let mut commits = Vec::new();
    
    for oid in revwalk {
        if commits.len() >= 50 {
            break;
        }
        
        if let Ok(oid) = oid {
            if let Ok(commit) = repo.find_commit(oid) {
                let message = commit.message().unwrap_or("");
                let author = commit.author();
                let timestamp = commit.time().seconds();
                
                if message.to_lowercase().contains(&query_lower) 
                    || author.name().unwrap_or("").to_lowercase().contains(&query_lower)
                {
                    commits.push(CommitInfo {
                        hash: oid.to_string(),
                        short_hash: oid.to_string()[..7].to_string(),
                        message: message.to_string(),
                        author: author.name().unwrap_or("Unknown").to_string(),
                        timestamp,
                    });
                }
            }
        }
    }
    
    Ok(commits)
}

#[tauri::command]
pub async fn get_commit_detail(repo_path: String, commit_hash: String) -> Result<CommitDetail, String> {
    info!("Getting commit detail: {} in {}", commit_hash, repo_path);
    
    let repo = Repository::open(&repo_path).map_err(|e| {
        error!("Failed to open repository: {}", e);
        format!("Failed to open repository: {}", e)
    })?;
    
    let oid = git2::Oid::from_str(&commit_hash).map_err(|e| {
        error!("Invalid commit hash: {}", e);
        format!("Invalid commit hash: {}", e)
    })?;
    
    let commit = repo.find_commit(oid).map_err(|e| {
        error!("Failed to find commit: {}", e);
        format!("Failed to find commit: {}", e)
    })?;
    
    let author = commit.author();
    let timestamp = commit.time().seconds();
    let message = commit.message().unwrap_or("").to_string();
    
    let mut files_changed = Vec::new();
    
    let parent = commit.parents().next();
    match parent {
        Some(parent_commit) => {
            let old_tree = parent_commit.tree().ok();
            let new_tree = commit.tree().ok();
            
            if let (Some(old), Some(new)) = (old_tree, new_tree) {
                let diff = repo.diff_tree_to_tree(Some(&old), Some(&new), None).ok();
                if let Some(diff) = diff {
                    let _ = diff.foreach(&mut |delta, _| {
                        if let Some(path) = delta.new_file().path() {
                            files_changed.push(path.display().to_string());
                        }
                        true
                    }, None, None, None);
                }
            }
        }
        None => {
            if let Some(tree) = commit.tree().ok() {
                let _ = tree.walk(git2::TreeWalkMode::PreOrder, |root, entry| {
                    if let Some(name) = entry.name() {
                        let full_path = format!("{}{}", root, name);
                        files_changed.push(full_path);
                    }
                    true
                });
            }
        }
    }
    
    Ok(CommitDetail {
        full_hash: oid.to_string(),
        short_hash: oid.to_string()[..7].to_string(),
        message,
        author: author.name().unwrap_or("Unknown").to_string(),
        email: author.email().unwrap_or("").to_string(),
        timestamp,
        files_changed,
    })
}
