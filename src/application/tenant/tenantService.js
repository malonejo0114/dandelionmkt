const slugify = require('slugify');

class TenantService {
  constructor(tenantRepository) {
    this.tenantRepository = tenantRepository;
  }

  async findBySlug(slug) {
    return this.tenantRepository.findBySlug(slug);
  }

  async findById(tenantId) {
    return this.tenantRepository.findById(tenantId);
  }

  async listAll() {
    return this.tenantRepository.listAll();
  }

  async getSettings(tenantId) {
    const settings = await this.tenantRepository.getSettings(tenantId);
    if (settings) return settings;

    return this.tenantRepository.upsertSettings(tenantId, {
      inquiryRetentionDays: 365,
      privacyPolicyText:
        '문의 접수 시 개인정보(이름, 연락처, 업체명)를 수집하며, 상담 목적 범위 내에서만 이용합니다.',
    });
  }

  async updateCurrentTenant(tenantId, payload) {
    const normalizedSlug = slugify(payload.slug || payload.name || 'tenant', {
      lower: true,
      strict: true,
      trim: true,
    });

    await this.tenantRepository.updateTenant(tenantId, {
      name: payload.name,
      slug: normalizedSlug,
    });

    await this.tenantRepository.upsertSettings(tenantId, {
      inquiryRetentionDays: Number(payload.inquiryRetentionDays) || 365,
      privacyPolicyText:
        payload.privacyPolicyText ||
        '문의 접수 시 개인정보(이름, 연락처, 업체명)를 수집하며, 상담 목적 범위 내에서만 이용합니다.',
    });

    return {
      tenant: await this.tenantRepository.findById(tenantId),
      settings: await this.tenantRepository.getSettings(tenantId),
    };
  }

  async createTenant(payload) {
    const normalizedSlug = slugify(payload.slug || payload.name || 'tenant', {
      lower: true,
      strict: true,
      trim: true,
    });

    const exists = await this.tenantRepository.findBySlug(normalizedSlug);
    if (exists) {
      throw new Error('이미 사용 중인 tenant slug 입니다.');
    }

    const tenant = await this.tenantRepository.createTenant({
      name: payload.name,
      slug: normalizedSlug,
    });

    await this.tenantRepository.upsertSettings(tenant.id, {
      inquiryRetentionDays: Number(payload.inquiryRetentionDays) || 365,
      privacyPolicyText:
        payload.privacyPolicyText ||
        '문의 접수 시 개인정보(이름, 연락처, 업체명)를 수집하며, 상담 목적 범위 내에서만 이용합니다.',
    });

    return {
      tenant,
      settings: await this.tenantRepository.getSettings(tenant.id),
    };
  }
}

module.exports = TenantService;
