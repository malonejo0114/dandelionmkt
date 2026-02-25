const fs = require('fs/promises');
const path = require('path');
const slugify = require('slugify');

const projectRoot = path.resolve(__dirname, '../../..');
const ContentItem = require('../../domain/content/contentItem');

class ContentService {
  constructor(contentRepository, mediaRepository, storageService = null) {
    this.contentRepository = contentRepository;
    this.mediaRepository = mediaRepository;
    this.storageService = storageService;
  }

  async listPublished(tenantId, type) {
    return this.contentRepository.listPublishedByType(tenantId, type);
  }

  async listAdmin(tenantId, type) {
    return this.contentRepository.listByTypeForAdmin(tenantId, type);
  }

  async listMediaLibrary(tenantId) {
    return this.mediaRepository.listByTenant(tenantId);
  }

  async getBySlug(tenantId, type, slug) {
    const content = await this.contentRepository.getBySlug(tenantId, type, slug);
    if (!content) return null;

    const mediaAssets = await this.mediaRepository.listByContent(content.id);
    const blocks = await this.contentRepository.listBlocks(tenantId, content.id);
    return { ...content, mediaAssets, blocks };
  }

  async getById(tenantId, id) {
    const content = await this.contentRepository.getById(tenantId, id);
    if (!content) return null;

    const mediaAssets = await this.mediaRepository.listByContent(content.id);
    const blocks = await this.contentRepository.listBlocks(tenantId, content.id);
    return { ...content, mediaAssets, blocks };
  }

  async create(tenantId, payload, files) {
    const slug = await this.ensureUniqueSlug(tenantId, payload.type, payload.title);
    const thumbnailPath = files?.thumbnail?.[0]
      ? await this.uploadThumbnailFile(tenantId, files.thumbnail[0])
      : null;

    const blocks = await this.normalizeBlocks(tenantId, payload.blocksJson);
    const bodyFallback = this.composeBodyFallback(blocks, payload.body);

    const item = new ContentItem({
      tenantId,
      type: payload.type,
      title: payload.title,
      slug,
      summary: payload.summary,
      body: bodyFallback,
      status: payload.status || 'draft',
      thumbnailPath,
    });
    item.validate();

    const created = await this.contentRepository.create(item);

    if (files?.attachments?.length) {
      await this.attachFiles(tenantId, created.id, files.attachments);
    }

    await this.contentRepository.replaceBlocks(tenantId, created.id, blocks);
    await this.syncBlockAssetLinks(created.id, blocks);

    return this.getById(tenantId, created.id);
  }

  async update(tenantId, id, payload, files) {
    const existing = await this.contentRepository.getById(tenantId, id);
    if (!existing) {
      throw new Error('Content not found');
    }

    const slug = await this.ensureUniqueSlug(tenantId, existing.type, payload.title, id);
    const newThumbnailPath = files?.thumbnail?.[0]
      ? await this.uploadThumbnailFile(tenantId, files.thumbnail[0])
      : existing.thumbnail_path;

    const blocks = await this.normalizeBlocks(tenantId, payload.blocksJson);
    const bodyFallback = this.composeBodyFallback(blocks, payload.body);

    const item = new ContentItem({
      id,
      tenantId,
      type: existing.type,
      title: payload.title,
      slug,
      summary: payload.summary,
      body: bodyFallback,
      status: payload.status || 'draft',
      thumbnailPath: newThumbnailPath,
    });
    item.validate();

    await this.contentRepository.update(item);

    if (files?.attachments?.length) {
      await this.attachFiles(tenantId, id, files.attachments);
    }

    await this.contentRepository.replaceBlocks(tenantId, id, blocks);
    await this.syncBlockAssetLinks(id, blocks);

    if (files?.thumbnail?.[0] && existing.thumbnail_path && existing.thumbnail_path !== newThumbnailPath) {
      await this.deleteManagedFile(existing.thumbnail_path);
    }

    return this.getById(tenantId, id);
  }

  async delete(tenantId, id) {
    const existing = await this.contentRepository.getById(tenantId, id);
    if (!existing) {
      return;
    }

    const removableAssets = await this.mediaRepository.listByContentOrBlocks(id);
    await this.contentRepository.delete(tenantId, id);

    if (existing.thumbnail_path) {
      await this.deleteManagedFile(existing.thumbnail_path);
    }

    for (const asset of removableAssets) {
      // eslint-disable-next-line no-await-in-loop
      const deleted = await this.mediaRepository.pruneOrphanAsset(asset.id);
      if (!deleted) {
        // eslint-disable-next-line no-continue
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      await this.deleteManagedFile(deleted.storage_path);
    }
  }

  async removeMedia(tenantId, contentId, mediaId) {
    await this.contentRepository.clearMediaAssetFromBlocks(tenantId, contentId, mediaId);
    const deletedAsset = await this.mediaRepository.removeLink(contentId, mediaId);
    if (deletedAsset) {
      await this.deleteManagedFile(deletedAsset.storage_path);
    }
  }

  async attachFiles(tenantId, contentId, fileList) {
    const currentAssets = await this.mediaRepository.listByContent(contentId);
    let sortOrder = currentAssets.length;

    for (const file of fileList) {
      // eslint-disable-next-line no-await-in-loop
      const stored = await this.uploadAttachmentFile(tenantId, file);
      // eslint-disable-next-line no-await-in-loop
      const asset = await this.mediaRepository.createAsset({
        tenantId,
        fileName: stored.fileName,
        originalName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        storagePath: stored.storagePath,
      });
      // eslint-disable-next-line no-await-in-loop
      await this.mediaRepository.addLink(contentId, asset.id, sortOrder);
      sortOrder += 1;
    }
  }

  async syncBlockAssetLinks(contentId, blocks) {
    const ids = Array.from(
      new Set(
        blocks
          .map((block) => (block.mediaAssetId ? Number(block.mediaAssetId) : null))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    );

    if (!ids.length) {
      return;
    }

    const currentAssets = await this.mediaRepository.listByContent(contentId);
    const currentIds = new Set(currentAssets.map((asset) => Number(asset.id)));
    let sortOrder = currentAssets.length;

    for (const mediaAssetId of ids) {
      if (!currentIds.has(mediaAssetId)) {
        // eslint-disable-next-line no-await-in-loop
        await this.mediaRepository.addLink(contentId, mediaAssetId, sortOrder);
        sortOrder += 1;
      }
    }
  }

  async normalizeBlocks(tenantId, blocksJson) {
    if (!blocksJson) return [];

    let parsed;
    try {
      parsed = typeof blocksJson === 'string' ? JSON.parse(blocksJson) : blocksJson;
    } catch (_err) {
      throw new Error('블록 데이터 형식이 올바르지 않습니다.');
    }

    if (!Array.isArray(parsed)) {
      throw new Error('블록 데이터는 배열이어야 합니다.');
    }

    const normalized = [];

    for (const row of parsed) {
      const blockType = String(row.blockType || '').trim();
      if (!['text', 'image', 'video'].includes(blockType)) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const contentText = String(row.contentText || '').trim();
      const mediaUrl = String(row.mediaUrl || '').trim();
      const mediaAssetId = row.mediaAssetId ? Number(row.mediaAssetId) : null;

      if (blockType === 'text') {
        if (!contentText) {
          // eslint-disable-next-line no-continue
          continue;
        }
        normalized.push({ blockType, contentText, mediaAssetId: null, mediaUrl: null });
        // eslint-disable-next-line no-continue
        continue;
      }

      let safeAssetId = null;
      if (mediaAssetId) {
        // eslint-disable-next-line no-await-in-loop
        const asset = await this.mediaRepository.getById(tenantId, mediaAssetId);
        if (!asset) {
          throw new Error(`블록에 연결된 미디어(ID:${mediaAssetId})를 찾을 수 없습니다.`);
        }
        safeAssetId = mediaAssetId;
      }

      if (!safeAssetId && !mediaUrl) {
        // eslint-disable-next-line no-continue
        continue;
      }

      normalized.push({
        blockType,
        contentText: contentText || null,
        mediaAssetId: safeAssetId,
        mediaUrl: safeAssetId ? null : mediaUrl,
      });
    }

    return normalized;
  }

  composeBodyFallback(blocks, bodyText) {
    if (blocks && blocks.length) {
      const textBlocks = blocks
        .filter((block) => block.blockType === 'text' && block.contentText)
        .map((block) => block.contentText.trim())
        .filter(Boolean);
      if (textBlocks.length) {
        return textBlocks.join('\n\n');
      }
    }
    return bodyText || '';
  }

  async ensureUniqueSlug(tenantId, type, title, excludeId = null) {
    const base = slugify(title || 'item', {
      lower: true,
      strict: true,
      trim: true,
      locale: 'ko',
    }) || 'item';

    let candidate = base;
    let cursor = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await this.contentRepository.isSlugTaken(tenantId, type, candidate, excludeId)) {
      candidate = `${base}-${cursor}`;
      cursor += 1;
    }
    return candidate;
  }

  async uploadThumbnailFile(tenantId, file) {
    if (this.storageService) {
      const uploaded = await this.storageService.uploadBuffer({
        tenantId,
        file,
        category: 'thumbnails',
      });
      return uploaded.storagePath;
    }

    if (!file || !file.filename) {
      throw new Error('썸네일 업로드 파일이 올바르지 않습니다.');
    }

    return `/uploads/${file.filename}`;
  }

  async uploadAttachmentFile(tenantId, file) {
    if (this.storageService) {
      const uploaded = await this.storageService.uploadBuffer({
        tenantId,
        file,
        category: 'attachments',
      });
      return {
        fileName: uploaded.fileName,
        storagePath: uploaded.storagePath,
      };
    }

    if (!file || !file.filename) {
      throw new Error('첨부 파일 업로드가 올바르지 않습니다.');
    }

    return {
      fileName: file.filename,
      storagePath: `/uploads/${file.filename}`,
    };
  }

  async deleteManagedFile(webPath) {
    if (this.storageService) {
      try {
        await this.storageService.deleteByStoragePath(webPath);
      } catch (_err) {
        // ignore storage cleanup failures in app flow
      }
      return;
    }

    if (!webPath || typeof webPath !== 'string' || !webPath.startsWith('/uploads/')) {
      return;
    }

    const normalized = webPath.replace(/^\/+/, '');
    const absPath = path.join(projectRoot, normalized);
    const uploadRoot = path.join(projectRoot, 'uploads');

    if (!absPath.startsWith(uploadRoot)) {
      return;
    }

    try {
      await fs.unlink(absPath);
    } catch (_err) {
      // ignore missing files
    }
  }
}

module.exports = ContentService;
