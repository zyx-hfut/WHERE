#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod account;
mod db;

use account::{AccountStore, ActiveAccount, AuthSession, AuthState, RegisterResult};
use db::{AttachmentDto, Database, HistoryDto, ItemDto, ItemInput, ItemListDto};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    accounts: Mutex<AccountStore>,
    active: Mutex<Option<ActiveAccount>>,
}

fn with_database<T>(
    state: &State<'_, AppState>,
    operation: impl FnOnce(&Database) -> Result<T, String>,
) -> Result<T, String> {
    let active = state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())?;
    let active = active
        .as_ref()
        .ok_or_else(|| "请先登录本地账号".to_string())?;
    operation(&active.database)
}

fn with_database_mut<T>(
    state: &State<'_, AppState>,
    operation: impl FnOnce(&mut Database) -> Result<T, String>,
) -> Result<T, String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())?;
    let active = active
        .as_mut()
        .ok_or_else(|| "请先登录本地账号".to_string())?;
    operation(&mut active.database)
}

#[tauri::command]
fn get_auth_state(state: State<'_, AppState>) -> Result<AuthState, String> {
    let active = state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())?;
    let accounts = state
        .accounts
        .lock()
        .map_err(|_| "账号数据库锁定失败".to_string())?;
    Ok(accounts.state(active.as_ref()))
}

#[tauri::command]
fn register_account(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<RegisterResult, String> {
    let accounts = state
        .accounts
        .lock()
        .map_err(|_| "账号数据库锁定失败".to_string())?;
    let result = accounts.register(username.clone(), password.clone())?;
    let active = accounts.login(username, password)?;
    drop(accounts);
    *state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())? = Some(active);
    Ok(result)
}

#[tauri::command]
fn login_account(
    state: State<'_, AppState>,
    username: String,
    password: String,
) -> Result<AuthSession, String> {
    let accounts = state
        .accounts
        .lock()
        .map_err(|_| "账号数据库锁定失败".to_string())?;
    let active = accounts.login(username, password)?;
    let session = active.session.clone();
    drop(accounts);
    *state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())? = Some(active);
    Ok(session)
}

#[tauri::command]
fn reset_account_password(
    state: State<'_, AppState>,
    username: String,
    recovery_key: String,
    new_password: String,
) -> Result<(), String> {
    state
        .accounts
        .lock()
        .map_err(|_| "账号数据库锁定失败".to_string())?
        .reset_password(username, recovery_key, new_password)
}

#[tauri::command]
fn logout_account(state: State<'_, AppState>) -> Result<(), String> {
    *state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())? = None;
    Ok(())
}

#[tauri::command]
fn get_lists(state: State<'_, AppState>) -> Result<Vec<ItemListDto>, String> {
    with_database(&state, |database| database.lists())
}

#[tauri::command]
fn create_list(
    state: State<'_, AppState>,
    name: String,
    icon: Option<String>,
) -> Result<ItemListDto, String> {
    with_database(&state, |database| database.create_list(name, icon))
}

#[tauri::command]
fn delete_list(state: State<'_, AppState>, id: String) -> Result<(), String> {
    with_database(&state, |database| database.delete_list(id))
}

#[tauri::command]
fn get_items(state: State<'_, AppState>, list_id: String) -> Result<Vec<ItemDto>, String> {
    with_database(&state, |database| database.items(list_id))
}

#[tauri::command]
fn search_items(state: State<'_, AppState>, query: String) -> Result<Vec<ItemDto>, String> {
    with_database(&state, |database| database.search_items(query))
}

#[tauri::command]
fn create_item(state: State<'_, AppState>, input: ItemInput) -> Result<ItemDto, String> {
    with_database_mut(&state, |database| database.create_item(input))
}

#[tauri::command]
fn update_item(
    state: State<'_, AppState>,
    id: String,
    input: ItemInput,
) -> Result<ItemDto, String> {
    with_database_mut(&state, |database| database.update_item(id, input))
}

#[tauri::command]
fn delete_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())?;
    let active = active
        .as_mut()
        .ok_or_else(|| "请先登录本地账号".to_string())?;
    let relative_path = active.database.delete_item(id)?;
    if let Some(relative_path) = relative_path {
        remove_attachment_file(&active.attachments_dir, &relative_path)?;
    }
    Ok(())
}

#[tauri::command]
fn get_item_history(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<Vec<HistoryDto>, String> {
    with_database(&state, |database| database.history(item_id))
}

#[tauri::command]
fn get_item_attachment(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<Option<AttachmentDto>, String> {
    with_database(&state, |database| database.attachment(item_id))
}

#[tauri::command]
fn read_item_attachment(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<Option<Vec<u8>>, String> {
    let active = state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())?;
    let active = active
        .as_ref()
        .ok_or_else(|| "请先登录本地账号".to_string())?;
    let relative_path = active.database.attachment_path(item_id)?;
    relative_path
        .map(|path| {
            std::fs::read(safe_attachment_path(&active.attachments_dir, &path))
                .map_err(|error| error.to_string())
        })
        .transpose()
}

#[tauri::command]
fn save_item_attachment(
    state: State<'_, AppState>,
    item_id: String,
    file_name: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> Result<AttachmentDto, String> {
    if bytes.is_empty() || bytes.len() > 10 * 1024 * 1024 {
        return Err("图片大小必须在 1B 到 10MB 之间".to_string());
    }
    if !mime_type.starts_with("image/") {
        return Err("只支持图片文件".to_string());
    }
    let mut active = state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())?;
    let active = active
        .as_mut()
        .ok_or_else(|| "请先登录本地账号".to_string())?;
    let extension = Path::new(&file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| {
            value
                .chars()
                .filter(|character| character.is_ascii_alphanumeric())
                .collect::<String>()
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "bin".to_string());
    let relative_path = format!("{}.{}", uuid::Uuid::new_v4(), extension);
    let destination = safe_attachment_path(&active.attachments_dir, &relative_path);
    std::fs::write(&destination, &bytes).map_err(|error| error.to_string())?;
    let old_path = active.database.attachment_path(item_id.clone())?;
    let result = active.database.save_attachment(
        item_id,
        file_name,
        mime_type,
        bytes.len() as i64,
        relative_path.clone(),
    );
    match result {
        Ok(attachment) => {
            if let Some(old_path) = old_path {
                if old_path != relative_path {
                    let _ = remove_attachment_file(&active.attachments_dir, &old_path);
                }
            }
            Ok(attachment)
        }
        Err(error) => {
            let _ = std::fs::remove_file(destination);
            Err(error)
        }
    }
}

#[tauri::command]
fn delete_item_attachment(state: State<'_, AppState>, item_id: String) -> Result<(), String> {
    let mut active = state
        .active
        .lock()
        .map_err(|_| "账号状态锁定失败".to_string())?;
    let active = active
        .as_mut()
        .ok_or_else(|| "请先登录本地账号".to_string())?;
    let relative_path = active.database.remove_attachment(item_id)?;
    if let Some(relative_path) = relative_path {
        remove_attachment_file(&active.attachments_dir, &relative_path)?;
    }
    Ok(())
}

fn safe_attachment_path(directory: &Path, relative_path: &str) -> PathBuf {
    directory.join(Path::new(relative_path).file_name().unwrap_or_default())
}

fn remove_attachment_file(directory: &Path, relative_path: &str) -> Result<(), String> {
    match std::fs::remove_file(safe_attachment_path(directory, relative_path)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            let accounts = AccountStore::open(&data_dir).map_err(std::io::Error::other)?;
            app.manage(AppState {
                accounts: Mutex::new(accounts),
                active: Mutex::new(None),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_auth_state,
            register_account,
            login_account,
            reset_account_password,
            logout_account,
            get_lists,
            create_list,
            delete_list,
            get_items,
            search_items,
            create_item,
            update_item,
            delete_item,
            get_item_history,
            get_item_attachment,
            read_item_attachment,
            save_item_attachment,
            delete_item_attachment
        ])
        .run(tauri::generate_context!())
        .expect("error while running WHERE application");
}
