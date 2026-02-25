const { getSupabaseAdminClient } = require('../../config/supabase');
const { throwIfError } = require('./supabaseUtils');

class SupabaseContentRepository {
  constructor() {
    this.db = getSupabaseAdminClient();
  }

  async listPublishedByType(tenantId, type) {
    const { data, error } = await this.db
      .from('content_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('type', type)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    throwIfError(error, 'content_items 조회 실패');
    return data || [];
  }

  async listByTypeForAdmin(tenantId, type) {
    const { data, error } = await this.db
      .from('content_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('type', type)
      .order('updated_at', { ascending: false });
    throwIfError(error, '관리자 content_items 조회 실패');
    return data || [];
  }

  async getBySlug(tenantId, type, slug) {
    const { data, error } = await this.db
      .from('content_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('type', type)
      .eq('slug', slug)
      .maybeSingle();
    throwIfError(error, 'slug 콘텐츠 조회 실패');
    return data || null;
  }

  async getById(tenantId, id) {
    const { data, error } = await this.db
      .from('content_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', id)
      .maybeSingle();
    throwIfError(error, 'id 콘텐츠 조회 실패');
    return data || null;
  }

  async isSlugTaken(tenantId, type, slug, excludeId = null) {
    let query = this.db
      .from('content_items')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('type', type)
      .eq('slug', slug)
      .limit(1);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query;
    throwIfError(error, 'slug 중복 확인 실패');
    return Array.isArray(data) && data.length > 0;
  }

  async create(item) {
    const payload = {
      tenant_id: item.tenantId,
      type: item.type,
      title: item.title,
      slug: item.slug,
      summary: item.summary,
      body: item.body,
      status: item.status,
      thumbnail_path: item.thumbnailPath,
    };

    const { data, error } = await this.db
      .from('content_items')
      .insert(payload)
      .select('*')
      .single();
    throwIfError(error, '콘텐츠 생성 실패');
    return data;
  }

  async update(item) {
    const payload = {
      title: item.title,
      slug: item.slug,
      summary: item.summary,
      body: item.body,
      status: item.status,
      thumbnail_path: item.thumbnailPath,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.db
      .from('content_items')
      .update(payload)
      .eq('tenant_id', item.tenantId)
      .eq('id', item.id)
      .select('*')
      .maybeSingle();
    throwIfError(error, '콘텐츠 수정 실패');
    return data || null;
  }

  async delete(tenantId, id) {
    const { error } = await this.db
      .from('content_items')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('id', id);
    throwIfError(error, '콘텐츠 삭제 실패');
  }

  async replaceBlocks(tenantId, contentItemId, blocks) {
    const { error: deleteError } = await this.db
      .from('content_blocks')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('content_item_id', contentItemId);
    throwIfError(deleteError, '콘텐츠 블록 초기화 실패');

    if (!Array.isArray(blocks) || blocks.length === 0) {
      return;
    }

    const payload = blocks.map((block, index) => ({
      tenant_id: tenantId,
      content_item_id: contentItemId,
      block_type: block.blockType,
      content_text: block.contentText || null,
      media_asset_id: block.mediaAssetId || null,
      media_url: block.mediaUrl || null,
      sort_order: index,
    }));

    const { error } = await this.db.from('content_blocks').insert(payload);
    throwIfError(error, '콘텐츠 블록 저장 실패');
  }

  async listBlocks(tenantId, contentItemId) {
    const { data: blocks, error } = await this.db
      .from('content_blocks')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('content_item_id', contentItemId)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true });
    throwIfError(error, '콘텐츠 블록 조회 실패');

    if (!blocks || blocks.length === 0) {
      return [];
    }

    const mediaIds = Array.from(
      new Set(
        blocks
          .map((row) => (row.media_asset_id ? Number(row.media_asset_id) : null))
          .filter((value) => Number.isFinite(value) && value > 0)
      )
    );

    let assetsById = new Map();
    if (mediaIds.length > 0) {
      const { data: assets, error: mediaError } = await this.db
        .from('media_assets')
        .select('id, storage_path, mime_type, original_name')
        .in('id', mediaIds);
      throwIfError(mediaError, '블록 미디어 조회 실패');
      assetsById = new Map((assets || []).map((asset) => [Number(asset.id), asset]));
    }

    return blocks.map((block) => {
      const asset = block.media_asset_id ? assetsById.get(Number(block.media_asset_id)) : null;
      return {
        ...block,
        storage_path: asset?.storage_path || null,
        mime_type: asset?.mime_type || null,
        original_name: asset?.original_name || null,
      };
    });
  }

  async clearMediaAssetFromBlocks(tenantId, contentItemId, mediaAssetId) {
    const { error } = await this.db
      .from('content_blocks')
      .update({ media_asset_id: null })
      .eq('tenant_id', tenantId)
      .eq('content_item_id', contentItemId)
      .eq('media_asset_id', mediaAssetId);
    throwIfError(error, '블록 미디어 연결 해제 실패');
  }
}

module.exports = SupabaseContentRepository;
