/**
 * Blog service — platform-authored SEO/marketing articles.
 * Admin CRUD (blog:write) + public read (published only).
 */
import { getContext } from "@/context/request-context.js";
import { AppError } from "@/lib/errors.js";
import { BlogPostModel, UserModel } from "@/models/index.js";
import { writeAudit } from "@/services/audit.service.js";
import { deleteByUrl } from "@/services/upload.service.js";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

/** ~200 words per minute, floor 1 minute. */
function readingTime(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blogAdminDto(p: any) {
  return {
    id: String(p._id),
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    content: p.content,
    cover_image: p.coverImage ?? null,
    tags: p.tags ?? [],
    meta_title: p.metaTitle ?? null,
    meta_description: p.metaDescription ?? null,
    meta_keywords: p.metaKeywords ?? [],
    status: p.status,
    published_at: p.publishedAt ?? null,
    author_name: p.authorName,
    reading_time_mins: p.readingTimeMins ?? 1,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blogPublicDto(p: any, withContent: boolean) {
  return {
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    ...(withContent ? { content: p.content } : {}),
    cover_image: p.coverImage ?? null,
    tags: p.tags ?? [],
    meta_title: p.metaTitle ?? null,
    meta_description: p.metaDescription ?? null,
    meta_keywords: p.metaKeywords ?? [],
    published_at: p.publishedAt,
    updated_at: p.updatedAt,
    author_name: p.authorName,
    reading_time_mins: p.readingTimeMins ?? 1,
  };
}

/* ── Admin ───────────────────────────────────────────────────────────────── */

export interface BlogInput {
  title: string;
  slug?: string | null;
  excerpt: string;
  content: string;
  cover_image?: string | null;
  tags?: string[];
  meta_title?: string | null;
  meta_description?: string | null;
  meta_keywords?: string[];
}

export async function adminListBlogPosts(params: { status?: string; q?: string }) {
  const filter: Record<string, unknown> = {};
  if (params.status) filter.status = params.status;
  if (params.q) {
    const rx = new RegExp(params.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { slug: rx }, { tags: rx }];
  }
  const posts = await BlogPostModel.find(filter).sort({ createdAt: -1 }).lean();
  return { posts: posts.map(blogAdminDto) };
}

export async function adminGetBlogPost(id: string) {
  const post = await BlogPostModel.findById(id).lean();
  if (!post) throw AppError.notFound("Blog post not found");
  return { post: blogAdminDto(post) };
}

export async function adminCreateBlogPost(input: BlogInput) {
  const ctx = getContext();
  const slug = slugify(input.slug?.trim() || input.title);
  if (!slug) throw AppError.badRequest("Title must contain letters or numbers", "invalid_slug");
  const exists = await BlogPostModel.findOne({ slug });
  if (exists) throw AppError.conflict("A post with that slug already exists", "blog_slug_exists");
  const author = ctx.userId ? await UserModel.findById(ctx.userId).select("name").lean() : null;
  const doc = await BlogPostModel.create({
    title: input.title.trim(),
    slug,
    excerpt: input.excerpt.trim(),
    content: input.content,
    coverImage: input.cover_image || null,
    tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
    metaTitle: input.meta_title?.trim() || null,
    metaDescription: input.meta_description?.trim() || null,
    metaKeywords: (input.meta_keywords ?? []).map((k) => k.trim()).filter(Boolean),
    status: "draft",
    authorName: author?.name ?? "Postpin Team",
    readingTimeMins: readingTime(input.content),
  });
  await writeAudit({
    action: "blog.created",
    category: "data",
    actorId: ctx.userId,
    resource: { kind: "blog", id: String(doc._id), name: slug },
  });
  return { post: blogAdminDto(doc) };
}

export async function adminUpdateBlogPost(id: string, patch: Partial<BlogInput> & { status?: "draft" | "published" }) {
  const ctx = getContext();
  const doc = await BlogPostModel.findById(id);
  if (!doc) throw AppError.notFound("Blog post not found");

  if (patch.slug !== undefined && patch.slug !== null) {
    const slug = slugify(patch.slug || doc.title);
    if (!slug) throw AppError.badRequest("Slug must contain letters or numbers", "invalid_slug");
    if (slug !== doc.slug) {
      const exists = await BlogPostModel.findOne({ slug, _id: { $ne: doc._id } });
      if (exists) throw AppError.conflict("A post with that slug already exists", "blog_slug_exists");
      doc.slug = slug;
    }
  }
  if (patch.title !== undefined) doc.title = patch.title.trim();
  if (patch.excerpt !== undefined) doc.excerpt = patch.excerpt.trim();
  if (patch.content !== undefined) {
    doc.content = patch.content;
    doc.readingTimeMins = readingTime(patch.content);
  }
  if (patch.cover_image !== undefined) {
    const next = patch.cover_image || null;
    // Free the old uploaded file when the cover changes (no-op for external URLs).
    if (doc.coverImage && doc.coverImage !== next) deleteByUrl(doc.coverImage);
    doc.coverImage = next;
  }
  if (patch.tags !== undefined) doc.tags = patch.tags.map((t) => t.trim()).filter(Boolean);
  if (patch.meta_title !== undefined) doc.metaTitle = patch.meta_title?.trim() || null;
  if (patch.meta_description !== undefined) doc.metaDescription = patch.meta_description?.trim() || null;
  if (patch.meta_keywords !== undefined) doc.metaKeywords = patch.meta_keywords.map((k) => k.trim()).filter(Boolean);
  if (patch.status !== undefined && patch.status !== doc.status) {
    doc.status = patch.status;
    if (patch.status === "published" && !doc.publishedAt) doc.publishedAt = new Date();
  }
  await doc.save();
  await writeAudit({
    action: "blog.updated",
    category: "data",
    actorId: ctx.userId,
    resource: { kind: "blog", id, name: doc.slug },
    metadata: { status: doc.status },
  });
  return { post: blogAdminDto(doc) };
}

export async function adminDeleteBlogPost(id: string) {
  const ctx = getContext();
  const doc = await BlogPostModel.findByIdAndDelete(id);
  if (!doc) throw AppError.notFound("Blog post not found");
  deleteByUrl(doc.coverImage);
  await writeAudit({
    action: "blog.deleted",
    category: "data",
    actorId: ctx.userId,
    resource: { kind: "blog", id, name: doc.slug },
  });
  return { deleted: true };
}

/* ── Public ──────────────────────────────────────────────────────────────── */

export async function publicListBlogPosts(params: { tag?: string; limit: number; offset: number }) {
  const filter: Record<string, unknown> = { status: "published" };
  if (params.tag) filter.tags = params.tag;
  const [posts, total] = await Promise.all([
    BlogPostModel.find(filter).sort({ publishedAt: -1 }).skip(params.offset).limit(params.limit).lean(),
    BlogPostModel.countDocuments(filter),
  ]);
  return { posts: posts.map((p) => blogPublicDto(p, false)), total };
}

export async function publicGetBlogPost(slug: string) {
  const post = await BlogPostModel.findOne({ slug, status: "published" }).lean();
  if (!post) throw AppError.notFound("Blog post not found");
  return blogPublicDto(post, true);
}

/** Slugs + dates only — consumed by the frontend sitemap. */
export async function publicBlogSitemap() {
  const posts = await BlogPostModel.find({ status: "published" })
    .select("slug publishedAt updatedAt")
    .sort({ publishedAt: -1 })
    .lean();
  return posts.map((p) => ({ slug: p.slug, published_at: p.publishedAt, updated_at: p.updatedAt }));
}
