const { run, get, all } = require('../../config/database');

class SqliteContentRepository {
  async listPublishedByType(tenantId, type) {
    return all(
      `SELECT * FROM content_items
       WHERE tenant_id = ? AND type = ? AND status = 'published'
       ORDER BY datetime(created_at) DESC`,
      [tenantId, type]
    );
  }

  async listByTypeForAdmin(tenantId, type) {
    return all(
      `SELECT * FROM content_items
       WHERE tenant_id = ? AND type = ?
       ORDER BY datetime(updated_at) DESC`,
      [tenantId, type]
    );
  }

  async getBySlug(tenantId, type, slug) {
    return get(
      `SELECT * FROM content_items
       WHERE tenant_id = ? AND type = ? AND slug = ?`,
      [tenantId, type, slug]
    );
  }

  async getById(tenantId, id) {
    return get(
      `SELECT * FROM content_items
       WHERE tenant_id = ? AND id = ?`,
      [tenantId, id]
    );
  }

  async isSlugTaken(tenantId, type, slug, excludeId = null) {
    if (excludeId) {
      const row = await get(
        `SELECT id FROM content_items
         WHERE tenant_id = ? AND type = ? AND slug = ? AND id != ?`,
        [tenantId, type, slug, excludeId]
      );
      return Boolean(row);
    }

    const row = await get(
      `SELECT id FROM content_items
       WHERE tenant_id = ? AND type = ? AND slug = ?`,
      [tenantId, type, slug]
    );
    return Boolean(row);
  }

  async create(item) {
    const result = await run(
      `INSERT INTO content_items
      (tenant_id, type, title, slug, summary, body, status, thumbnail_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.tenantId,
        item.type,
        item.title,
        item.slug,
        item.summary,
        item.body,
        item.status,
        item.thumbnailPath,
      ]
    );

    return this.getById(item.tenantId, result.lastID);
  }

  async update(item) {
    await run(
      `UPDATE content_items
       SET title = ?, slug = ?, summary = ?, body = ?, status = ?, thumbnail_path = ?, updated_at = datetime('now')
       WHERE tenant_id = ? AND id = ?`,
      [
        item.title,
        item.slug,
        item.summary,
        item.body,
        item.status,
        item.thumbnailPath,
        item.tenantId,
        item.id,
      ]
    );

    return this.getById(item.tenantId, item.id);
  }

  async delete(tenantId, id) {
    await run('DELETE FROM content_items WHERE tenant_id = ? AND id = ?', [tenantId, id]);
  }

  async replaceBlocks(tenantId, contentItemId, blocks) {
    await run(
      'DELETE FROM content_blocks WHERE tenant_id = ? AND content_item_id = ?',
      [tenantId, contentItemId]
    );

    let sortOrder = 0;
    for (const block of blocks) {
      // eslint-disable-next-line no-await-in-loop
      await run(
        `INSERT INTO content_blocks
        (tenant_id, content_item_id, block_type, content_text, media_asset_id, media_url, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          contentItemId,
          block.blockType,
          block.contentText || null,
          block.mediaAssetId || null,
          block.mediaUrl || null,
          sortOrder,
        ]
      );
      sortOrder += 1;
    }
  }

  async listBlocks(tenantId, contentItemId) {
    return all(
      `SELECT cb.*, ma.storage_path, ma.mime_type, ma.original_name
       FROM content_blocks cb
       LEFT JOIN media_assets ma ON ma.id = cb.media_asset_id
       WHERE cb.tenant_id = ? AND cb.content_item_id = ?
       ORDER BY cb.sort_order ASC, cb.id ASC`,
      [tenantId, contentItemId]
    );
  }

  async clearMediaAssetFromBlocks(tenantId, contentItemId, mediaAssetId) {
    await run(
      `UPDATE content_blocks
       SET media_asset_id = NULL
       WHERE tenant_id = ? AND content_item_id = ? AND media_asset_id = ?`,
      [tenantId, contentItemId, mediaAssetId]
    );
  }
}

module.exports = SqliteContentRepository;
