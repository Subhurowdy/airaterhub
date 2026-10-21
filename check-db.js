
const db = require("./database");

const tables = db.prepare(`
  SELECT name
  FROM sqlite_master
  WHERE type = 'table'
    AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

console.log("Database tables:", tables);

const analyses = db.prepare(`
  SELECT id, url, overall_score, created_at
  FROM analyses
  ORDER BY id DESC
  LIMIT 5
`).all();

console.log("Saved analyses:", analyses);

db.close();