use serde::{Deserialize, Serialize};
use tokio_cron_scheduler::{Job, JobScheduler};
use tracing::info;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJob {
    pub id: String,
    pub name: String,
    pub cron_expression: String,
    pub enabled: bool,
}

pub struct Scheduler {
    scheduler: Option<JobScheduler>,
}

impl Scheduler {
    pub fn new() -> Self {
        Scheduler { scheduler: None }
    }
    
    pub async fn init(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let scheduler = JobScheduler::new().await?;
        self.scheduler = Some(scheduler);
        Ok(())
    }
    
    pub async fn add_job<F>(&mut self, job: CronJob, callback: F) -> Result<(), Box<dyn std::error::Error + Send + Sync>>
    where
        F: Fn() + Send + Sync + Clone + 'static,
    {
        if let Some(ref mut scheduler) = self.scheduler {
            let job_id = job.id.clone();
            let job_name = job.name.clone();
            let callback_clone = callback.clone();
            
            let j = Job::new_async(job.cron_expression.as_str(), move |_uuid, _l| {
                let job_id_clone = job_id.clone();
                let job_name_clone = job_name.clone();
                let callback_clone = callback_clone.clone();
                
                Box::pin(async move {
                    info!("Executing cron job: {} ({})", job_name_clone, job_id_clone);
                    callback_clone();
                })
            }).map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
            
            scheduler.add(j).await?;
            info!("Added cron job: {} ({})", job.name, job.id);
        }
        Ok(())
    }
    
    pub async fn remove_job(&mut self, job_id: &str) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(ref mut scheduler) = self.scheduler {
            let uuid = uuid::Uuid::parse_str(job_id).map_err(|e| Box::new(e) as Box<dyn std::error::Error + Send + Sync>)?;
            scheduler.remove(&uuid).await?;
            info!("Removed cron job: {}", job_id);
        }
        Ok(())
    }
    
    pub async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(ref mut scheduler) = self.scheduler {
            scheduler.start().await?;
            info!("Scheduler started");
        }
        Ok(())
    }
    
    pub async fn shutdown(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(ref mut scheduler) = self.scheduler {
            scheduler.shutdown().await?;
            info!("Scheduler shutdown");
        }
        Ok(())
    }
}

pub fn default_cron_jobs() -> Vec<CronJob> {
    vec![
        CronJob {
            id: "cleanup-logs".to_string(),
            name: "清理日志".to_string(),
            cron_expression: "0 0 * * * *".to_string(),
            enabled: true,
        },
        CronJob {
            id: "health-check".to_string(),
            name: "健康检查".to_string(),
            cron_expression: "*/30 * * * * *".to_string(),
            enabled: true,
        },
        CronJob {
            id: "sync-bridge-status".to_string(),
            name: "同步 Bridge 状态".to_string(),
            cron_expression: "*/10 * * * * *".to_string(),
            enabled: true,
        },
    ]
}

#[tauri::command]
pub async fn get_cron_jobs() -> Result<Vec<CronJob>, String> {
    Ok(default_cron_jobs())
}
