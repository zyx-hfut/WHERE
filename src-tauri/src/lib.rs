#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{Database, HistoryDto, ItemDto, ItemInput, ItemListDto};
use std::sync::Mutex;
use tauri::{Manager, State};

struct AppState {
    database: Mutex<Database>,
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
    state
        .database
        .lock()
        .map_err(|_| "数据库锁定失败".to_string())?
        .delete_item(id)
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(error.to_string()))?;
            std::fs::create_dir_all(&data_dir)?;
            let database =
                Database::open(&data_dir.join("where.db")).map_err(std::io::Error::other)?;
            app.manage(AppState {
                database: Mutex::new(database),
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
            get_item_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running WHERE application");
}
