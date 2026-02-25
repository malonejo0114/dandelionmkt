const path = require('path');
const slugify = require('slugify');
const { getSupabaseAdminClient } = require('../../config/supabase');

class SupabaseStorageService {
  constructor({ bucket = 'media' } = {}) {
    this.client = getSupabaseAdminClient();
    this.bucket = bucket;
  }

  static buildSafeFileName(originalName = 'asset') {
    const ext = path.extname(originalName || '').toLowerCase();
    const base = path.basename(originalName || 'asset', ext);
    const safeBase = slugify(base, { lower: true, strict: true, trim: true }) || 'asset';
    return `${safeBase}${ext}`;
  }

  async uploadBuffer({ tenantId, file, category = 'attachments' }) {
    if (!file || !file.buffer) {
      throw new Error('업로드 파일 버퍼가 없습니다.');
    }

    const safeName = SupabaseStorageService.buildSafeFileName(file.originalname);
    const objectPath = `${tenantId}/${category}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await this.client.storage
      .from(this.bucket)
      .upload(objectPath, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Supabase storage 업로드 실패: ${uploadError.message}`);
    }

    const { data } = this.client.storage.from(this.bucket).getPublicUrl(objectPath);

    return {
      fileName: path.basename(objectPath),
      storagePath: data?.publicUrl || null,
      objectPath,
      fileSize: file.size,
      mimeType: file.mimetype,
      originalName: file.originalname,
    };
  }

  extractObjectPath(storagePath) {
    if (!storagePath || typeof storagePath !== 'string') {
      return null;
    }

    if (storagePath.startsWith(`supabase://${this.bucket}/`)) {
      return storagePath.slice(`supabase://${this.bucket}/`.length);
    }

    try {
      const url = new URL(storagePath);
      const marker = `/storage/v1/object/public/${this.bucket}/`;
      const index = url.pathname.indexOf(marker);
      if (index === -1) {
        return null;
      }
      return decodeURIComponent(url.pathname.slice(index + marker.length));
    } catch (_err) {
      return null;
    }
  }

  async deleteByStoragePath(storagePath) {
    const objectPath = this.extractObjectPath(storagePath);
    if (!objectPath) {
      return;
    }

    const { error } = await this.client.storage.from(this.bucket).remove([objectPath]);
    if (error) {
      throw new Error(`Supabase storage 삭제 실패: ${error.message}`);
    }
  }
}

module.exports = SupabaseStorageService;
