module.exports = async (req, res) => {
  try {
    const getAppBundle = require('../src/server');
    const { app } = await getAppBundle();
    return app(req, res);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failed:', err);
    const payload = [
      'Server bootstrap failed.',
      `Reason: ${err instanceof Error ? err.message : String(err)}`,
      'Check Vercel env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET.',
      'And run supabase/schema.sql in Supabase SQL Editor.',
    ].join('\n');

    if (typeof res.status === 'function' && typeof res.send === 'function') {
      res.status(500).type('text/plain').send(payload);
      return;
    }

    res.statusCode = 500;
    if (typeof res.setHeader === 'function') {
      res.setHeader('content-type', 'text/plain; charset=utf-8');
    }
    if (typeof res.end === 'function') {
      res.end(payload);
      return;
    }

    throw err;
  }
};
