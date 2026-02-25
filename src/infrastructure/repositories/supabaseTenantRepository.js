const { getSupabaseAdminClient } = require('../../config/supabase');
const { throwIfError } = require('./supabaseUtils');

class SupabaseTenantRepository {
  constructor() {
    this.db = getSupabaseAdminClient();
  }

  async findBySlug(slug) {
    const { data, error } = await this.db.from('tenants').select('*').eq('slug', slug).maybeSingle();
    throwIfError(error, 'tenant slug 조회 실패');
    return data || null;
  }

  async findById(tenantId) {
    const { data, error } = await this.db.from('tenants').select('*').eq('id', tenantId).maybeSingle();
    throwIfError(error, 'tenant id 조회 실패');
    return data || null;
  }

  async listAll() {
    const { data, error } = await this.db
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    throwIfError(error, 'tenant 목록 조회 실패');
    return data || [];
  }

  async createTenant({ name, slug }) {
    const { data, error } = await this.db
      .from('tenants')
      .insert({ name, slug })
      .select('*')
      .single();
    throwIfError(error, 'tenant 생성 실패');
    return data;
  }

  async updateTenant(tenantId, { name, slug }) {
    const { data, error } = await this.db
      .from('tenants')
      .update({
        name,
        slug,
      })
      .eq('id', tenantId)
      .select('*')
      .maybeSingle();
    throwIfError(error, 'tenant 수정 실패');
    return data || null;
  }

  async getSettings(tenantId) {
    const { data, error } = await this.db
      .from('tenant_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    throwIfError(error, 'tenant_settings 조회 실패');
    return data || null;
  }

  async upsertSettings(tenantId, { inquiryRetentionDays, privacyPolicyText }) {
    const { error } = await this.db.from('tenant_settings').upsert(
      {
        tenant_id: tenantId,
        inquiry_retention_days: inquiryRetentionDays,
        privacy_policy_text: privacyPolicyText,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'tenant_id',
      }
    );
    throwIfError(error, 'tenant_settings upsert 실패');

    return this.getSettings(tenantId);
  }
}

module.exports = SupabaseTenantRepository;
