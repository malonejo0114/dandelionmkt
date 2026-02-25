const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

class AdminController {
  constructor({
    defaultTenantId,
    contentService,
    inquiryService,
    authService,
    tenantService,
    adminRepository,
  }) {
    this.defaultTenantId = defaultTenantId;
    this.contentService = contentService;
    this.inquiryService = inquiryService;
    this.authService = authService;
    this.tenantService = tenantService;
    this.adminRepository = adminRepository;

    this.renderLogin = this.renderLogin.bind(this);
    this.login = this.login.bind(this);
    this.logout = this.logout.bind(this);
    this.dashboard = this.dashboard.bind(this);
    this.listContents = this.listContents.bind(this);
    this.newContentForm = this.newContentForm.bind(this);
    this.createContent = this.createContent.bind(this);
    this.editContentForm = this.editContentForm.bind(this);
    this.updateContent = this.updateContent.bind(this);
    this.deleteContent = this.deleteContent.bind(this);
    this.deleteMedia = this.deleteMedia.bind(this);
    this.listInquiries = this.listInquiries.bind(this);
    this.viewInquiry = this.viewInquiry.bind(this);
    this.updateInquiryStatus = this.updateInquiryStatus.bind(this);
    this.purgeInquiries = this.purgeInquiries.bind(this);
    this.viewInquiryLogs = this.viewInquiryLogs.bind(this);
    this.renderSettings = this.renderSettings.bind(this);
    this.changePassword = this.changePassword.bind(this);
    this.enableTwoFactor = this.enableTwoFactor.bind(this);
    this.disableTwoFactor = this.disableTwoFactor.bind(this);
    this.updateTenantSettings = this.updateTenantSettings.bind(this);
    this.createTenant = this.createTenant.bind(this);
  }

  getTenantId(req) {
    return req.session.admin?.tenantId || this.defaultTenantId;
  }

  getAdminId(req) {
    return req.session.admin?.id || null;
  }

  renderLogin(req, res) {
    if (req.session.admin) {
      res.redirect('/admin');
      return;
    }

    res.render('admin/login', {
      pageTitle: 'Admin Login',
      error: req.session.loginError || null,
      tenantSlug: req.session.lastTenantSlug || 'dandelion-effect',
      username: req.session.lastUsername || '',
      requiresOtp: req.session.requiresOtp || false,
    });

    delete req.session.loginError;
    delete req.session.requiresOtp;
  }

  async login(req, res) {
    const tenantSlug = String(req.body.tenantSlug || '').trim();
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const otpCode = String(req.body.otpCode || '').trim();

    req.session.lastTenantSlug = tenantSlug;
    req.session.lastUsername = username;

    const result = await this.authService.login({
      tenantSlug,
      username,
      password,
      otpCode,
    });

    if (!result.ok) {
      req.session.loginError = result.error;
      req.session.requiresOtp = Boolean(result.requiresOtp);
      res.redirect('/admin/login');
      return;
    }

    req.session.admin = result.admin;
    req.session.notice = `${result.admin.displayName}님, 로그인되었습니다.`;

    delete req.session.lastTenantSlug;
    delete req.session.lastUsername;

    if (result.admin.mustChangePassword) {
      res.redirect('/admin/settings');
      return;
    }

    res.redirect('/admin');
  }

  logout(req, res) {
    if (req.session && typeof req.session.destroy === 'function') {
      req.session.destroy(() => {
        res.redirect('/admin/login');
      });
      return;
    }

    req.session = null;
    res.redirect('/admin/login');
  }

  async dashboard(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const portfolioItems = await this.contentService.listAdmin(tenantId, 'portfolio');
      const serviceItems = await this.contentService.listAdmin(tenantId, 'service');
      const inquiries = await this.inquiryService.listAll(tenantId);

      res.render('admin/dashboard', {
        pageTitle: 'Admin Dashboard',
        stats: {
          portfolioCount: portfolioItems.length,
          serviceCount: serviceItems.length,
          inquiryCount: inquiries.length,
          newInquiryCount: inquiries.filter((item) => item.status === 'NEW').length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async listContents(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const type = req.query.type === 'service' ? 'service' : 'portfolio';
      const items = await this.contentService.listAdmin(tenantId, type);

      res.render('admin/content-list', {
        pageTitle: `Manage ${type}`,
        type,
        items,
      });
    } catch (err) {
      next(err);
    }
  }

  async newContentForm(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const type = req.query.type === 'service' ? 'service' : 'portfolio';
      const availableAssets = await this.contentService.listMediaLibrary(tenantId);

      res.render('admin/content-form', {
        pageTitle: `New ${type}`,
        type,
        mode: 'create',
        item: {
          id: null,
          title: '',
          summary: '',
          body: '',
          status: 'draft',
          thumbnail_path: '',
          mediaAssets: [],
          blocks: [],
          blocksJson: '[]',
        },
        availableAssets,
        error: req.session.contentError || null,
      });
      delete req.session.contentError;
    } catch (err) {
      next(err);
    }
  }

  async createContent(req, res) {
    const tenantId = this.getTenantId(req);

    try {
      const type = req.body.type === 'service' ? 'service' : 'portfolio';
      await this.contentService.create(
        tenantId,
        {
          type,
          title: req.body.title,
          summary: req.body.summary,
          body: req.body.body,
          blocksJson: req.body.blocks_json,
          status: req.body.status,
        },
        req.files
      );
      req.session.notice = '콘텐츠가 생성되었습니다.';
      res.redirect(`/admin/contents?type=${type}`);
    } catch (err) {
      req.session.contentError = err.message;
      res.redirect(`/admin/contents/new?type=${req.body.type}`);
    }
  }

  async editContentForm(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const item = await this.contentService.getById(tenantId, Number(req.params.id));
      if (!item) {
        req.session.notice = '대상을 찾을 수 없습니다.';
        res.redirect('/admin');
        return;
      }

      const availableAssets = await this.contentService.listMediaLibrary(tenantId);

      res.render('admin/content-form', {
        pageTitle: `Edit ${item.type}`,
        type: item.type,
        mode: 'edit',
        item: {
          ...item,
          blocksJson: JSON.stringify(
            (item.blocks || []).map((block) => ({
              blockType: block.block_type,
              contentText: block.content_text || '',
              mediaAssetId: block.media_asset_id || '',
              mediaUrl: block.media_url || '',
            }))
          ),
        },
        availableAssets,
        error: req.session.contentError || null,
      });
      delete req.session.contentError;
    } catch (err) {
      next(err);
    }
  }

  async updateContent(req, res) {
    const tenantId = this.getTenantId(req);

    try {
      const id = Number(req.params.id);
      const existing = await this.contentService.getById(tenantId, id);
      if (!existing) {
        req.session.notice = '대상을 찾을 수 없습니다.';
        res.redirect('/admin');
        return;
      }

      await this.contentService.update(
        tenantId,
        id,
        {
          title: req.body.title,
          summary: req.body.summary,
          body: req.body.body,
          blocksJson: req.body.blocks_json,
          status: req.body.status,
        },
        req.files
      );

      req.session.notice = '콘텐츠가 수정되었습니다.';
      res.redirect(`/admin/contents?type=${existing.type}`);
    } catch (err) {
      req.session.contentError = err.message;
      res.redirect(`/admin/contents/${req.params.id}/edit`);
    }
  }

  async deleteContent(req, res) {
    const tenantId = this.getTenantId(req);
    const id = Number(req.params.id);
    const existing = await this.contentService.getById(tenantId, id);
    if (!existing) {
      req.session.notice = '대상을 찾을 수 없습니다.';
      res.redirect('/admin');
      return;
    }

    await this.contentService.delete(tenantId, id);
    req.session.notice = '콘텐츠가 삭제되었습니다.';
    res.redirect(`/admin/contents?type=${existing.type}`);
  }

  async deleteMedia(req, res) {
    const tenantId = this.getTenantId(req);
    const contentId = Number(req.params.id);
    const mediaId = Number(req.params.mediaId);

    await this.contentService.removeMedia(tenantId, contentId, mediaId);
    req.session.notice = '첨부 파일이 제거되었습니다.';
    res.redirect(`/admin/contents/${contentId}/edit`);
  }

  async listInquiries(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const items = await this.inquiryService.listAll(tenantId);
      res.render('admin/inquiries', {
        pageTitle: 'Inquiries',
        items,
      });
    } catch (err) {
      next(err);
    }
  }

  async viewInquiry(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const inquiryId = Number(req.params.id);
      const item = await this.inquiryService.getById(tenantId, inquiryId);
      if (!item) {
        req.session.notice = '문의를 찾을 수 없습니다.';
        res.redirect('/admin/inquiries');
        return;
      }

      const logs = (await this.inquiryService.listLogs(tenantId, 200)).filter(
        (row) => Number(row.inquiry_id) === inquiryId
      );

      res.render('admin/inquiry-detail', {
        pageTitle: `Inquiry #${item.id}`,
        item,
        logs,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateInquiryStatus(req, res) {
    const tenantId = this.getTenantId(req);
    const id = Number(req.params.id);

    await this.inquiryService.updateStatus(tenantId, id, req.body.status, {
      actorType: 'admin',
      actorId: this.getAdminId(req),
    });

    req.session.notice = '문의 상태가 업데이트되었습니다.';
    res.redirect(`/admin/inquiries/${id}`);
  }

  async purgeInquiries(req, res) {
    const tenantId = this.getTenantId(req);
    const purgedCount = await this.inquiryService.purgeExpired(tenantId, {
      actorType: 'admin',
      actorId: this.getAdminId(req),
    });

    req.session.notice = `보관기간 만료 문의 ${purgedCount}건을 파기했습니다.`;
    res.redirect('/admin/inquiries');
  }

  async viewInquiryLogs(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const logs = await this.inquiryService.listLogs(tenantId, 400);
      res.render('admin/inquiry-logs', {
        pageTitle: 'Inquiry Logs',
        logs,
      });
    } catch (err) {
      next(err);
    }
  }

  async renderSettings(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const adminId = this.getAdminId(req);

      const admin = await this.adminRepository.findById(tenantId, adminId);
      const tenant = await this.tenantService.findById(tenantId);
      const settings = await this.tenantService.getSettings(tenantId);
      const tenants = await this.tenantService.listAll();

      let twoFaQrDataUrl = null;
      let twoFaSecret = req.session.pendingTwoFaSecret || null;

      if (!admin.twofa_enabled) {
        if (!twoFaSecret) {
          const setup = await this.authService.prepareTwoFactorSetup({
            tenantId,
            adminId,
            appName: `Dandelion-${tenant.slug}`,
          });
          twoFaSecret = setup.secret;
          req.session.pendingTwoFaSecret = twoFaSecret;
          req.session.pendingTwoFaOtpauth = setup.otpauth;
        }

        if (req.session.pendingTwoFaOtpauth) {
          twoFaQrDataUrl = await QRCode.toDataURL(req.session.pendingTwoFaOtpauth);
        }
      }

      res.render('admin/settings', {
        pageTitle: 'Admin Settings',
        admin,
        tenant,
        settings,
        tenants,
        twoFaSecret,
        twoFaQrDataUrl,
        error: req.session.settingsError || null,
      });

      delete req.session.settingsError;
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req, res) {
    const tenantId = this.getTenantId(req);
    const adminId = this.getAdminId(req);

    try {
      await this.authService.changePassword({
        tenantId,
        adminId,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
      });
      await this.inquiryService.logEvent(
        tenantId,
        'ADMIN_PASSWORD_CHANGE',
        '관리자 비밀번호 변경',
        { actorType: 'admin', actorId: adminId ? String(adminId) : null }
      );
      req.session.notice = '비밀번호가 변경되었습니다.';
    } catch (err) {
      req.session.settingsError = err.message;
    }

    res.redirect('/admin/settings');
  }

  async enableTwoFactor(req, res) {
    const tenantId = this.getTenantId(req);
    const adminId = this.getAdminId(req);

    try {
      const secret = req.session.pendingTwoFaSecret;
      if (!secret) {
        throw new Error('2FA 설정 세션이 만료되었습니다. 다시 시도해주세요.');
      }

      await this.authService.enableTwoFactor({
        tenantId,
        adminId,
        secret,
        otpCode: req.body.otpCode,
      });

      delete req.session.pendingTwoFaSecret;
      delete req.session.pendingTwoFaOtpauth;

      if (req.session.admin) {
        req.session.admin.twofaEnabled = true;
      }

      await this.inquiryService.logEvent(
        tenantId,
        'ADMIN_2FA_ENABLE',
        '관리자 2FA 활성화',
        { actorType: 'admin', actorId: adminId ? String(adminId) : null }
      );

      req.session.notice = '2단계 인증이 활성화되었습니다.';
    } catch (err) {
      req.session.settingsError = err.message;
    }

    res.redirect('/admin/settings');
  }

  async disableTwoFactor(req, res) {
    const tenantId = this.getTenantId(req);
    const adminId = this.getAdminId(req);

    await this.authService.disableTwoFactor({ tenantId, adminId });
    if (req.session.admin) {
      req.session.admin.twofaEnabled = false;
    }

    await this.inquiryService.logEvent(
      tenantId,
      'ADMIN_2FA_DISABLE',
      '관리자 2FA 비활성화',
      { actorType: 'admin', actorId: adminId ? String(adminId) : null }
    );

    req.session.notice = '2단계 인증이 비활성화되었습니다.';
    res.redirect('/admin/settings');
  }

  async updateTenantSettings(req, res) {
    const tenantId = this.getTenantId(req);

    try {
      const result = await this.tenantService.updateCurrentTenant(tenantId, {
        name: req.body.name,
        slug: req.body.slug,
        inquiryRetentionDays: req.body.inquiryRetentionDays,
        privacyPolicyText: req.body.privacyPolicyText,
      });

      if (req.session.admin) {
        req.session.admin.tenantSlug = result.tenant.slug;
        req.session.admin.tenantName = result.tenant.name;
      }

      await this.inquiryService.logEvent(
        tenantId,
        'TENANT_POLICY_UPDATE',
        `보관기간=${result.settings.inquiry_retention_days}일 / slug=${result.tenant.slug}`,
        {
          actorType: 'admin',
          actorId: this.getAdminId(req) ? String(this.getAdminId(req)) : null,
        }
      );

      req.session.notice = '테넌트 설정이 업데이트되었습니다.';
    } catch (err) {
      req.session.settingsError = err.message;
    }

    res.redirect('/admin/settings');
  }

  async createTenant(req, res) {
    const tenantId = this.getTenantId(req);
    const adminId = this.getAdminId(req);

    try {
      const policyErr = this.authService.validatePasswordPolicy(req.body.adminPassword);
      if (policyErr) {
        throw new Error(`신규 관리자 비밀번호 정책 오류: ${policyErr}`);
      }

      const { tenant } = await this.tenantService.createTenant({
        name: req.body.newTenantName,
        slug: req.body.newTenantSlug,
        inquiryRetentionDays: req.body.newTenantRetentionDays,
        privacyPolicyText: req.body.newTenantPrivacyPolicyText,
      });

      const passwordHash = await bcrypt.hash(req.body.adminPassword, 12);
      await this.adminRepository.createAdmin({
        tenantId: tenant.id,
        username: req.body.adminUsername,
        passwordHash,
        displayName: req.body.adminDisplayName || 'Tenant Admin',
      });

      await this.inquiryService.logEvent(
        tenantId,
        'TENANT_CREATE',
        `새 tenant 생성: ${tenant.slug}`,
        { actorType: 'admin', actorId: String(adminId) }
      );

      req.session.notice = `새 tenant(${tenant.slug})가 생성되었습니다.`;
    } catch (err) {
      req.session.settingsError = err.message;
    }

    res.redirect('/admin/settings');
  }
}

module.exports = AdminController;
