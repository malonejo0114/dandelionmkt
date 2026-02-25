class ContentItem {
  constructor({
    id = null,
    tenantId,
    type,
    title,
    slug,
    summary = '',
    body = '',
    status = 'draft',
    thumbnailPath = null,
    createdAt = null,
    updatedAt = null,
  }) {
    this.id = id;
    this.tenantId = tenantId;
    this.type = type;
    this.title = title;
    this.slug = slug;
    this.summary = summary;
    this.body = body;
    this.status = status;
    this.thumbnailPath = thumbnailPath;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  validate() {
    if (!this.tenantId) throw new Error('tenantId is required');
    if (!['portfolio', 'service'].includes(this.type)) throw new Error('Invalid content type');
    if (!this.title || this.title.trim().length < 2) throw new Error('Title must be at least 2 characters');
    if (!this.slug || this.slug.trim().length < 2) throw new Error('Slug is required');
    if (!['draft', 'published'].includes(this.status)) throw new Error('Invalid status');
  }
}

module.exports = ContentItem;
