const { getSupabaseAdminClient } = require('../../config/supabase');
const { throwIfError } = require('./supabaseUtils');

class SupabaseMediaRepository {
  constructor() {
    this.db = getSupabaseAdminClient();
  }

  async createAsset({ tenantId, fileName, originalName, mimeType, fileSize, storagePath }) {
    const { data, error } = await this.db
      .from('media_assets')
      .insert({
        tenant_id: tenantId,
        file_name: fileName,
        original_name: originalName,
        mime_type: mimeType,
        file_size: fileSize,
        storage_path: storagePath,
      })
      .select('*')
      .single();

    throwIfError(error, '미디어 생성 실패');
    return data;
  }

  async getById(tenantId, assetId) {
    const { data, error } = await this.db
      .from('media_assets')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', assetId)
      .maybeSingle();
    throwIfError(error, '미디어 조회 실패');
    return data || null;
  }

  async listByTenant(tenantId) {
    const { data, error } = await this.db
      .from('media_assets')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    throwIfError(error, '미디어 라이브러리 조회 실패');
    return data || [];
  }

  async addLink(contentItemId, mediaAssetId, sortOrder = 0) {
    const { error } = await this.db.from('content_media_links').upsert(
      {
        content_item_id: contentItemId,
        media_asset_id: mediaAssetId,
        sort_order: sortOrder,
      },
      {
        onConflict: 'content_item_id,media_asset_id',
        ignoreDuplicates: true,
      }
    );
    throwIfError(error, '미디어 링크 생성 실패');
  }

  async listByContent(contentItemId) {
    const { data: links, error: linkError } = await this.db
      .from('content_media_links')
      .select('media_asset_id, sort_order, id')
      .eq('content_item_id', contentItemId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    throwIfError(linkError, '콘텐츠 미디어 링크 조회 실패');

    if (!links || links.length === 0) {
      return [];
    }

    const assetIds = links.map((link) => Number(link.media_asset_id)).filter(Boolean);
    const { data: assets, error: assetError } = await this.db
      .from('media_assets')
      .select('*')
      .in('id', assetIds);
    throwIfError(assetError, '콘텐츠 미디어 조회 실패');

    const map = new Map((assets || []).map((asset) => [Number(asset.id), asset]));
    return links
      .map((link) => map.get(Number(link.media_asset_id)))
      .filter(Boolean);
  }

  async listByContentOrBlocks(contentItemId) {
    const { data: linkRows, error: linkError } = await this.db
      .from('content_media_links')
      .select('media_asset_id')
      .eq('content_item_id', contentItemId);
    throwIfError(linkError, '콘텐츠 링크 미디어 조회 실패');

    const { data: blockRows, error: blockError } = await this.db
      .from('content_blocks')
      .select('media_asset_id')
      .eq('content_item_id', contentItemId)
      .not('media_asset_id', 'is', null);
    throwIfError(blockError, '블록 링크 미디어 조회 실패');

    const ids = Array.from(
      new Set(
        [...(linkRows || []), ...(blockRows || [])]
          .map((row) => Number(row.media_asset_id))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    );

    if (!ids.length) {
      return [];
    }

    const { data, error } = await this.db
      .from('media_assets')
      .select('*')
      .in('id', ids)
      .order('id', { ascending: true });
    throwIfError(error, '링크된 미디어 조회 실패');
    return data || [];
  }

  async hasAnyReference(mediaAssetId) {
    const { data: linked, error: linkedError } = await this.db
      .from('content_media_links')
      .select('id')
      .eq('media_asset_id', mediaAssetId)
      .limit(1);
    throwIfError(linkedError, '미디어 링크 참조 확인 실패');
    if (Array.isArray(linked) && linked.length > 0) {
      return true;
    }

    const { data: blocked, error: blockError } = await this.db
      .from('content_blocks')
      .select('id')
      .eq('media_asset_id', mediaAssetId)
      .limit(1);
    throwIfError(blockError, '블록 참조 확인 실패');

    return Array.isArray(blocked) && blocked.length > 0;
  }

  async pruneOrphanAsset(mediaAssetId) {
    const { data: asset, error: assetError } = await this.db
      .from('media_assets')
      .select('*')
      .eq('id', mediaAssetId)
      .maybeSingle();
    throwIfError(assetError, '미디어 조회 실패');

    if (!asset) {
      return null;
    }

    const hasReference = await this.hasAnyReference(mediaAssetId);
    if (hasReference) {
      return null;
    }

    const { error: deleteError } = await this.db.from('media_assets').delete().eq('id', mediaAssetId);
    throwIfError(deleteError, '미디어 삭제 실패');

    return asset;
  }

  async removeLink(contentItemId, mediaAssetId) {
    const { error } = await this.db
      .from('content_media_links')
      .delete()
      .eq('content_item_id', contentItemId)
      .eq('media_asset_id', mediaAssetId);
    throwIfError(error, '미디어 링크 삭제 실패');

    return this.pruneOrphanAsset(mediaAssetId);
  }

  async removeAllLinksForContent(contentItemId) {
    const linkedAssets = await this.listByContent(contentItemId);

    const { error } = await this.db
      .from('content_media_links')
      .delete()
      .eq('content_item_id', contentItemId);
    throwIfError(error, '콘텐츠 전체 미디어 링크 삭제 실패');

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

module.exports = SupabaseMediaRepository;
