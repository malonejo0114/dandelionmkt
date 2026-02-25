const { createClient } = require('@supabase/supabase-js');

let supabaseAdminClient = null;

function assertEnv(env = process.env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase mode.');
  }
  if (serviceRoleKey.startsWith('sb_publishable_')) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY must be a secret key (sb_secret_... or legacy service_role), not sb_publishable_.'
    );
  }

  return { url, serviceRoleKey };
}

function getSupabaseAdminClient(env = process.env) {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const { url, serviceRoleKey } = assertEnv(env);
  supabaseAdminClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return supabaseAdminClient;
}

module.exports = {
  getSupabaseAdminClient,
};
