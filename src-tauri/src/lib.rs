#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{AttachmentDto, Database, HistoryDto, ItemDto, ItemInput, ItemListDto};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    database: Mutex<Database>,
    attachments_dir: PathBuf,
}

#[tauri::command]
fn get_lists(state: State<'_, AppState>) -> Result<Vec<ItemListDto>, String> {
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .lists()
}

#[tauri::command]
fn create_list(
    state: State<'_, AppState>,
    name: String,
    icon: Option<String>,
) -> Result<ItemListDto, String> {
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .create_list(name, icon)
}

#[tauri::command]
fn delete_list(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .delete_list(id)
}

#[tauri::command]
fn get_items(state: State<'_, AppState>, list_id: String) -> Result<Vec<ItemDto>, String> {
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .items(list_id)
}

#[tauri::command]
fn create_item(state: State<'_, AppState>, input: ItemInput) -> Result<ItemDto, String> {
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .create_item(input)
}

#[tauri::command]
fn update_item(
    state: State<'_, AppState>,
    id: String,
    input: ItemInput,
) -> Result<ItemDto, String> {
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .update_item(id, input)
}

#[tauri::command]
fn delete_item(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let relative_path = state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .delete_item(id)?;
    if let Some(relative_path) = relative_path {
        remove_attachment_file(&state.attachments_dir, &relative_path)?;
    }
    Ok(())
}

#[tauri::command]
fn get_item_history(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<Vec<HistoryDto>, String> {
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .history(item_id)
}

#[tauri::command]
fn get_item_attachment(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<Option<AttachmentDto>, String> {
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .attachment(item_id)
}

#[tauri::command]
fn read_item_attachment(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<Option<Vec<u8>>, String> {
    let relative_path = state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .attachment_path(item_id)?;
    relative_path
        .map(|path| {
            std::fs::read(safe_attachment_path(&state.attachments_dir, &path))
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
    if bytes.len() > 10 * 1024 * 1024 {
        return Err("图片不能超过 10MB".to_string());
    }
    if !mime_type.starts_with("image/") {
        return Err("只支持图片文件".to_string());
    }
    let extension = std::path::Path::new(&file_name)
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
    let destination = safe_attachment_path(&state.attachments_dir, &relative_path);
    std::fs::write(&destination, bytes).map_err(|error| error.to_string())?;

    let old_path = state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .attachment_path(item_id.clone())?;
    let result = state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .save_attachment(
            item_id,
            file_name,
            mime_type,
            bytes_len(&destination)?,
            relative_path.clone(),
        );
    match result {
        Ok(attachment) => {
            if let Some(old_path) = old_path {
                if old_path != relative_path {
                    let _ = remove_attachment_file(&state.attachments_dir, &old_path);
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

fn bytes_len(path: &std::path::Path) -> Result<i64, String> {
    Ok(std::fs::metadata(path)
        .map_err(|error| error.to_string())?
        .len() as i64)
}

#[tauri::command]
fn delete_item_attachment(state: State<'_, AppState>, item_id: String) -> Result<(), String> {
    let relative_path = state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .remove_attachment(item_id)?;
    if let Some(relative_path) = relative_path {
        remove_attachment_file(&state.attachments_dir, &relative_path)?;
    }
    Ok(())
}

fn safe_attachment_path(directory: &std::path::Path, relative_path: &str) -> PathBuf {
    directory.join(
        std::path::Path::new(relative_path)
            .file_name()
            .unwrap_or_default(),
    )
}

fn remove_attachment_file(directory: &std::path::Path, relative_path: &str) -> Result<(), String> {
    let path = safe_attachment_path(directory, relative_path);
    match std::fs::remove_file(path) {
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
            std::fs::create_dir_all(&data_dir)?;
            let attachments_dir = data_dir.join("attachments");
            std::fs::create_dir_all(&attachments_dir)?;
            let database =
                Database::open(&data_dir.join("where.db")).map_err(std::io::Error::other)?;
            app.manage(AppState {
                database: Mutex::new(database),
                attachments_dir,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_lists,
            create_list,
            delete_list,
            get_items,
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
