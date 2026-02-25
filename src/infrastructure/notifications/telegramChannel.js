function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

class TelegramChannel {
  constructor({ botToken, chatIds, topicId = null }) {
    this.botToken = botToken;
    this.chatIds = chatIds;
    this.topicId = topicId;
    this.name = 'telegram';
  }

  static fromEnv(env = process.env) {
    const botToken = String(env.TELEGRAM_BOT_TOKEN || '').trim();
    const chatIds = parseList(env.TELEGRAM_CHAT_IDS || env.TELEGRAM_CHAT_ID || '');
    const topicId = String(env.TELEGRAM_TOPIC_ID || '').trim() || null;

    if (!botToken || chatIds.length === 0) return null;

    return new TelegramChannel({
      botToken,
      chatIds,
      topicId,
    });
  }

  async send(payload) {
    const failures = [];
    let successCount = 0;
    const requestUrl = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    for (const chatId of this.chatIds) {
      const body = {
        chat_id: chatId,
        text: payload.text,
        disable_web_page_preview: true,
      };
      if (this.topicId) {
        body.message_thread_id = this.topicId;
      }

      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

      // eslint-disable-next-line no-await-in-loop
      const json = await response.json().catch(() => null);
      if (!response.ok || !json || json.ok !== true) {
        const description =
          json && typeof json.description === 'string' ? json.description : '';
        failures.push({
          chatId,
          status: response.status,
          description,
        });
      } else {
        successCount += 1;
      }
    }

    if (successCount === 0 && failures.length > 0) {
      const detail = failures
        .map((item) =>
          `chat:${item.chatId} status:${item.status}${
            item.description ? ` ${item.description}` : ''
          }`
        )
        .join(', ');
      throw new Error(`Telegram send failed (${detail})`);
    }

    return {
      successCount,
      failures,
    };
  }
}

module.exports = TelegramChannel;
