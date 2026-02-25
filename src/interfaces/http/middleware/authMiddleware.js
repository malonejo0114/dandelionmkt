function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    res.redirect('/admin/login');
    return;
  }

  if (
    req.session.admin.mustChangePassword &&
    !req.path.startsWith('/settings') &&
    !req.path.startsWith('/logout')
  ) {
    res.redirect('/admin/settings');
    return;
  }

  next();
}

module.exports = {
  requireAdmin,
};
