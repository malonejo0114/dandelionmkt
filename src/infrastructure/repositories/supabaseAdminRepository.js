const { getSupabaseAdminClient } = require('../../config/supabase');
const { throwIfError } = require('./supabaseUtils');

class SupabaseAdminRepository {
  constructor() {
    this.db = getSupabaseAdminClient();
  }

  async findByUsername(tenantId, username) {
    const { data, error } = await this.db
      .from('admin_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('username', username)
      .maybeSingle();
    throwIfError(error, '관리자 계정 조회 실패');
    return data || null;
  }

  async findById(tenantId, adminId) {
    const { data, error } = await this.db
      .from('admin_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', adminId)
      .maybeSingle();
    throwIfError(error, '관리자 계정 조회 실패');
    return data || null;
  }

  async createAdmin({ tenantId, username, passwordHash, displayName }) {
    const { error } = await this.db.from('admin_users').insert({
      tenant_id: tenantId,
      username,
      password_hash: passwordHash,
      display_name: displayName,
      password_updated_at: new Date().toISOString(),
    });
    throwIfError(error, '관리자 계정 생성 실패');
  }

  async updatePassword(tenantId, adminId, passwordHash) {
    const { error } = await this.db
      .from('admin_users')
      .update({
        password_hash: passwordHash,
        password_updated_at: new Date().toISOString(),
        must_change_password: 0,
      })
      .eq('tenant_id', tenantId)
      .eq('id', adminId);
    throwIfError(error, '관리자 비밀번호 변경 실패');
  }

  async updateTwoFactor(tenantId, adminId, { enabled, secret }) {
    const { error } = await this.db
      .from('admin_users')
      .update({
        twofa_enabled: enabled ? 1 : 0,
        twofa_secret: secret || null,
      })
      .eq('tenant_id', tenantId)
      .eq('id', adminId);
    throwIfError(error, '2FA 상태 변경 실패');
  }

  async markFailedLogin(tenantId, adminId, { failedCount, lockUntil = null }) {
    const { error } = await this.db
      .from('admin_users')
      .update({
        failed_login_count: failedCount,
        locked_until: lockUntil,
      })
      .eq('tenant_id', tenantId)
      .eq('id', adminId);
    throwIfError(error, '로그인 실패 카운트 반영 실패');
  }

  async resetLoginFailures(tenantId, adminId) {
    const { error } = await this.db
      .from('admin_users')
      .update({
        failed_login_count: 0,
        locked_until: null,
      })
      .eq('tenant_id', tenantId)
      .eq('id', adminId);
    throwIfError(error, '로그인 실패 카운트 초기화 실패');
  }
}

module.exports = SupabaseAdminRepository;
