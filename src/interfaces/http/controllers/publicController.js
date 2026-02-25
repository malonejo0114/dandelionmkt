class PublicController {
  constructor({ defaultTenantId, contentService, inquiryService, tenantService }) {
    this.defaultTenantId = defaultTenantId;
    this.contentService = contentService;
    this.inquiryService = inquiryService;
    this.tenantService = tenantService;

    this.renderHome = this.renderHome.bind(this);
    this.renderAbout = this.renderAbout.bind(this);
    this.renderPortfolio = this.renderPortfolio.bind(this);
    this.renderService = this.renderService.bind(this);
    this.renderPortfolioDetail = this.renderPortfolioDetail.bind(this);
    this.renderServiceDetail = this.renderServiceDetail.bind(this);
    this.renderContact = this.renderContact.bind(this);
    this.submitContact = this.submitContact.bind(this);
  }

  getTenantId(_req) {
    return this.defaultTenantId;
  }

  resolveRedirectPath(candidate, fallback = '/contact') {
    if (typeof candidate !== 'string') return fallback;
    const redirectPath = candidate.trim();
    if (!redirectPath.startsWith('/') || redirectPath.startsWith('//')) return fallback;
    return redirectPath;
  }

  async renderHome(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const portfolioItems = await this.contentService.listPublished(tenantId, 'portfolio');
      const serviceItems = await this.contentService.listPublished(tenantId, 'service');
      const settings = await this.tenantService.getSettings(tenantId);

      res.render('public/home', {
        pageTitle: '주식회사 민들레효과',
        portfolioItems: portfolioItems.slice(0, 12),
        serviceItems: serviceItems.slice(0, 12),
        formError: req.session.formError || null,
        inquiryRetentionDays: settings?.inquiry_retention_days || 365,
        privacyPolicyText: settings?.privacy_policy_text || '',
      });
      delete req.session.formError;
    } catch (err) {
      next(err);
    }
  }

  renderAbout(_req, res) {
    res.render('public/about', {
      pageTitle: 'About | 민들레효과',
    });
  }

  async renderPortfolio(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const items = await this.contentService.listPublished(tenantId, 'portfolio');
      res.render('public/content-list', {
        pageTitle: 'Portfolio | 민들레효과',
        listTitle: 'Portfolio',
        type: 'portfolio',
        items,
      });
    } catch (err) {
      next(err);
    }
  }

  async renderService(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const items = await this.contentService.listPublished(tenantId, 'service');
      res.render('public/content-list', {
        pageTitle: 'Service | 민들레효과',
        listTitle: 'Service',
        type: 'service',
        items,
      });
    } catch (err) {
      next(err);
    }
  }

  async renderPortfolioDetail(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const item = await this.contentService.getBySlug(tenantId, 'portfolio', req.params.slug);
      if (!item || item.status !== 'published') {
        res.status(404).render('public/not-found', { pageTitle: 'Not Found | 민들레효과' });
        return;
      }
      res.render('public/content-detail', {
        pageTitle: `${item.title} | Portfolio`,
        type: 'portfolio',
        item,
      });
    } catch (err) {
      next(err);
    }
  }

  async renderServiceDetail(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const item = await this.contentService.getBySlug(tenantId, 'service', req.params.slug);
      if (!item || item.status !== 'published') {
        res.status(404).render('public/not-found', { pageTitle: 'Not Found | 민들레효과' });
        return;
      }
      res.render('public/content-detail', {
        pageTitle: `${item.title} | Service`,
        type: 'service',
        item,
      });
    } catch (err) {
      next(err);
    }
  }

  async renderContact(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const settings = await this.tenantService.getSettings(tenantId);

      res.render('public/contact', {
        pageTitle: 'Contact | 민들레효과',
        formError: req.session.formError || null,
        inquiryRetentionDays: settings?.inquiry_retention_days || 365,
        privacyPolicyText: settings?.privacy_policy_text || '',
      });
      delete req.session.formError;
    } catch (err) {
      next(err);
    }
  }

  async submitContact(req, res) {
    const tenantId = this.getTenantId(req);
    const redirectPath = this.resolveRedirectPath(req.body.redirectTo, '/contact');
    try {
      await this.inquiryService.create(tenantId, req.body, {
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      req.session.notice = '문의가 접수되었습니다. 빠르게 연락드리겠습니다.';
      res.redirect(redirectPath);
    } catch (err) {
      req.session.formError = err.message;
      res.redirect(redirectPath);
    }
  }
}

module.exports = PublicController;
