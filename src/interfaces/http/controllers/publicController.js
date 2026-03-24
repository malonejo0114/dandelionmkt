function trimText(value, maxLength = 160) {
  const normalized = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trim()}…`;
}

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
    this.renderBlog = this.renderBlog.bind(this);
    this.renderPortfolioDetail = this.renderPortfolioDetail.bind(this);
    this.renderServiceDetail = this.renderServiceDetail.bind(this);
    this.renderBlogDetail = this.renderBlogDetail.bind(this);
    this.renderContact = this.renderContact.bind(this);
    this.submitContact = this.submitContact.bind(this);
    this.renderRobots = this.renderRobots.bind(this);
    this.renderSitemap = this.renderSitemap.bind(this);
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

  getBaseUrl(req) {
    const explicit = String(
      process.env.PUBLIC_BASE_URL || process.env.ALERT_PUBLIC_BASE_URL || ''
    ).trim();
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }

    return `${req.protocol}://${req.get('host')}`;
  }

  buildAbsoluteUrl(req, inputPath = '/') {
    if (!inputPath) return null;
    if (/^https?:\/\//i.test(inputPath)) return inputPath;
    return new URL(inputPath, `${this.getBaseUrl(req)}/`).toString();
  }

  buildSeo(req, { title, description, path = '/', image = null, noindex = false, jsonLd = null }) {
    return {
      metaTitle: title,
      metaDescription: trimText(description || ''),
      canonicalUrl: this.buildAbsoluteUrl(req, path),
      metaImage: image ? this.buildAbsoluteUrl(req, image) : null,
      metaRobots: noindex ? 'noindex, nofollow' : 'index, follow',
      jsonLd,
    };
  }

  buildContentSeo(req, type, item) {
    const typeLabelMap = {
      portfolio: 'Portfolio',
      service: 'Service',
      blog: 'Blog',
    };
    const detailPath = `/${type}/${item.slug}`;
    const defaultDescription =
      item.summary || trimText(item.body || '', type === 'blog' ? 155 : 140) || item.title;
    const description = trimText(
      item.meta_description || defaultDescription,
      type === 'blog' ? 155 : 140
    );
    const image = item.og_image_path || item.thumbnail_path || null;
    const seoTitle =
      trimText(item.meta_title || '', 160) ||
      `${item.title} | ${typeLabelMap[type] || 'Content'} | 민들레효과`;

    let jsonLd = null;
    if (type === 'blog') {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: item.title,
        description,
        datePublished: item.published_at || item.created_at,
        dateModified: item.updated_at || item.created_at,
        image: image ? [this.buildAbsoluteUrl(req, image)] : undefined,
        mainEntityOfPage: this.buildAbsoluteUrl(req, detailPath),
        author: {
          '@type': 'Organization',
          name: '주식회사 민들레효과',
        },
        publisher: {
          '@type': 'Organization',
          name: '주식회사 민들레효과',
        },
      };
    }

    return this.buildSeo(req, {
      title: seoTitle,
      description,
      path: detailPath,
      image,
      jsonLd,
    });
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
        ...this.buildSeo(req, {
          title: '주식회사 민들레효과 | 광고비가 남는 운영',
          description:
            '보여주기식 마케팅이 아니라 예약, 문의, 매출이 남는 구조를 설계하는 운영 파트너 민들레효과입니다.',
          path: '/',
        }),
      });
      delete req.session.formError;
    } catch (err) {
      next(err);
    }
  }

  renderAbout(req, res) {
    res.render('public/about', {
      pageTitle: 'About | 민들레효과',
      ...this.buildSeo(req, {
        title: 'About | 민들레효과',
        description:
          '민들레효과는 광고만 집행하는 회사가 아니라 광고비가 남는 구조를 만드는 팀입니다.',
        path: '/about',
      }),
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
        ...this.buildSeo(req, {
          title: 'Portfolio | 민들레효과',
          description: '성과 중심 포트폴리오 사례를 확인하세요.',
          path: '/portfolio',
        }),
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
        ...this.buildSeo(req, {
          title: 'Service | 민들레효과',
          description: '운영 서비스 구성과 제공 범위를 확인하세요.',
          path: '/service',
        }),
      });
    } catch (err) {
      next(err);
    }
  }

  async renderBlog(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const items = await this.contentService.listPublished(tenantId, 'blog');
      res.render('public/content-list', {
        pageTitle: 'Blog | 민들레효과',
        listTitle: 'Blog',
        type: 'blog',
        items,
        ...this.buildSeo(req, {
          title: 'Blog | 민들레효과',
          description:
            '광고 운영, 전환 구조, 문의 설계, 매출 구조에 대한 인사이트를 민들레효과 블로그에서 발행합니다.',
          path: '/blog',
        }),
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
        res.status(404).render('public/not-found', {
          pageTitle: 'Not Found | 민들레효과',
          ...this.buildSeo(req, {
            title: 'Not Found | 민들레효과',
            description: '요청한 페이지를 찾을 수 없습니다.',
            path: req.originalUrl,
            noindex: true,
          }),
        });
        return;
      }
      res.render('public/content-detail', {
        pageTitle: `${item.title} | Portfolio`,
        type: 'portfolio',
        item,
        ...this.buildContentSeo(req, 'portfolio', item),
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
        res.status(404).render('public/not-found', {
          pageTitle: 'Not Found | 민들레효과',
          ...this.buildSeo(req, {
            title: 'Not Found | 민들레효과',
            description: '요청한 페이지를 찾을 수 없습니다.',
            path: req.originalUrl,
            noindex: true,
          }),
        });
        return;
      }
      res.render('public/content-detail', {
        pageTitle: `${item.title} | Service`,
        type: 'service',
        item,
        ...this.buildContentSeo(req, 'service', item),
      });
    } catch (err) {
      next(err);
    }
  }

  async renderBlogDetail(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const item = await this.contentService.getBySlug(tenantId, 'blog', req.params.slug);
      if (!item || item.status !== 'published') {
        res.status(404).render('public/not-found', {
          pageTitle: 'Not Found | 민들레효과',
          ...this.buildSeo(req, {
            title: 'Not Found | 민들레효과',
            description: '요청한 페이지를 찾을 수 없습니다.',
            path: req.originalUrl,
            noindex: true,
          }),
        });
        return;
      }
      res.render('public/content-detail', {
        pageTitle: `${item.title} | Blog`,
        type: 'blog',
        item,
        ...this.buildContentSeo(req, 'blog', item),
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
        ...this.buildSeo(req, {
          title: 'Contact | 민들레효과',
          description: '이름, 전화번호, 업체명, 문의사항을 남겨주시면 운영 관점으로 빠르게 답변드립니다.',
          path: '/contact',
        }),
      });
      delete req.session.formError;
    } catch (err) {
      next(err);
    }
  }

  async renderRobots(req, res, next) {
    try {
      const baseUrl = this.getBaseUrl(req);
      res.type('text/plain').send(`User-agent: *\nAllow: /\n\nSitemap: ${baseUrl}/sitemap.xml\n`);
    } catch (err) {
      next(err);
    }
  }

  async renderSitemap(req, res, next) {
    try {
      const tenantId = this.getTenantId(req);
      const [portfolioItems, serviceItems, blogItems] = await Promise.all([
        this.contentService.listPublished(tenantId, 'portfolio'),
        this.contentService.listPublished(tenantId, 'service'),
        this.contentService.listPublished(tenantId, 'blog'),
      ]);

      const urls = [
        { loc: this.buildAbsoluteUrl(req, '/'), lastmod: null },
        { loc: this.buildAbsoluteUrl(req, '/about'), lastmod: null },
        { loc: this.buildAbsoluteUrl(req, '/portfolio'), lastmod: null },
        { loc: this.buildAbsoluteUrl(req, '/service'), lastmod: null },
        { loc: this.buildAbsoluteUrl(req, '/blog'), lastmod: null },
        { loc: this.buildAbsoluteUrl(req, '/contact'), lastmod: null },
        ...portfolioItems.map((item) => ({
          loc: this.buildAbsoluteUrl(req, `/portfolio/${item.slug}`),
          lastmod: item.updated_at || item.published_at || item.created_at || null,
        })),
        ...serviceItems.map((item) => ({
          loc: this.buildAbsoluteUrl(req, `/service/${item.slug}`),
          lastmod: item.updated_at || item.published_at || item.created_at || null,
        })),
        ...blogItems.map((item) => ({
          loc: this.buildAbsoluteUrl(req, `/blog/${item.slug}`),
          lastmod: item.updated_at || item.published_at || item.created_at || null,
        })),
      ];

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map((entry) => [
          '  <url>',
          `    <loc>${entry.loc}</loc>`,
          entry.lastmod ? `    <lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : null,
          '  </url>',
        ].filter(Boolean).join('\n')),
        '</urlset>',
      ].join('\n');

      res.type('application/xml').send(xml);
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
