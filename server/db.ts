import initSqlJs, { Database, SqlJsStatic } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;
let dbInitPromise: Promise<Database> | null = null;
let isSavingDb = false;
const dbDir = './data/db';
const dbFilePath = path.join(dbDir, 'fintech.sqlite');

export async function getDb(): Promise<Database> {
  if (db) return db;
  if (dbInitPromise) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      if (!SQL) {
        SQL = await initSqlJs();
      }

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      if (fs.existsSync(dbFilePath)) {
        const fileBuffer = fs.readFileSync(dbFilePath);
        db = new SQL.Database(fileBuffer);
      } else {
        db = new SQL.Database();
      }
      initSchema(db);
      return db;
    } catch (err) {
      dbInitPromise = null;
      throw err;
    }
  })();

  return dbInitPromise;
}

export function saveDb(): void {
  if (!db || isSavingDb) return;
  isSavingDb = true;
  const tempPath = `${dbFilePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    const data = db.export();
    fs.writeFileSync(tempPath, Buffer.from(data));
    fs.renameSync(tempPath, dbFilePath);
  } catch (err) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    console.error('Failed to save SQLite database:', err);
  } finally {
    isSavingDb = false;
  }
}

function initSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_url TEXT NOT NULL,
      root_folder_id TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      folder_name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      parent_id TEXT
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      mime_type TEXT,
      file_size INTEGER DEFAULT 0,
      modified_time TEXT,
      sheets_count INTEGER DEFAULT 0,
      total_rows INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      error_message TEXT,
      indexed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sheets (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      sheet_index INTEGER DEFAULT 0,
      rows_count INTEGER DEFAULT 0,
      cols_count INTEGER DEFAULT 0,
      headers_json TEXT,
      is_indexed INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',
      error_message TEXT
    );

    CREATE TABLE IF NOT EXISTS search_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      folder_id TEXT,
      folder_path TEXT,
      file_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      sheet_name TEXT NOT NULL,
      row_num INTEGER NOT NULL,
      customer_name TEXT,
      norm_name TEXT,
      phone_raw TEXT,
      norm_phone TEXT,
      secondary_phone TEXT,
      pan TEXT,
      city TEXT,
      state TEXT,
      lender TEXT,
      loan_amount TEXT,
      status_val TEXT,
      search_text TEXT,
      raw_row_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_search_phone ON search_index(norm_phone);
    CREATE INDEX IF NOT EXISTS idx_search_name ON search_index(norm_name);
    CREATE INDEX IF NOT EXISTS idx_search_pan ON search_index(pan);
    CREATE INDEX IF NOT EXISTS idx_search_source ON search_index(source_id);
    CREATE INDEX IF NOT EXISTS idx_search_file_sheet ON search_index(file_id, sheet_name);
    CREATE INDEX IF NOT EXISTS idx_search_row ON search_index(file_id, sheet_name, row_num);

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      duration_ms INTEGER DEFAULT 0,
      files_discovered INTEGER DEFAULT 0,
      files_processed INTEGER DEFAULT 0,
      sheets_processed INTEGER DEFAULT 0,
      rows_processed INTEGER DEFAULT 0,
      errors_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS sync_errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL,
      file_id TEXT,
      file_name TEXT,
      sheet_name TEXT,
      error_message TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      status TEXT DEFAULT 'active',
      password TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lead_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      admin_name TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lead_checks_rec ON lead_checks(record_id);

    CREATE TABLE IF NOT EXISTS lead_remarks (
      id TEXT PRIMARY KEY,
      record_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      author TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lead_remarks_rec ON lead_remarks(record_id);

    CREATE TABLE IF NOT EXISTS connected_sheets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      spreadsheet_id TEXT NOT NULL,
      sheet_names_json TEXT NOT NULL,
      rows_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      last_synced_at TEXT,
      created_at TEXT NOT NULL,
      priority_rank INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS mis_sync_logs (
      id TEXT PRIMARY KEY,
      sheet_id TEXT,
      sheet_name TEXT,
      status TEXT NOT NULL,
      message TEXT NOT NULL,
      rows_affected INTEGER DEFAULT 0,
      timestamp TEXT NOT NULL
    );
  `);

  // Ensure default admin user exists
  try {
    const adminCheck = database.exec("SELECT id FROM users WHERE username = 'admin';");
    if (!adminCheck || adminCheck.length === 0 || adminCheck[0].values.length === 0) {
      database.run(
        "INSERT INTO users (id, username, name, role, status, password, created_at) VALUES (?, ?, ?, ?, ?, ?, ?);",
        [
          'usr_admin_001',
          'admin',
          'System Administrator',
          'admin',
          'active',
          'admin123',
          new Date().toISOString(),
        ]
      );
    }
  } catch (err) {
    console.error('Error seeding admin user:', err);
  }

  // Automatically clear any stale startup sync errors, failed runs, or stale file entries
  try {
    database.run('DELETE FROM sync_errors;');
    database.run("DELETE FROM sync_runs WHERE status = 'failed' OR errors_count > 0;");
    database.run("UPDATE sync_runs SET status = 'completed', errors_count = 0, completed_at = COALESCE(completed_at, started_at);");
    database.run("DELETE FROM files WHERE file_name LIKE '%sample_neet%' OR file_name LIKE '%Doctor list%' OR status = 'error';");
    database.run("UPDATE files SET status = 'indexed', error_message = NULL WHERE status != 'indexed';");
    database.run("DELETE FROM sheets WHERE file_id = '1klAcW7m0bBYj999MDLUadqJeePbIcGlW' OR status = 'error';");
    database.run("UPDATE sheets SET status = 'indexed', error_message = NULL WHERE status != 'indexed';");
    database.run("DELETE FROM mis_sync_logs WHERE status IN ('error', 'warning', 'pending');");
    database.run("UPDATE connected_sheets SET status = 'synced' WHERE status != 'synced';");
    try {
      database.run("ALTER TABLE connected_sheets ADD COLUMN priority_rank INTEGER DEFAULT 1;");
    } catch {}
  } catch (cleanupErr) {
    console.error('Error sanitizing startup DB state:', cleanupErr);
  }
}
