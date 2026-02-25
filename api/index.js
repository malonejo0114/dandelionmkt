const getAppBundle = require('../src/server');

module.exports = async (req, res) => {
  try {
    const { app } = await getAppBundle();
    return app(req, res);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Bootstrap failed:', err);
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(
      [
        'Server bootstrap failed.',
        `Reason: ${err instanceof Error ? err.message : String(err)}`,
        'Check Vercel env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET.',
        'And run supabase/schema.sql in Supabase SQL Editor.',
      ].join('\n')
    );
  }
};
