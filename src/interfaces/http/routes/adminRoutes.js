const express = require('express');
const { rateLimit } = require('express-rate-limit');
const upload = require('../middleware/upload');
const { requireAdmin } = require('../middleware/authMiddleware');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.',
});

function buildAdminRoutes(adminController) {
  const router = express.Router();

  router.get('/login', adminController.renderLogin);
  router.post('/login', loginLimiter, adminController.login);
  router.post('/logout', adminController.logout);

  router.use(requireAdmin);

  router.get('/', adminController.dashboard);

  router.get('/contents', adminController.listContents);
  router.get('/contents/new', adminController.newContentForm);
  router.post(
    '/contents',
    upload.fields([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'attachments', maxCount: 20 },
    ]),
    adminController.createContent
  );

  router.get('/contents/:id/edit', adminController.editContentForm);
  router.post(
    '/contents/:id/update',
    upload.fields([
      { name: 'thumbnail', maxCount: 1 },
      { name: 'attachments', maxCount: 20 },
    ]),
    adminController.updateContent
  );
  router.post('/contents/:id/delete', adminController.deleteContent);
  router.post('/contents/:id/media/:mediaId/delete', adminController.deleteMedia);

  router.get('/inquiries', adminController.listInquiries);
  router.get('/inquiries/logs', adminController.viewInquiryLogs);
  router.get('/inquiries/:id', adminController.viewInquiry);
  router.post('/inquiries/:id/status', adminController.updateInquiryStatus);
  router.post('/inquiries/purge', adminController.purgeInquiries);

  router.get('/settings', adminController.renderSettings);
  router.post('/settings/password', adminController.changePassword);
  router.post('/settings/2fa/enable', adminController.enableTwoFactor);
  router.post('/settings/2fa/disable', adminController.disableTwoFactor);
  router.post('/settings/tenant', adminController.updateTenantSettings);
  router.post('/settings/tenant/create', adminController.createTenant);

  return router;
}

module.exports = buildAdminRoutes;
