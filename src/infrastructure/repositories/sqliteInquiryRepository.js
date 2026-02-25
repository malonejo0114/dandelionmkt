const { run, get, all } = require('../../config/database');

class SqliteInquiryRepository {
  async create(inquiry) {
    const result = await run(
      `INSERT INTO inquiries
      (tenant_id, name, phone, company, message, status, consent_given, consent_at, retention_until, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        inquiry.tenantId,
        inquiry.name,
        inquiry.phone,
        inquiry.company,
        inquiry.message,
        inquiry.status,
        inquiry.consentGiven ? 1 : 0,
        inquiry.consentAt,
        inquiry.retentionUntil,
        inquiry.ipAddress,
        inquiry.userAgent,
      ]
    );

    return get('SELECT * FROM inquiries WHERE id = ?', [result.lastID]);
  }

  async listAll(tenantId) {
    return all(
      `SELECT *
       FROM inquiries
       WHERE tenant_id = ?
       ORDER BY datetime(created_at) DESC`,
      [tenantId]
    );
  }

  async getById(tenantId, id) {
    return get('SELECT * FROM inquiries WHERE tenant_id = ? AND id = ?', [tenantId, id]);
  }

  async updateStatus(tenantId, id, status) {
    await run(
      `UPDATE inquiries
       SET status = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND id = ?`,
      [status, tenantId, id]
    );

    return this.getById(tenantId, id);
  }

  async listExpiredForPurge(tenantId) {
    return all(
      `SELECT *
       FROM inquiries
       WHERE tenant_id = ?
         AND deleted_at IS NULL
         AND retention_until IS NOT NULL
         AND datetime(retention_until) <= datetime('now')`,
      [tenantId]
    );
  }

  async hardDelete(tenantId, id) {
    await run('DELETE FROM inquiries WHERE tenant_id = ? AND id = ?', [tenantId, id]);
  }

  async addAuditLog({ tenantId, inquiryId = null, action, detail = null, actorType, actorId = null }) {
    await run(
      `INSERT INTO inquiry_audit_logs
      (tenant_id, inquiry_id, action, detail, actor_type, actor_id)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, inquiryId, action, detail, actorType, actorId]
    );
  }

  async listAuditLogs(tenantId, limit = 200) {
    return all(
      `SELECT *
       FROM inquiry_audit_logs
       WHERE tenant_id = ?
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT ?`,
      [tenantId, limit]
    );
  }
}

module.exports = SqliteInquiryRepository;
