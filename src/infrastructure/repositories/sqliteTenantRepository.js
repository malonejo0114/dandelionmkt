const { run, get, all } = require('../../config/database');

class SqliteTenantRepository {
  async findBySlug(slug) {
    return get('SELECT * FROM tenants WHERE slug = ?', [slug]);
  }

  async findById(tenantId) {
    return get('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  }

  async listAll() {
    return all('SELECT * FROM tenants ORDER BY datetime(created_at) DESC, id DESC');
  }

  async createTenant({ name, slug }) {
    const result = await run('INSERT INTO tenants (name, slug) VALUES (?, ?)', [name, slug]);
    return this.findById(result.lastID);
  }

  async updateTenant(tenantId, { name, slug }) {
    await run('UPDATE tenants SET name = ?, slug = ? WHERE id = ?', [name, slug, tenantId]);
    return this.findById(tenantId);
  }

  async getSettings(tenantId) {
    return get('SELECT * FROM tenant_settings WHERE tenant_id = ?', [tenantId]);
  }

  async upsertSettings(tenantId, { inquiryRetentionDays, privacyPolicyText }) {
    const existing = await this.getSettings(tenantId);
    if (!existing) {
      await run(
        `INSERT INTO tenant_settings
        (tenant_id, inquiry_retention_days, privacy_policy_text, updated_at)
        VALUES (?, ?, ?, datetime('now'))`,
        [tenantId, inquiryRetentionDays, privacyPolicyText]
      );
      return this.getSettings(tenantId);
    }

    await run(
      `UPDATE tenant_settings
       SET inquiry_retention_days = ?, privacy_policy_text = ?, updated_at = datetime('now')
       WHERE tenant_id = ?`,
      [inquiryRetentionDays, privacyPolicyText, tenantId]
    );

    return this.getSettings(tenantId);
  }
}

module.exports = SqliteTenantRepository;
