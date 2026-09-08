use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemListDto {
    pub id: String,
    pub name: String,
    pub count: i64,
    pub icon: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ItemDto {
    pub id: String,
    pub list_id: String,
    pub list_name: String,
    pub name: String,
    pub location: String,
    pub note: Option<String>,
    pub icon: String,
    pub updated_at: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryDto {
    pub id: i64,
    pub item_id: String,
    pub action: String,
    pub before_json: Option<String>,
    pub after_json: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentDto {
    pub id: String,
    pub item_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub size: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInput {
    pub list_id: String,
    pub name: String,
    pub location: String,
    pub note: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug)]
pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|error| error.to_string())?;
        connection
            .busy_timeout(std::time::Duration::from_secs(3))
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;
                 CREATE TABLE IF NOT EXISTS item_lists (
                   id TEXT PRIMARY KEY NOT NULL,
                   name TEXT NOT NULL UNIQUE,
                   icon TEXT NOT NULL DEFAULT '⌂',
                   sort_order INTEGER NOT NULL DEFAULT 0,
                   created_at INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS items (
                   id TEXT PRIMARY KEY NOT NULL,
                   list_id TEXT NOT NULL REFERENCES item_lists(id),
                   name TEXT NOT NULL,
                   location TEXT NOT NULL,
                   note TEXT,
                   icon TEXT NOT NULL DEFAULT '✦',
                   created_at INTEGER NOT NULL,
                   updated_at INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS item_history (
                   id INTEGER PRIMARY KEY AUTOINCREMENT,
                   item_id TEXT NOT NULL,
                   action TEXT NOT NULL,
                   before_json TEXT,
                   after_json TEXT,
                   created_at INTEGER NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS item_attachments (
                   id TEXT PRIMARY KEY NOT NULL,
                   item_id TEXT NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
                   file_name TEXT NOT NULL,
                   mime_type TEXT NOT NULL,
                   size INTEGER NOT NULL,
                   relative_path TEXT NOT NULL,
                   created_at INTEGER NOT NULL,
                   updated_at INTEGER NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS idx_items_list_id ON items(list_id);
                 CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updated_at DESC);
                 CREATE INDEX IF NOT EXISTS idx_item_history_item_id ON item_history(item_id, created_at DESC);",
            )
            .map_err(|error| error.to_string())?;

        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM item_lists", [], |row| row.get(0))
            .map_err(|error| error.to_string())?;
        if count == 0 {
            let timestamp = now_ms();
            connection
                .execute(
                    "INSERT INTO item_lists (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params!["placed", "放在", "⌂", 0, timestamp],
                )
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO item_lists (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params!["stored", "存有", "▦", 1, timestamp],
                )
                .map_err(|error| error.to_string())?;
        }

        Ok(Self { connection })
    }

    pub fn lists(&self) -> Result<Vec<ItemListDto>, String> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT l.id, l.name, l.icon, COUNT(i.id)
                 FROM item_lists l
                 LEFT JOIN items i ON i.list_id = l.id
                 GROUP BY l.id
                 ORDER BY l.sort_order, l.created_at",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| {
                Ok(ItemListDto {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    icon: row.get(2)?,
                    count: row.get(3)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn create_list(&self, name: String, icon: Option<String>) -> Result<ItemListDto, String> {
        let name = required(name, "列表名称")?;
        let id = uuid_like();
        let timestamp = now_ms();
        let sort_order: i64 = self
            .connection
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM item_lists",
                [],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        self.connection
            .execute(
                "INSERT INTO item_lists (id, name, icon, sort_order, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![id, name, icon.unwrap_or_else(|| "✦".to_string()), sort_order, timestamp],
            )
            .map_err(|error| error.to_string())?;
        self.lists()?
            .into_iter()
            .find(|list| list.id == id)
            .ok_or_else(|| "创建列表后无法读取列表".to_string())
    }

    pub fn delete_list(&self, id: String) -> Result<(), String> {
        let count: i64 = self
            .connection
            .query_row(
                "SELECT COUNT(*) FROM items WHERE list_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;
        if count > 0 {
            return Err("列表中仍有物品，请先移动或删除这些物品".to_string());
        }
        let deleted = self
            .connection
            .execute("DELETE FROM item_lists WHERE id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        if deleted == 0 {
            return Err("列表不存在".to_string());
        }
        Ok(())
    }

    pub fn items(&self, list_id: String) -> Result<Vec<ItemDto>, String> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT i.id, i.list_id, l.name, i.name, i.location, i.note, i.icon, i.updated_at
                 FROM items i JOIN item_lists l ON l.id = i.list_id
                 WHERE i.list_id = ?1 ORDER BY i.updated_at DESC",
            )
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![list_id], |row| {
                Ok(ItemDto {
                    id: row.get(0)?,
                    list_id: row.get(1)?,
                    list_name: row.get(2)?,
                    name: row.get(3)?,
                    location: row.get(4)?,
                    note: row.get(5)?,
                    icon: row.get(6)?,
                    updated_at: row.get(7)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn create_item(&mut self, input: ItemInput) -> Result<ItemDto, String> {
        validate_item(&input)?;
        let id = uuid_like();
        let timestamp = now_ms();
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| error.to_string())?;
        ensure_list_exists(&transaction, &input.list_id)?;
        transaction
            .execute(
                "INSERT INTO items (id, list_id, name, location, note, icon, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
                params![id, input.list_id, input.name, input.location, input.note, input.icon.unwrap_or_else(|| "✦".to_string()), timestamp],
            )
            .map_err(|error| error.to_string())?;
        let after = snapshot_json(&transaction, &id)?;
        transaction
            .execute("INSERT INTO item_history (item_id, action, before_json, after_json, created_at) VALUES (?1, 'created', NULL, ?2, ?3)", params![id, after, timestamp])
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        self.item(id)
    }

    pub fn update_item(&mut self, id: String, input: ItemInput) -> Result<ItemDto, String> {
        validate_item(&input)?;
        let timestamp = now_ms();
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let before = snapshot_json(&transaction, &id)?;
        ensure_list_exists(&transaction, &input.list_id)?;
        let changed = transaction
            .execute("UPDATE items SET list_id = ?1, name = ?2, location = ?3, note = ?4, icon = COALESCE(?5, icon), updated_at = ?6 WHERE id = ?7", params![input.list_id, input.name, input.location, input.note, input.icon, timestamp, id])
            .map_err(|error| error.to_string())?;
        if changed == 0 {
            return Err("物品不存在".to_string());
        }
        let after = snapshot_json(&transaction, &id)?;
        transaction
            .execute("INSERT INTO item_history (item_id, action, before_json, after_json, created_at) VALUES (?1, 'updated', ?2, ?3, ?4)", params![id, before, after, timestamp])
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        self.item(id)
    }

    pub fn delete_item(&mut self, id: String) -> Result<Option<String>, String> {
        let timestamp = now_ms();
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let before = snapshot_json(&transaction, &id)?;
        let attachment_path: Option<String> = transaction
            .query_row(
                "SELECT relative_path FROM item_attachments WHERE item_id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        let deleted = transaction
            .execute("DELETE FROM items WHERE id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        if deleted == 0 {
            return Err("物品不存在".to_string());
        }
        transaction
            .execute("INSERT INTO item_history (item_id, action, before_json, after_json, created_at) VALUES (?1, 'deleted', ?2, NULL, ?3)", params![id, before, timestamp])
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(attachment_path)
    }

    pub fn item(&self, id: String) -> Result<ItemDto, String> {
        self.connection
            .query_row("SELECT i.id, i.list_id, l.name, i.name, i.location, i.note, i.icon, i.updated_at FROM items i JOIN item_lists l ON l.id = i.list_id WHERE i.id = ?1", params![id], |row| {
                Ok(ItemDto { id: row.get(0)?, list_id: row.get(1)?, list_name: row.get(2)?, name: row.get(3)?, location: row.get(4)?, note: row.get(5)?, icon: row.get(6)?, updated_at: row.get(7)? })
            })
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "物品不存在".to_string())
    }

    pub fn history(&self, item_id: String) -> Result<Vec<HistoryDto>, String> {
        let mut statement = self.connection.prepare("SELECT id, item_id, action, before_json, after_json, created_at FROM item_history WHERE item_id = ?1 ORDER BY created_at DESC, id DESC").map_err(|error| error.to_string())?;
        let rows = statement
            .query_map(params![item_id], |row| {
                Ok(HistoryDto {
                    id: row.get(0)?,
                    item_id: row.get(1)?,
                    action: row.get(2)?,
                    before_json: row.get(3)?,
                    after_json: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|error| error.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())
    }

    pub fn attachment(&self, item_id: String) -> Result<Option<AttachmentDto>, String> {
        self.connection
            .query_row(
                "SELECT id, item_id, file_name, mime_type, size, created_at, updated_at FROM item_attachments WHERE item_id = ?1",
                params![item_id],
                |row| {
                    Ok(AttachmentDto {
                        id: row.get(0)?,
                        item_id: row.get(1)?,
                        file_name: row.get(2)?,
                        mime_type: row.get(3)?,
                        size: row.get(4)?,
                        created_at: row.get(5)?,
                        updated_at: row.get(6)?,
                    })
                },
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn attachment_path(&self, item_id: String) -> Result<Option<String>, String> {
        self.connection
            .query_row(
                "SELECT relative_path FROM item_attachments WHERE item_id = ?1",
                params![item_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn save_attachment(
        &mut self,
        item_id: String,
        file_name: String,
        mime_type: String,
        size: i64,
        relative_path: String,
    ) -> Result<AttachmentDto, String> {
        if size <= 0 || size > 10 * 1024 * 1024 {
            return Err("图片大小必须在 1B 到 10MB 之间".to_string());
        }
        if !mime_type.starts_with("image/") {
            return Err("只支持图片文件".to_string());
        }
        let timestamp = now_ms();
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| error.to_string())?;
        ensure_item_exists(&transaction, &item_id)?;
        let before = attachment_json(&transaction, &item_id)?;
        let attachment_id = uuid_like();
        transaction
            .execute(
                "INSERT INTO item_attachments (id, item_id, file_name, mime_type, size, relative_path, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
                 ON CONFLICT(item_id) DO UPDATE SET file_name = excluded.file_name, mime_type = excluded.mime_type, size = excluded.size, relative_path = excluded.relative_path, updated_at = excluded.updated_at",
                params![attachment_id, item_id, file_name, mime_type, size, relative_path, timestamp],
            )
            .map_err(|error| error.to_string())?;
        let after = attachment_json(&transaction, &item_id)?;
        transaction
            .execute(
                "INSERT INTO item_history (item_id, action, before_json, after_json, created_at) VALUES (?1, 'attachment_updated', ?2, ?3, ?4)",
                params![item_id, before, after, timestamp],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        self.attachment(item_id)?
            .ok_or_else(|| "保存图片后无法读取元数据".to_string())
    }

    pub fn remove_attachment(&mut self, item_id: String) -> Result<Option<String>, String> {
        let timestamp = now_ms();
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| error.to_string())?;
        let path: Option<String> = transaction
            .query_row(
                "SELECT relative_path FROM item_attachments WHERE item_id = ?1",
                params![item_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if path.is_none() {
            transaction.commit().map_err(|error| error.to_string())?;
            return Ok(None);
        }
        let before = attachment_json(&transaction, &item_id)?;
        transaction
            .execute(
                "DELETE FROM item_attachments WHERE item_id = ?1",
                params![item_id],
            )
            .map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO item_history (item_id, action, before_json, after_json, created_at) VALUES (?1, 'attachment_deleted', ?2, NULL, ?3)",
                params![item_id, before, timestamp],
            )
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(path)
    }
}

fn ensure_list_exists(connection: &Connection, id: &str) -> Result<(), String> {
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM item_lists WHERE id = ?1)",
            params![id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if exists {
        Ok(())
    } else {
        Err("目标列表不存在".to_string())
    }
}

fn ensure_item_exists(connection: &Connection, id: &str) -> Result<(), String> {
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM items WHERE id = ?1)",
            params![id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if exists {
        Ok(())
    } else {
        Err("物品不存在".to_string())
    }
}

fn attachment_json(connection: &Connection, item_id: &str) -> Result<Option<String>, String> {
    let attachment = connection
        .query_row(
            "SELECT id, item_id, file_name, mime_type, size, created_at, updated_at FROM item_attachments WHERE item_id = ?1",
            params![item_id],
            |row| Ok(AttachmentDto { id: row.get(0)?, item_id: row.get(1)?, file_name: row.get(2)?, mime_type: row.get(3)?, size: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)? }),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    attachment
        .map(|value| serde_json::to_string(&value).map_err(|error| error.to_string()))
        .transpose()
}

fn snapshot_json(connection: &Connection, id: &str) -> Result<String, String> {
    let item = connection.query_row("SELECT i.id, i.list_id, l.name, i.name, i.location, i.note, i.icon, i.updated_at FROM items i JOIN item_lists l ON l.id = i.list_id WHERE i.id = ?1", params![id], |row| Ok(ItemDto { id: row.get(0)?, list_id: row.get(1)?, list_name: row.get(2)?, name: row.get(3)?, location: row.get(4)?, note: row.get(5)?, icon: row.get(6)?, updated_at: row.get(7)? })).map_err(|error| error.to_string())?;
    serde_json::to_string(&item).map_err(|error| error.to_string())
}

fn validate_item(input: &ItemInput) -> Result<(), String> {
    required(input.name.clone(), "物品名称")?;
    required(input.location.clone(), "位置")?;
    Ok(())
}

fn required(value: String, field: &str) -> Result<String, String> {
    let value = value.trim().to_string();
    if value.is_empty() {
        Err(format!("{}不能为空", field))
    } else {
        Ok(value)
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn uuid_like() -> String {
    uuid::Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_database() -> Database {
        let path = std::env::temp_dir().join(format!("where-test-{}.db", uuid_like()));
        Database::open(&path).expect("test database should open")
    }

    #[test]
    fn initializes_default_lists() {
        let database = test_database();
        let lists = database.lists().expect("lists should load");
        assert_eq!(lists.len(), 2);
        assert_eq!(lists[0].name, "放在");
        assert_eq!(lists[1].name, "存有");
    }

    #[test]
    fn item_changes_are_transactional_and_historized() {
        let mut database = test_database();
        let created = database
            .create_item(ItemInput {
                list_id: "placed".into(),
                name: "雨伞".into(),
                location: "玄关柜".into(),
                note: Some("黑色".into()),
                icon: None,
            })
            .expect("item should be created");
        assert_eq!(database.items("placed".into()).unwrap().len(), 1);

        let updated = database
            .update_item(
                created.id.clone(),
                ItemInput {
                    list_id: "placed".into(),
                    name: "雨伞".into(),
                    location: "书柜架子".into(),
                    note: None,
                    icon: None,
                },
            )
            .expect("item should update");
        assert_eq!(updated.location, "书柜架子");
        assert_eq!(database.history(created.id.clone()).unwrap().len(), 2);

        database
            .delete_item(created.id.clone())
            .expect("item should delete");
        assert!(database.items("placed".into()).unwrap().is_empty());
        assert_eq!(database.history(created.id).unwrap().len(), 3);
    }

    #[test]
    fn list_with_items_cannot_be_deleted() {
        let mut database = test_database();
        database
            .create_item(ItemInput {
                list_id: "stored".into(),
                name: "充电线".into(),
                location: "抽屉".into(),
                note: None,
                icon: None,
            })
            .expect("item should be created");
        assert!(database.delete_list("stored".into()).is_err());
    }

    #[test]
    fn attachment_metadata_is_replaced_and_removed() {
        let mut database = test_database();
        let item = database
            .create_item(ItemInput {
                list_id: "placed".into(),
                name: "相机".into(),
                location: "书桌".into(),
                note: None,
                icon: None,
            })
            .expect("item should be created");
        let attachment = database
            .save_attachment(
                item.id.clone(),
                "camera.png".into(),
                "image/png".into(),
                128,
                "attachments/a.png".into(),
            )
            .expect("attachment should be saved");
        assert_eq!(attachment.file_name, "camera.png");
        assert!(database.attachment(item.id.clone()).unwrap().is_some());
        assert_eq!(
            database.remove_attachment(item.id).unwrap(),
            Some("attachments/a.png".into())
        );
    }
}
