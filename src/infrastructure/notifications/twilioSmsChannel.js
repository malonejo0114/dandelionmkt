function parseList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

class TwilioSmsChannel {
  constructor({ accountSid, authToken, fromNumber, toNumbers }) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    this.fromNumber = fromNumber;
    this.toNumbers = toNumbers;
    this.name = 'twilio-sms';
  }

  static fromEnv(env = process.env) {
    const accountSid = String(env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = String(env.TWILIO_AUTH_TOKEN || '').trim();
    const fromNumber = String(env.TWILIO_FROM_NUMBER || '').trim();
    const toNumbers = parseList(env.ALERT_SMS_TO || '');

    if (!accountSid || !authToken || !fromNumber || toNumbers.length === 0) {
      return null;
    }

    return new TwilioSmsChannel({
      accountSid,
      authToken,
      fromNumber,
      toNumbers,
    });
  }

  async send(payload) {
    const errors = [];
    const authHeader = `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      'base64'
    )}`;
    const requestUrl = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;

    for (const toNumber of this.toNumbers) {
      const form = new URLSearchParams({
        From: this.fromNumber,
        To: toNumber,
        Body: payload.smsText || payload.text,
      });

      // eslint-disable-next-line no-await-in-loop
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          authorization: authHeader,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: form,
      });

      if (!response.ok) {
        // eslint-disable-next-line no-await-in-loop
        const text = await response.text().catch(() => '');
        errors.push(`to:${toNumber} status:${response.status} ${text.slice(0, 120)}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Twilio SMS send failed (${errors.join(', ')})`);
    }
  }
}

module.exports = TwilioSmsChannel;
