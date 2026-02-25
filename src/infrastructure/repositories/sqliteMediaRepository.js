const { run, get, all } = require('../../config/database');

class SqliteMediaRepository {
  async createAsset({ tenantId, fileName, originalName, mimeType, fileSize, storagePath }) {
    const result = await run(
      `INSERT INTO media_assets
      (tenant_id, file_name, original_name, mime_type, file_size, storage_path)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [tenantId, fileName, originalName, mimeType, fileSize, storagePath]
    );

    return get('SELECT * FROM media_assets WHERE id = ?', [result.lastID]);
  }

  async getById(tenantId, assetId) {
    return get('SELECT * FROM media_assets WHERE tenant_id = ? AND id = ?', [tenantId, assetId]);
  }

  async listByTenant(tenantId) {
    return all(
      `SELECT *
       FROM media_assets
       WHERE tenant_id = ?
       ORDER BY datetime(created_at) DESC, id DESC`,
      [tenantId]
    );
  }

  async addLink(contentItemId, mediaAssetId, sortOrder = 0) {
    await run(
      `INSERT OR IGNORE INTO content_media_links (content_item_id, media_asset_id, sort_order)
       VALUES (?, ?, ?)`,
      [contentItemId, mediaAssetId, sortOrder]
    );
  }

  async listByContent(contentItemId) {
    return all(
      `SELECT ma.*
       FROM media_assets ma
       INNER JOIN content_media_links cml ON cml.media_asset_id = ma.id
       WHERE cml.content_item_id = ?
       ORDER BY cml.sort_order ASC, ma.id ASC`,
      [contentItemId]
    );
  }

  async listByContentOrBlocks(contentItemId) {
    return all(
      `SELECT DISTINCT ma.*
       FROM media_assets ma
       INNER JOIN (
         SELECT media_asset_id AS asset_id
         FROM content_media_links
         WHERE content_item_id = ?
         UNION
         SELECT media_asset_id AS asset_id
         FROM content_blocks
         WHERE content_item_id = ? AND media_asset_id IS NOT NULL
       ) refs ON refs.asset_id = ma.id
       ORDER BY ma.id ASC`,
      [contentItemId, contentItemId]
    );
  }

  async hasAnyReference(mediaAssetId) {
    const linked = await get(
      'SELECT 1 FROM content_media_links WHERE media_asset_id = ? LIMIT 1',
      [mediaAssetId]
    );
    if (linked) {
      return true;
    }

    const blocked = await get(
      'SELECT 1 FROM content_blocks WHERE media_asset_id = ? LIMIT 1',
      [mediaAssetId]
    );
    return Boolean(blocked);
  }

  async pruneOrphanAsset(mediaAssetId) {
    const asset = await get('SELECT * FROM media_assets WHERE id = ?', [mediaAssetId]);
    if (!asset) {
      return null;
    }

    const hasReference = await this.hasAnyReference(mediaAssetId);
    if (hasReference) {
      return null;
    }

    await run('DELETE FROM media_assets WHERE id = ?', [mediaAssetId]);
    return asset;
  }

  async removeLink(contentItemId, mediaAssetId) {
    await run(
      'DELETE FROM content_media_links WHERE content_item_id = ? AND media_asset_id = ?',
      [contentItemId, mediaAssetId]
    );

    return this.pruneOrphanAsset(mediaAssetId);
  }

  async removeAllLinksForContent(contentItemId) {
    const linkedAssets = await this.listByContent(contentItemId);
    await run('DELETE FROM content_media_links WHERE content_item_id = ?', [contentItemId]);

    const deletedAssets = [];
    for (const asset of linkedAssets) {
      // eslint-disable-next-line no-await-in-loop
      const deleted = await this.pruneOrphanAsset(asset.id);
      if (deleted) {
        deletedAssets.push(deleted);
      }
    }

    return deletedAssets;
  }
}

module.exports = SqliteMediaRepository;
