use crate::db::Database;
use argon2::password_hash::{rand_core::OsRng, SaltString};
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthSession {
    pub account_id: String,
    pub username: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    pub authenticated: bool,
    pub account_id: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RegisterResult {
    pub session: AuthSession,
    pub recovery_key: String,
}

pub struct ActiveAccount {
    pub session: AuthSession,
    pub database: Database,
    pub attachments_dir: PathBuf,
}

pub struct AccountStore {
    connection: Connection,
    root: PathBuf,
    accounts_dir: PathBuf,
}

impl AccountStore {
    pub fn open(root: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(root).map_err(|error| error.to_string())?;
        let accounts_dir = root.join("accounts");
        std::fs::create_dir_all(&accounts_dir).map_err(|error| error.to_string())?;
        let connection =
            Connection::open(root.join("accounts.sqlite")).map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS accounts (
               id TEXT PRIMARY KEY NOT NULL,
               username TEXT NOT NULL UNIQUE,
               password_hash TEXT NOT NULL,
               recovery_hash TEXT NOT NULL,
               created_at INTEGER NOT NULL,
               last_login_at INTEGER
             );
             CREATE INDEX IF NOT EXISTS idx_accounts_username ON accounts(username);",
            )
            .map_err(|error| error.to_string())?;
        Ok(Self {
            connection,
            root: root.to_path_buf(),
            accounts_dir,
        })
    }

    pub fn state(&self, active: Option<&ActiveAccount>) -> AuthState {
        active
            .map(|account| AuthState {
                authenticated: true,
                account_id: Some(account.session.account_id.clone()),
                username: Some(account.session.username.clone()),
            })
            .unwrap_or(AuthState {
                authenticated: false,
                account_id: None,
                username: None,
            })
    }

    pub fn register(&self, username: String, password: String) -> Result<RegisterResult, String> {
        let username = validate_username(username)?;
        validate_password(&password)?;
        let exists: bool = self
            .connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM accounts WHERE username = ?1)",
                params![username],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if exists {
            return Err("用户名已存在".to_string());
        }
        let account_id = uuid::Uuid::new_v4().to_string();
        let recovery_key = format!(
            "WHERE-{}",
            uuid::Uuid::new_v4().simple().to_string().to_uppercase()
        );
        let password_hash = hash_secret(&password)?;
        let recovery_hash = hash_secret(&recovery_key)?;
        self.connection.execute("INSERT INTO accounts (id, username, password_hash, recovery_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5)", params![account_id, username, password_hash, recovery_hash, now_ms()]).map_err(|error| error.to_string())?;
        let active = self.open_account(account_id.clone(), username.clone())?;
        Ok(RegisterResult {
            session: active.session,
            recovery_key,
        })
    }

    pub fn login(&self, username: String, password: String) -> Result<ActiveAccount, String> {
        let username = validate_username(username)?;
        let (id, password_hash): (String, String) = self
            .connection
            .query_row(
                "SELECT id, password_hash FROM accounts WHERE username = ?1",
                params![username],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| "用户名或密码错误".to_string())?;
        verify_secret(&password, &password_hash).map_err(|_| "用户名或密码错误".to_string())?;
        self.connection
            .execute(
                "UPDATE accounts SET last_login_at = ?1 WHERE id = ?2",
                params![now_ms(), id],
            )
            .map_err(|error| error.to_string())?;
        self.open_account(id, username)
    }

    pub fn reset_password(
        &self,
        username: String,
        recovery_key: String,
        new_password: String,
    ) -> Result<(), String> {
        let username = validate_username(username)?;
        validate_password(&new_password)?;
        let (id, recovery_hash): (String, String) = self
            .connection
            .query_row(
                "SELECT id, recovery_hash FROM accounts WHERE username = ?1",
                params![username],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| "恢复信息错误".to_string())?;
        verify_secret(&recovery_key, &recovery_hash).map_err(|_| "恢复信息错误".to_string())?;
        self.connection
            .execute(
                "UPDATE accounts SET password_hash = ?1 WHERE id = ?2",
                params![hash_secret(&new_password)?, id],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn open_account(&self, account_id: String, username: String) -> Result<ActiveAccount, String> {
        let account_dir = self.accounts_dir.join(&account_id);
        std::fs::create_dir_all(&account_dir).map_err(|error| error.to_string())?;
        let database_path = account_dir.join("where.db");
        migrate_legacy_database(&self.root, &account_dir, &database_path)?;
        let attachments_dir = account_dir.join("attachments");
        std::fs::create_dir_all(&attachments_dir).map_err(|error| error.to_string())?;
        let database = Database::open(&database_path)?;
        Ok(ActiveAccount {
            session: AuthSession {
                account_id,
                username,
            },
            database,
            attachments_dir,
        })
    }
}

fn migrate_legacy_database(
    root: &Path,
    account_dir: &Path,
    destination: &Path,
) -> Result<(), String> {
    let legacy = root.join("where.db");
    if destination.exists() || !legacy.exists() {
        return Ok(());
    }
    std::fs::copy(&legacy, destination).map_err(|error| error.to_string())?;
    for suffix in ["-wal", "-shm"] {
        let source = root.join(format!("where.db{}", suffix));
        if source.exists() {
            let _ = std::fs::copy(source, account_dir.join(format!("where.db{}", suffix)));
        }
    }
    let legacy_attachments = root.join("attachments");
    let destination_attachments = account_dir.join("attachments");
    if legacy_attachments.exists() && !destination_attachments.exists() {
        let _ = std::fs::rename(legacy_attachments, destination_attachments);
    }
    let _ = std::fs::rename(&legacy, root.join("where.db.legacy-backup"));
    for suffix in ["-wal", "-shm"] {
        let source = root.join(format!("where.db{}", suffix));
        if source.exists() {
            let _ = std::fs::rename(
                source,
                root.join(format!("where.db.legacy-backup{}", suffix)),
            );
        }
    }
    Ok(())
}

fn validate_username(value: String) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.len() < 2 || value.len() > 32 {
        return Err("用户名长度需要为 2 到 32 个字符".to_string());
    }
    Ok(value)
}

fn validate_password(value: &str) -> Result<(), String> {
    if value.chars().count() < 8 {
        Err("密码至少需要 8 个字符".to_string())
    } else {
        Ok(())
    }
}

fn hash_secret(value: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(value.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|error| error.to_string())
}

fn verify_secret(value: &str, encoded: &str) -> Result<(), String> {
    let hash = PasswordHash::new(encoded).map_err(|error| error.to_string())?;
    Argon2::default()
        .verify_password(value.as_bytes(), &hash)
        .map_err(|error| error.to_string())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registration_login_and_recovery_work() {
        let root = std::env::temp_dir().join(format!("where-account-{}", uuid::Uuid::new_v4()));
        let store = AccountStore::open(&root).unwrap();
        let result = store
            .register("alice".into(), "correct horse".into())
            .unwrap();
        assert_eq!(result.session.username, "alice");
        assert!(store.login("alice".into(), "correct horse".into()).is_ok());
        assert!(store
            .login("alice".into(), "wrong password".into())
            .is_err());
        store
            .reset_password("alice".into(), result.recovery_key, "new password".into())
            .unwrap();
        assert!(store.login("alice".into(), "new password".into()).is_ok());
    }

    #[test]
    fn duplicate_usernames_are_rejected() {
        let root = std::env::temp_dir().join(format!("where-account-{}", uuid::Uuid::new_v4()));
        let store = AccountStore::open(&root).unwrap();
        store
            .register("alice".into(), "correct horse".into())
            .unwrap();
        assert!(store
            .register("alice".into(), "correct horse".into())
            .is_err());
    }
}
