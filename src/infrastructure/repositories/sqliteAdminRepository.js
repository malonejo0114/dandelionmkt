const { run, get } = require('../../config/database');

class SqliteAdminRepository {
  async findByUsername(tenantId, username) {
    return get(
      'SELECT * FROM admin_users WHERE tenant_id = ? AND username = ?',
      [tenantId, username]
    );
  }

  async findById(tenantId, adminId) {
    return get('SELECT * FROM admin_users WHERE tenant_id = ? AND id = ?', [tenantId, adminId]);
  }

  async createAdmin({ tenantId, username, passwordHash, displayName }) {
    await run(
      `INSERT INTO admin_users
      (tenant_id, username, password_hash, display_name, password_updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))`,
      [tenantId, username, passwordHash, displayName]
    );
  }

  async updatePassword(tenantId, adminId, passwordHash) {
    await run(
      `UPDATE admin_users
       SET password_hash = ?, password_updated_at = datetime('now'), must_change_password = 0
       WHERE tenant_id = ? AND id = ?`,
      [passwordHash, tenantId, adminId]
    );
  }

  async updateTwoFactor(tenantId, adminId, { enabled, secret }) {
    await run(
      `UPDATE admin_users
       SET twofa_enabled = ?, twofa_secret = ?
       WHERE tenant_id = ? AND id = ?`,
      [enabled ? 1 : 0, secret || null, tenantId, adminId]
    );
  }

  async markFailedLogin(tenantId, adminId, { failedCount, lockUntil = null }) {
    await run(
      `UPDATE admin_users
       SET failed_login_count = ?, locked_until = ?
       WHERE tenant_id = ? AND id = ?`,
      [failedCount, lockUntil, tenantId, adminId]
    );
  }

  async resetLoginFailures(tenantId, adminId) {
    await run(
      `UPDATE admin_users
       SET failed_login_count = 0, locked_until = NULL
       WHERE tenant_id = ? AND id = ?`,
      [tenantId, adminId]
    );
  }
}

module.exports = SqliteAdminRepository;
