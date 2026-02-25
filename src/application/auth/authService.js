const bcrypt = require('bcryptjs');
const otplib = require('otplib');

function passwordPolicyError(password) {
  if (!password || password.length < 10) {
    return '비밀번호는 10자 이상이어야 합니다.';
  }
  if (!/[A-Z]/.test(password)) {
    return '비밀번호에 영문 대문자를 1개 이상 포함해주세요.';
  }
  if (!/[a-z]/.test(password)) {
    return '비밀번호에 영문 소문자를 1개 이상 포함해주세요.';
  }
  if (!/[0-9]/.test(password)) {
    return '비밀번호에 숫자를 1개 이상 포함해주세요.';
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    return '비밀번호에 특수문자를 1개 이상 포함해주세요.';
  }
  return null;
}

class AuthService {
  constructor(adminRepository, tenantService) {
    this.adminRepository = adminRepository;
    this.tenantService = tenantService;
  }

  validatePasswordPolicy(password) {
    return passwordPolicyError(password);
  }

  async login({ tenantSlug, username, password, otpCode }) {
    const tenant = await this.tenantService.findBySlug(tenantSlug);
    if (!tenant) {
      return { ok: false, error: '존재하지 않는 tenant slug 입니다.' };
    }

    const admin = await this.adminRepository.findByUsername(tenant.id, username);
    if (!admin) {
      return { ok: false, error: '로그인 정보가 올바르지 않습니다.' };
    }

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      return {
        ok: false,
        error: `로그인 시도가 제한되었습니다. 잠금 해제 시각: ${admin.locked_until}`,
      };
    }

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) {
      const nextFailCount = Number(admin.failed_login_count || 0) + 1;
      const lockUntil = nextFailCount >= 5
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null;

      await this.adminRepository.markFailedLogin(tenant.id, admin.id, {
        failedCount: nextFailCount,
        lockUntil,
      });

      if (lockUntil) {
        return {
          ok: false,
          error: '비밀번호 오류가 누적되어 15분간 로그인이 잠깁니다.',
        };
      }

      return { ok: false, error: '로그인 정보가 올바르지 않습니다.' };
    }

    if (Number(admin.twofa_enabled || 0) === 1) {
      if (!otpCode) {
        return {
          ok: false,
          error: '2차 인증 코드(OTP)를 입력해주세요.',
          requiresOtp: true,
        };
      }

      const otpResult = await otplib.verify({
        strategy: 'totp',
        secret: admin.twofa_secret,
        token: String(otpCode).trim(),
      });
      if (!otpResult || otpResult.valid !== true) {
        return { ok: false, error: 'OTP 코드가 올바르지 않습니다.', requiresOtp: true };
      }
    }

    await this.adminRepository.resetLoginFailures(tenant.id, admin.id);

    return {
      ok: true,
      admin: {
        id: admin.id,
        tenantId: admin.tenant_id,
        tenantSlug: tenant.slug,
        tenantName: tenant.name,
        username: admin.username,
        displayName: admin.display_name,
        mustChangePassword: Number(admin.must_change_password || 0) === 1,
        twofaEnabled: Number(admin.twofa_enabled || 0) === 1,
      },
    };
  }

  async changePassword({ tenantId, adminId, currentPassword, newPassword }) {
    const admin = await this.adminRepository.findById(tenantId, adminId);
    if (!admin) {
      throw new Error('관리자 정보를 찾을 수 없습니다.');
    }

    const validCurrent = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!validCurrent) {
      throw new Error('현재 비밀번호가 올바르지 않습니다.');
    }

    const policyError = this.validatePasswordPolicy(newPassword);
    if (policyError) {
      throw new Error(policyError);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.adminRepository.updatePassword(tenantId, adminId, passwordHash);
  }

  async prepareTwoFactorSetup({ tenantId, adminId, appName = 'Dandelion Effect' }) {
    const admin = await this.adminRepository.findById(tenantId, adminId);
    if (!admin) {
      throw new Error('관리자 정보를 찾을 수 없습니다.');
    }

    const secret = otplib.generateSecret(20);
    const otpauth = otplib.generateURI({
      strategy: 'totp',
      issuer: appName,
      label: admin.username,
      secret,
    });

    return { secret, otpauth };
  }

  async enableTwoFactor({ tenantId, adminId, secret, otpCode }) {
    const otpResult = await otplib.verify({
      strategy: 'totp',
      secret,
      token: String(otpCode || '').trim(),
    });
    if (!otpResult || otpResult.valid !== true) {
      throw new Error('OTP 검증에 실패했습니다.');
    }

    await this.adminRepository.updateTwoFactor(tenantId, adminId, {
      enabled: true,
      secret,
    });
  }

  async disableTwoFactor({ tenantId, adminId }) {
    await this.adminRepository.updateTwoFactor(tenantId, adminId, {
      enabled: false,
      secret: null,
    });
  }
}

module.exports = AuthService;
