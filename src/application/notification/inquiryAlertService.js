class InquiryAlertService {
  constructor({ channels = [], adminBaseUrl = '' } = {}) {
    this.channels = channels.filter(Boolean);
    this.adminBaseUrl = adminBaseUrl || '';
  }

  hasEnabledChannel() {
    return this.channels.length > 0;
  }

  getEnabledChannelNames() {
    return this.channels.map((channel) => channel.name || 'unknown');
  }

  buildPayload({ tenantId, inquiry }) {
    const messageBody = String(inquiry.message || '')
      .replace(/\s+/g, ' ')
      .trim();
    const shortenedMessage =
      messageBody.length > 240 ? `${messageBody.slice(0, 237)}...` : messageBody;

    const detailPath = `/admin/inquiries/${inquiry.id}`;
    const detailUrl = this.adminBaseUrl
      ? new URL(detailPath, this.adminBaseUrl).toString()
      : null;

    const lines = [
      '[새 문의 접수]',
      `Tenant: ${tenantId}`,
      `문의 ID: #${inquiry.id}`,
      `이름: ${inquiry.name}`,
      `연락처: ${inquiry.phone}`,
      `업체명: ${inquiry.company}`,
      `문의: ${shortenedMessage}`,
      `접수시각: ${inquiry.created_at}`,
    ];

    if (detailUrl) {
      lines.push(`확인: ${detailUrl}`);
    }

    const text = lines.join('\n');
    const smsText = `[문의 #${inquiry.id}] ${inquiry.name}/${inquiry.company} ${inquiry.phone} - ${shortenedMessage}`.slice(
      0,
      320
    );

    return {
      inquiryId: inquiry.id,
      text,
      smsText,
      detailUrl,
    };
  }

  async notifyInquiryCreated({ tenantId, inquiry }) {
    if (!this.hasEnabledChannel()) return [];

    const payload = this.buildPayload({ tenantId, inquiry });
    const results = [];

    for (const channel of this.channels) {
      const channelName = channel.name || 'unknown';
      try {
        // eslint-disable-next-line no-await-in-loop
        const sendResult = await channel.send(payload);
        let detail = null;
        if (sendResult && Array.isArray(sendResult.failures) && sendResult.failures.length > 0) {
          const partialFailures = sendResult.failures
            .map((item) =>
              `chat:${item.chatId} status:${item.status}${
                item.description ? ` ${item.description}` : ''
              }`
            )
            .join(' | ');
          detail = `partial-success (${sendResult.successCount || 0} ok / ${
            sendResult.failures.length
          } failed): ${partialFailures}`;
        }

        results.push({
          channel: channelName,
          status: 'SENT',
          detail,
        });
      } catch (err) {
        results.push({
          channel: channelName,
          status: 'FAILED',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return results;
  }
}

module.exports = InquiryAlertService;
