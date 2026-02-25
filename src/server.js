const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const envFilePath = path.join(projectRoot, '.env');
if (fs.existsSync(envFilePath)) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envFilePath);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[env] failed to load .env: ${err.message}`);
  }
}

const express = require('express');
const cookieSession = require('cookie-session');
const methodOverride = require('method-override');
const csurf = require('csurf');

const { isSupabaseMode } = require('./config/backend');
const ContentService = require('./application/content/contentService');
const InquiryService = require('./application/inquiry/inquiryService');
const InquiryAlertService = require('./application/notification/inquiryAlertService');
const AuthService = require('./application/auth/authService');
const TenantService = require('./application/tenant/tenantService');
const TelegramChannel = require('./infrastructure/notifications/telegramChannel');
const TwilioSmsChannel = require('./infrastructure/notifications/twilioSmsChannel');

const PublicController = require('./interfaces/http/controllers/publicController');
const AdminController = require('./interfaces/http/controllers/adminController');
const buildPublicRoutes = require('./interfaces/http/routes/publicRoutes');
const buildAdminRoutes = require('./interfaces/http/routes/adminRoutes');

const PORT = Number(process.env.PORT || 8787);
let appBundlePromise = null;

async function createInfrastructure() {
  if (isSupabaseMode(process.env)) {
    const { initSupabase } = require('./config/supabaseBootstrap');

    const SupabaseContentRepository = require('./infrastructure/repositories/supabaseContentRepository');
    const SupabaseMediaRepository = require('./infrastructure/repositories/supabaseMediaRepository');
    const SupabaseInquiryRepository = require('./infrastructure/repositories/supabaseInquiryRepository');
    const SupabaseAdminRepository = require('./infrastructure/repositories/supabaseAdminRepository');
    const SupabaseTenantRepository = require('./infrastructure/repositories/supabaseTenantRepository');
    const SupabaseStorageService = require('./infrastructure/storage/supabaseStorageService');

    const { tenantId } = await initSupabase();

    return {
      backend: 'supabase',
      tenantId,
      dbPath: null,
      contentRepository: new SupabaseContentRepository(),
      mediaRepository: new SupabaseMediaRepository(),
      inquiryRepository: new SupabaseInquiryRepository(),
      adminRepository: new SupabaseAdminRepository(),
      tenantRepository: new SupabaseTenantRepository(),
      storageService: new SupabaseStorageService({
        bucket: String(process.env.SUPABASE_STORAGE_BUCKET || 'media').trim() || 'media',
      }),
    };
  }

  const { initSchema, dbPath } = require('./config/database');
  const SqliteContentRepository = require('./infrastructure/repositories/sqliteContentRepository');
  const SqliteMediaRepository = require('./infrastructure/repositories/sqliteMediaRepository');
  const SqliteInquiryRepository = require('./infrastructure/repositories/sqliteInquiryRepository');
  const SqliteAdminRepository = require('./infrastructure/repositories/sqliteAdminRepository');
  const SqliteTenantRepository = require('./infrastructure/repositories/sqliteTenantRepository');

  const { tenantId } = await initSchema();

  return {
    backend: 'sqlite',
    tenantId,
    dbPath,
    contentRepository: new SqliteContentRepository(),
    mediaRepository: new SqliteMediaRepository(),
    inquiryRepository: new SqliteInquiryRepository(),
    adminRepository: new SqliteAdminRepository(),
    tenantRepository: new SqliteTenantRepository(),
    storageService: null,
  };
}

async function createApp() {
  const infra = await createInfrastructure();

  const tenantService = new TenantService(infra.tenantRepository);
  const contentService = new ContentService(
    infra.contentRepository,
    infra.mediaRepository,
    infra.storageService
  );

  const alertChannels = [];
  const telegramChannel = TelegramChannel.fromEnv(process.env);
  if (telegramChannel) {
    alertChannels.push(telegramChannel);
  }
  const twilioSmsChannel = TwilioSmsChannel.fromEnv(process.env);
  if (twilioSmsChannel) {
    alertChannels.push(twilioSmsChannel);
  }

  const inquiryAlertService = new InquiryAlertService({
    channels: alertChannels,
    adminBaseUrl: process.env.ALERT_PUBLIC_BASE_URL || `http://127.0.0.1:${PORT}`,
  });

  const inquiryService = new InquiryService(
    infra.inquiryRepository,
    tenantService,
    inquiryAlertService
  );
  const authService = new AuthService(infra.adminRepository, tenantService);

  const publicController = new PublicController({
    defaultTenantId: infra.tenantId,
    contentService,
    inquiryService,
    tenantService,
  });

  const adminController = new AdminController({
    defaultTenantId: infra.tenantId,
    contentService,
    inquiryService,
    authService,
    tenantService,
    adminRepository: infra.adminRepository,
  });

  const app = express();
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(projectRoot, 'views'));

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(methodOverride('_method'));

  const secureCookies =
    String(process.env.SESSION_SECURE || '').toLowerCase() === 'true' ||
    process.env.NODE_ENV === 'production';

  app.use(
    cookieSession({
      name: 'dandelion_session',
      keys: [process.env.SESSION_SECRET || 'dandelion-effect-secret'],
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      httpOnly: true,
      secure: secureCookies,
    })
  );

  app.use(csurf());

  app.use((req, res, next) => {
    if (!req.session) {
      req.session = {};
    }

    res.locals.currentAdmin = req.session.admin || null;
    res.locals.currentPath = req.path;
    res.locals.notice = req.session.notice || null;
    res.locals.csrfToken = req.csrfToken();
    delete req.session.notice;
    next();
  });

  app.use('/styles', express.static(path.join(projectRoot, 'public/styles')));
  app.use('/scripts', express.static(path.join(projectRoot, 'public/scripts')));
  app.use('/assets', express.static(path.join(projectRoot, 'assets')));
  app.use('/uploads', express.static(path.join(projectRoot, 'uploads')));

  app.use('/', buildPublicRoutes(publicController));
  app.use('/admin', buildAdminRoutes(adminController));

  app.get('/index.html', (_req, res) => {
    res.redirect('/');
  });

  app.use((_req, res) => {
    res.status(404).render('public/not-found', {
      pageTitle: 'Not Found | 민들레효과',
    });
  });

  app.use((err, req, res, _next) => {
    if (err.code === 'EBADCSRFTOKEN') {
      if (req.method === 'POST' && req.path === '/contact') {
        const candidate = String(req.body?.redirectTo || '').trim();
        const redirectPath =
          candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/contact';
        req.session.formError =
          '세션이 만료되어 요청 검증에 실패했습니다. 페이지를 새로고침 후 다시 제출해주세요.';
        res.redirect(redirectPath);
        return;
      }
      res.status(403).send('요청 검증에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.');
      return;
    }

    // eslint-disable-next-line no-console
    console.error(err, req.path);
    res.status(500).send('Internal Server Error');
  });

  return {
    app,
    bootInfo: {
      backend: infra.backend,
      dbPath: infra.dbPath,
      hasAlert: inquiryAlertService.hasEnabledChannel(),
      alertNames: inquiryAlertService.getEnabledChannelNames(),
    },
  };
}

async function getAppBundle() {
  if (!appBundlePromise) {
    appBundlePromise = createApp();
  }
  return appBundlePromise;
}

if (require.main === module) {
  getAppBundle()
    .then(({ app, bootInfo }) => {
      app.listen(PORT, () => {
        // eslint-disable-next-line no-console
        console.log(`Dandelion app running on http://127.0.0.1:${PORT}`);
        // eslint-disable-next-line no-console
        console.log(`[backend] ${bootInfo.backend}`);
        if (bootInfo.dbPath) {
          // eslint-disable-next-line no-console
          console.log(`[db] sqlite path: ${bootInfo.dbPath}`);
        }
        // eslint-disable-next-line no-console
        console.log('Admin default login: tenant=dandelion-effect / admin / admin1234');
        // eslint-disable-next-line no-console
        console.log(
          `[alerts] enabled channels: ${
            bootInfo.hasAlert ? bootInfo.alertNames.join(', ') : 'none'
          }`
        );
      });
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to bootstrap app', err);
      process.exit(1);
    });
}

module.exports = getAppBundle;
