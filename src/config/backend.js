function isSupabaseMode(env = process.env) {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}

module.exports = {
  isSupabaseMode,
};
