
const Database = require("better-sqlite3");
const fs = require("node:fs");
const path = require("node:path");

// Database ke liye alag folder
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

// SQLite database file
const dbPath = path.join(dataDir, "airaterhub.db");
const db = new Database(dbPath);

// Basic database settings
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free'
      CHECK (plan IN ('free', 'pro')),
    pro_expires_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    url TEXT NOT NULL,
    overall_score INTEGER,
    report_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_analyses_user_id
  ON analyses(user_id);
`);

console.log("AiraterHub SQLite database ready!");
console.log("Database location:", dbPath);

module.exports = db;