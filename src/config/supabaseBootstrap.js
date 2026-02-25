const bcrypt = require('bcryptjs');
const { getSupabaseAdminClient } = require('./supabase');

const DEFAULT_TENANT = {
  slug: 'dandelion-effect',
  name: '주식회사 민들레효과',
};

const DEFAULT_PRIVACY_TEXT =
  '문의 접수 시 개인정보(이름, 연락처, 업체명)를 수집하며, 상담 목적 범위 내에서만 이용합니다.';

function throwIfError(error, message) {
  if (!error) return;
  if (error.code === '42P01') {
    throw new Error(
      `${message}: Supabase 테이블이 없습니다. 먼저 supabase/schema.sql 을 SQL Editor에서 실행해주세요.`
    );
  }
  throw new Error(`${message}: ${error.message}`);
}

async function initSupabase() {
  const supabase = getSupabaseAdminClient();

  const tenantResult = await supabase
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', DEFAULT_TENANT.slug)
    .maybeSingle();
  throwIfError(tenantResult.error, '기본 tenant 조회 실패');

  let tenant = tenantResult.data;
  if (!tenant) {
    const insertResult = await supabase
      .from('tenants')
      .insert({
        slug: DEFAULT_TENANT.slug,
        name: DEFAULT_TENANT.name,
      })
      .select('id, slug, name')
      .single();
    throwIfError(insertResult.error, '기본 tenant 생성 실패');
    tenant = insertResult.data;
  }

  const settingsResult = await supabase
    .from('tenant_settings')
    .select('tenant_id')
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  throwIfError(settingsResult.error, 'tenant_settings 조회 실패');

  if (!settingsResult.data) {
    const createSettings = await supabase.from('tenant_settings').insert({
      tenant_id: tenant.id,
      inquiry_retention_days: 365,
      privacy_policy_text: DEFAULT_PRIVACY_TEXT,
    });
    throwIfError(createSettings.error, 'tenant_settings 생성 실패');
  }

  const adminResult = await supabase
    .from('admin_users')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('username', 'admin')
    .maybeSingle();
  throwIfError(adminResult.error, '기본 관리자 조회 실패');

  if (!adminResult.data) {
    const passwordHash = await bcrypt.hash('admin1234', 10);
    const createAdmin = await supabase.from('admin_users').insert({
      tenant_id: tenant.id,
      username: 'admin',
      password_hash: passwordHash,
      display_name: 'Master Admin',
      password_updated_at: new Date().toISOString(),
    });
    throwIfError(createAdmin.error, '기본 관리자 생성 실패');
  }

  return { tenantId: tenant.id };
}

module.exports = {
  initSupabase,
};
