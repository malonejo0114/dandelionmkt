class Inquiry {
  constructor({
    id = null,
    tenantId,
    name,
    phone,
    company,
    message,
    consentGiven,
    consentAt = null,
    retentionUntil = null,
    ipAddress = null,
    userAgent = null,
    status = 'NEW',
    createdAt = null,
    updatedAt = null,
  }) {
    this.id = id;
    this.tenantId = tenantId;
    this.name = name;
    this.phone = phone;
    this.company = company;
    this.message = message;
    this.consentGiven = Boolean(consentGiven);
    this.consentAt = consentAt;
    this.retentionUntil = retentionUntil;
    this.ipAddress = ipAddress;
    this.userAgent = userAgent;
    this.status = status;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  validate() {
    if (!this.tenantId) throw new Error('tenantId is required');
    if (!this.name || this.name.trim().length < 2) throw new Error('이름을 입력해주세요.');
    if (!this.phone || this.phone.trim().length < 7) throw new Error('전화번호를 입력해주세요.');
    if (!this.company || this.company.trim().length < 2) throw new Error('업체명을 입력해주세요.');
    if (!this.message || this.message.trim().length < 5) throw new Error('문의사항을 입력해주세요.');
    if (!this.consentGiven) throw new Error('개인정보 수집 및 이용 동의가 필요합니다.');
    if (!['NEW', 'READ', 'REPLIED', 'CLOSED'].includes(this.status)) throw new Error('Invalid inquiry status');
  }
}

module.exports = Inquiry;
