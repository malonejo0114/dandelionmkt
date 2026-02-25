const { getSupabaseAdminClient } = require('../../config/supabase');
const { throwIfError } = require('./supabaseUtils');

class SupabaseInquiryRepository {
  constructor() {
    this.db = getSupabaseAdminClient();
  }

  async create(inquiry) {
    const { data, error } = await this.db
      .from('inquiries')
      .insert({
        tenant_id: inquiry.tenantId,
        name: inquiry.name,
        phone: inquiry.phone,
        company: inquiry.company,
        message: inquiry.message,
        status: inquiry.status,
        consent_given: inquiry.consentGiven ? 1 : 0,
        consent_at: inquiry.consentAt,
        retention_until: inquiry.retentionUntil,
        ip_address: inquiry.ipAddress,
        user_agent: inquiry.userAgent,
      })
      .select('*')
      .single();
    throwIfError(error, '문의 생성 실패');
    return data;
  }

  async listAll(tenantId) {
    const { data, error } = await this.db
      .from('inquiries')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });
    throwIfError(error, '문의 목록 조회 실패');
    return data || [];
  }

  async getById(tenantId, id) {
    const { data, error } = await this.db
      .from('inquiries')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    throwIfError(error, '문의 조회 실패');
    return data || null;
  }

  async updateStatus(tenantId, id, status) {
    const { data, error } = await this.db
      .from('inquiries')
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    throwIfError(error, '문의 상태 업데이트 실패');
    return data || null;
  }

  async listExpiredForPurge(tenantId) {
    const now = new Date().toISOString();

    const { data, error } = await this.db
      .from('inquiries')
      .select('*')
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .not('retention_until', 'is', null)
      .lte('retention_until', now);
    throwIfError(error, '만료 문의 조회 실패');
    return data || [];
  }

  async hardDelete(tenantId, id) {
    const { error } = await this.db
      .from('inquiries')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    throwIfError(error, '문의 삭제 실패');
  }

  async addAuditLog({ tenantId, inquiryId = null, action, detail = null, actorType, actorId = null }) {
    const { error } = await this.db.from('inquiry_audit_logs').insert({
      tenant_id: tenantId,
      inquiry_id: inquiryId,
      action,
      detail,
      actor_type: actorType,
      actor_id: actorId,
    });
    throwIfError(error, '문의 감사 로그 저장 실패');
  }

  async listAuditLogs(tenantId, limit = 200) {
    const { data, error } = await this.db
      .from('inquiry_audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);
    throwIfError(error, '문의 감사 로그 조회 실패');
    return data || [];
  }
}

module.exports = SupabaseInquiryRepository;
