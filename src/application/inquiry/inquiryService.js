const Inquiry = require('../../domain/inquiry/inquiry');

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

class InquiryService {
  constructor(inquiryRepository, tenantService, inquiryAlertService = null) {
    this.inquiryRepository = inquiryRepository;
    this.tenantService = tenantService;
    this.inquiryAlertService = inquiryAlertService;
  }

  async create(tenantId, payload, meta = {}) {
    const settings = await this.tenantService.getSettings(tenantId);
    const retentionDays = Number(settings?.inquiry_retention_days || 365);
    const now = new Date();

    const inquiry = new Inquiry({
      tenantId,
      name: payload.name,
      phone: payload.phone,
      company: payload.company,
      message: payload.message,
      consentGiven: payload.consent === 'on' || payload.consent === 'true' || payload.consent === true,
      consentAt: now.toISOString(),
      retentionUntil: addDays(now, retentionDays).toISOString(),
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
      status: 'NEW',
    });
    inquiry.validate();

    const created = await this.inquiryRepository.create(inquiry);
    await this.inquiryRepository.addAuditLog({
      tenantId,
      inquiryId: created.id,
      action: 'PUBLIC_SUBMIT',
      detail: `문의 생성 / 보관기한 ${created.retention_until}`,
      actorType: 'public',
      actorId: meta.ipAddress || 'anonymous',
    });

    try {
      await this.notifyNewInquiry(tenantId, created);
    } catch (err) {
      await this.inquiryRepository.addAuditLog({
        tenantId,
        inquiryId: created.id,
        action: 'ALERT_FAILED',
        detail: `[system] ${err instanceof Error ? err.message : String(err)}`,
        actorType: 'system',
        actorId: null,
      });
    }

    return created;
  }

  async notifyNewInquiry(tenantId, inquiry) {
    if (!this.inquiryAlertService || !this.inquiryAlertService.hasEnabledChannel()) {
      return;
    }

    const results = await this.inquiryAlertService.notifyInquiryCreated({
      tenantId,
      inquiry,
    });

    for (const result of results) {
      // eslint-disable-next-line no-await-in-loop
      await this.inquiryRepository.addAuditLog({
        tenantId,
        inquiryId: inquiry.id,
        action: `ALERT_${result.status}`,
        detail: `[${result.channel}] ${result.detail || 'ok'}`,
        actorType: 'system',
        actorId: null,
      });
    }
  }

  async listAll(tenantId) {
    return this.inquiryRepository.listAll(tenantId);
  }

  async getById(tenantId, id) {
    return this.inquiryRepository.getById(tenantId, id);
  }

  async updateStatus(tenantId, id, status, actor = {}) {
    if (!['NEW', 'READ', 'REPLIED', 'CLOSED'].includes(status)) {
      throw new Error('Invalid inquiry status');
    }

    const before = await this.inquiryRepository.getById(tenantId, id);
    const updated = await this.inquiryRepository.updateStatus(tenantId, id, status);

    await this.inquiryRepository.addAuditLog({
      tenantId,
      inquiryId: id,
      action: 'STATUS_UPDATE',
      detail: `${before?.status || 'UNKNOWN'} -> ${status}`,
      actorType: actor.actorType || 'admin',
      actorId: actor.actorId ? String(actor.actorId) : null,
    });

    return updated;
  }

  async purgeExpired(tenantId, actor = {}) {
    const expired = await this.inquiryRepository.listExpiredForPurge(tenantId);

    for (const item of expired) {
      // eslint-disable-next-line no-await-in-loop
      await this.inquiryRepository.addAuditLog({
        tenantId,
        inquiryId: item.id,
        action: 'PURGE',
        detail: `보관기간 만료로 삭제 (${item.retention_until})`,
        actorType: actor.actorType || 'system',
        actorId: actor.actorId ? String(actor.actorId) : null,
      });
      // eslint-disable-next-line no-await-in-loop
      await this.inquiryRepository.hardDelete(tenantId, item.id);
    }

    return expired.length;
  }

  async listLogs(tenantId, limit = 200) {
    return this.inquiryRepository.listAuditLogs(tenantId, limit);
  }

  async logEvent(tenantId, action, detail, actor = {}) {
    await this.inquiryRepository.addAuditLog({
      tenantId,
      inquiryId: null,
      action,
      detail,
      actorType: actor.actorType || 'system',
      actorId: actor.actorId ? String(actor.actorId) : null,
    });
  }
}

module.exports = InquiryService;
