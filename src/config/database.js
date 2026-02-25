const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const projectRoot = path.resolve(__dirname, '../..');
const dataDir = path.join(projectRoot, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.sqlite');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

async function ensureColumn(tableName, columnName, definition) {
  const columns = await all(`PRAGMA table_info(${tableName})`);
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    await run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function ensureDefaultTenantSettings(tenantId) {
  const row = await get('SELECT tenant_id FROM tenant_settings WHERE tenant_id = ?', [tenantId]);
  if (!row) {
    await run(
      `INSERT INTO tenant_settings
      (tenant_id, inquiry_retention_days, privacy_policy_text)
      VALUES (?, ?, ?)`,
      [
        tenantId,
        365,
        '문의 접수 시 개인정보(이름, 연락처, 업체명)를 수집하며, 상담 목적 범위 내에서만 이용합니다.',
      ]
    );
  }
}

async function initSchema() {
  await run('PRAGMA foreign_keys = ON');

  await run(`
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (tenant_id, username),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn('admin_users', 'twofa_enabled', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('admin_users', 'twofa_secret', 'TEXT');
  await ensureColumn('admin_users', 'failed_login_count', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('admin_users', 'locked_until', 'TEXT');
  await ensureColumn('admin_users', 'password_updated_at', 'TEXT');
  await ensureColumn('admin_users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
  await run(
    "UPDATE admin_users SET password_updated_at = datetime('now') WHERE password_updated_at IS NULL"
  );

  await run(`
    CREATE TABLE IF NOT EXISTS tenant_settings (
      tenant_id INTEGER PRIMARY KEY,
      inquiry_retention_days INTEGER NOT NULL DEFAULT 365,
      privacy_policy_text TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS content_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('portfolio', 'service')),
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      summary TEXT,
      body TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      thumbnail_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (tenant_id, type, slug),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      storage_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS content_media_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_item_id INTEGER NOT NULL,
      media_asset_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      UNIQUE (content_item_id, media_asset_id),
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
      FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS content_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      content_item_id INTEGER NOT NULL,
      block_type TEXT NOT NULL CHECK (block_type IN ('text', 'image', 'video')),
      content_text TEXT,
      media_asset_id INTEGER,
      media_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (content_item_id) REFERENCES content_items(id) ON DELETE CASCADE,
      FOREIGN KEY (media_asset_id) REFERENCES media_assets(id) ON DELETE SET NULL
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      company TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'READ', 'REPLIED', 'CLOSED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  await ensureColumn('inquiries', 'consent_given', 'INTEGER NOT NULL DEFAULT 0');
  await ensureColumn('inquiries', 'consent_at', 'TEXT');
  await ensureColumn('inquiries', 'retention_until', 'TEXT');
  await ensureColumn('inquiries', 'deleted_at', 'TEXT');
  await ensureColumn('inquiries', 'ip_address', 'TEXT');
  await ensureColumn('inquiries', 'user_agent', 'TEXT');

  await run(`
    CREATE TABLE IF NOT EXISTS inquiry_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tenant_id INTEGER NOT NULL,
      inquiry_id INTEGER,
      action TEXT NOT NULL,
      detail TEXT,
      actor_type TEXT NOT NULL CHECK (actor_type IN ('public', 'admin', 'system')),
      actor_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
    )
  `);

  await run('CREATE INDEX IF NOT EXISTS idx_content_blocks_content ON content_blocks(content_item_id, sort_order)');
  await run('CREATE INDEX IF NOT EXISTS idx_inquiries_retention ON inquiries(tenant_id, retention_until)');
  await run('CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON inquiry_audit_logs(tenant_id, created_at)');

  const existingTenant = await get('SELECT id FROM tenants WHERE slug = ?', ['dandelion-effect']);
  let tenantId = existingTenant ? existingTenant.id : null;

  if (!tenantId) {
    const tenantInsert = await run(
      'INSERT INTO tenants (name, slug) VALUES (?, ?)',
      ['주식회사 민들레효과', 'dandelion-effect']
    );
    tenantId = tenantInsert.lastID;
  }

  await ensureDefaultTenantSettings(tenantId);

  const existingAdmin = await get(
    'SELECT id FROM admin_users WHERE tenant_id = ? AND username = ?',
    [tenantId, 'admin']
  );

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('admin1234', 10);
    await run(
      `INSERT INTO admin_users
      (tenant_id, username, password_hash, display_name, password_updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))`,
      [tenantId, 'admin', passwordHash, 'Master Admin']
    );
  }

  return { tenantId };
}

module.exports = {
  db,
  dbPath,
  dataDir,
  run,
  get,
  all,
  initSchema,
};
