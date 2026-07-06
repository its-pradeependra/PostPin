"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { QueryBoundary } from "@/components/ui/query-boundary";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createAdminBlogPost,
  deleteAdminBlogPost,
  listAdminBlogPosts,
  updateAdminBlogPost,
  uploadBlogImage,
  type AdminBlogPost,
  type BlogPostInput,
} from "@/lib/api/services/admin";
import { ApiError } from "@/lib/api/errors";
import { formatDate } from "@/lib/format";

/* ── Local working model ─────────────────────────────────────────── */

type StatusFilter = "all" | AdminBlogPost["status"];

type PostDraft = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  coverImage: string;
  tags: string; // comma-separated in the form
  metaTitle: string;
  metaDescription: string;
  metaKeywords: string; // comma-separated in the form
};

function emptyDraft(): PostDraft {
  return {
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    coverImage: "",
    tags: "",
    metaTitle: "",
    metaDescription: "",
    metaKeywords: "",
  };
}

function draftFromPost(p: AdminBlogPost): PostDraft {
  return {
    title: p.title,
    slug: p.slug,
    excerpt: p.excerpt,
    content: p.content,
    coverImage: p.cover_image ?? "",
    tags: p.tags.join(", "),
    metaTitle: p.meta_title ?? "",
    metaDescription: p.meta_description ?? "",
    metaKeywords: p.meta_keywords.join(", "),
  };
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
}

const splitCsv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

function draftToInput(d: PostDraft): BlogPostInput {
  return {
    title: d.title.trim(),
    slug: d.slug.trim() ? slugify(d.slug) : null,
    excerpt: d.excerpt.trim(),
    content: d.content,
    cover_image: d.coverImage.trim() || null,
    tags: splitCsv(d.tags),
    meta_title: d.metaTitle.trim() || null,
    meta_description: d.metaDescription.trim() || null,
    meta_keywords: splitCsv(d.metaKeywords),
  };
}

const TEXTAREA_CLS =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/* ── Post editor dialog (create + edit) ──────────────────────────── */

function PostEditor({
  trigger,
  initial,
  onSubmit,
}: {
  trigger: React.ReactNode;
  initial?: AdminBlogPost;
  onSubmit: (input: BlogPostInput) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<PostDraft>(emptyDraft());
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const editing = Boolean(initial);

  async function handleCoverFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const saved = await uploadBlogImage(file);
      setDraft((d) => ({ ...d, coverImage: saved.url }));
      toast.success("Cover image uploaded");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const patch = (p: Partial<PostDraft>) => setDraft((d) => ({ ...d, ...p }));

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDraft(initial ? draftFromPost(initial) : emptyDraft());
      setSlugTouched(Boolean(initial));
    }
  }

  const titleValid = draft.title.trim().length >= 4;
  const excerptValid = draft.excerpt.trim().length >= 10;
  const contentValid = draft.content.trim().length >= 50;
  const coverValid = !draft.coverImage.trim() || /^https?:\/\//i.test(draft.coverImage.trim());
  const valid = titleValid && excerptValid && contentValid && coverValid;

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(draftToInput(draft));
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" data-testid="blog-editor-dialog">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit article" : "Write a new article"}</DialogTitle>
          <DialogDescription>
            Posts are saved as drafts first — publish from the list when ready. Markdown is
            supported in the body.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="blog-title">Title</Label>
            <Input
              id="blog-title"
              data-testid="blog-editor-title-input"
              placeholder="How to calculate shipping charges in India"
              value={draft.title}
              onChange={(e) => {
                patch({ title: e.target.value, ...(slugTouched ? {} : { slug: slugify(e.target.value) }) });
              }}
            />
            {!titleValid && draft.title.length > 0 && (
              <p className="text-xs text-destructive">At least 4 characters.</p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="blog-slug">URL slug</Label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-xs text-muted-foreground">/blog/</span>
              <Input
                id="blog-slug"
                data-testid="blog-editor-slug-input"
                className="font-mono text-sm"
                placeholder="auto-generated-from-title"
                value={draft.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  patch({ slug: e.target.value });
                }}
                onBlur={() => patch({ slug: slugify(draft.slug) })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="blog-excerpt">Excerpt</Label>
            <textarea
              id="blog-excerpt"
              data-testid="blog-editor-excerpt-input"
              className={TEXTAREA_CLS}
              rows={2}
              maxLength={400}
              placeholder="One or two sentences shown on the blog list and in search results."
              value={draft.excerpt}
              onChange={(e) => patch({ excerpt: e.target.value })}
            />
            <p className="text-right text-xs text-muted-foreground">{draft.excerpt.length}/400</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="blog-content">Body (markdown)</Label>
            <textarea
              id="blog-content"
              data-testid="blog-editor-content-input"
              className={`${TEXTAREA_CLS} font-mono`}
              rows={12}
              placeholder={"## Heading\n\nWrite the article here. **Bold**, *italic*, `code`, lists, links and images are supported."}
              value={draft.content}
              onChange={(e) => patch({ content: e.target.value })}
            />
            {!contentValid && draft.content.length > 0 && (
              <p className="text-xs text-destructive">At least 50 characters.</p>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="blog-cover">Cover image (optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="blog-cover"
                  data-testid="blog-editor-cover-input"
                  placeholder="https://…/cover.jpg or upload →"
                  value={draft.coverImage}
                  onChange={(e) => patch({ coverImage: e.target.value })}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  data-testid="blog-editor-cover-file-input"
                  onChange={(e) => void handleCoverFile(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="blog-editor-cover-upload-btn"
                >
                  <Icon name="upload" size={15} /> {uploading ? "Uploading…" : "Upload"}
                </Button>
              </div>
              {draft.coverImage && coverValid && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.coverImage}
                  alt="Cover preview"
                  data-testid="blog-editor-cover-preview"
                  className="mt-1 aspect-video w-full max-w-60 rounded-lg border object-cover"
                />
              )}
              {!coverValid && <p className="text-xs text-destructive">Must be an http(s) URL.</p>}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="blog-tags">Tags (comma-separated)</Label>
              <Input
                id="blog-tags"
                data-testid="blog-editor-tags-input"
                placeholder="guides, shipping-api"
                value={draft.tags}
                onChange={(e) => patch({ tags: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-xl border p-4" data-testid="blog-editor-seo-section">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="analytics" size={15} /> SEO
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Optional overrides — search engines use the title and excerpt when these are empty.
            </p>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="blog-meta-title">Meta title</Label>
                <Input
                  id="blog-meta-title"
                  data-testid="blog-editor-meta-title-input"
                  maxLength={160}
                  placeholder="Ideal: 50–60 characters, keyword first"
                  value={draft.metaTitle}
                  onChange={(e) => patch({ metaTitle: e.target.value })}
                />
                <p className="text-right text-xs text-muted-foreground">{draft.metaTitle.length}/60 recommended</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="blog-meta-description">Meta description</Label>
                <textarea
                  id="blog-meta-description"
                  data-testid="blog-editor-meta-description-input"
                  className={TEXTAREA_CLS}
                  rows={2}
                  maxLength={320}
                  placeholder="Ideal: 140–160 characters. Shown as the snippet in Google results."
                  value={draft.metaDescription}
                  onChange={(e) => patch({ metaDescription: e.target.value })}
                />
                <p className="text-right text-xs text-muted-foreground">{draft.metaDescription.length}/160 recommended</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="blog-meta-keywords">Meta keywords (comma-separated)</Label>
                <Input
                  id="blog-meta-keywords"
                  data-testid="blog-editor-meta-keywords-input"
                  placeholder="shipping calculation api, shipping charges india"
                  value={draft.metaKeywords}
                  onChange={(e) => patch({ metaKeywords: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} data-testid="blog-editor-cancel-btn">
            Cancel
          </Button>
          <Button
            variant="gradient"
            disabled={!valid || submitting}
            onClick={() => void handleSubmit()}
            data-testid="blog-editor-submit-btn"
          >
            {submitting ? "Saving…" : editing ? "Save changes" : "Save draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Row actions ─────────────────────────────────────────────────── */

function RowActions({
  post,
  onEdit,
  onSetStatus,
  onDelete,
}: {
  post: AdminBlogPost;
  onEdit: (id: string, input: BlogPostInput) => Promise<void>;
  onSetStatus: (post: AdminBlogPost, status: AdminBlogPost["status"]) => void;
  onDelete: (post: AdminBlogPost) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" data-testid={`blog-row-actions-${post.id}`}>
          <Icon name="more" size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="max-w-52 truncate">{post.title}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <PostEditor
          initial={post}
          onSubmit={(input) => onEdit(post.id, input)}
          trigger={
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} data-testid={`blog-action-edit-${post.id}`}>
              <Icon name="edit" size={16} /> Edit
            </DropdownMenuItem>
          }
        />
        {post.status === "published" ? (
          <>
            <DropdownMenuItem asChild data-testid={`blog-action-view-${post.id}`}>
              <a href={`/blog/${post.slug}`} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={16} /> View live
              </a>
            </DropdownMenuItem>
            <ConfirmDialog
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} data-testid={`blog-action-unpublish-${post.id}`}>
                  <Icon name="eyeOff" size={16} /> Unpublish
                </DropdownMenuItem>
              }
              title={`Unpublish "${post.title}"?`}
              description="The article disappears from the public blog and the sitemap immediately. Its URL will return 404 until republished."
              confirmLabel="Unpublish"
              onConfirm={() => onSetStatus(post, "draft")}
            />
          </>
        ) : (
          <DropdownMenuItem onSelect={() => onSetStatus(post, "published")} data-testid={`blog-action-publish-${post.id}`}>
            <Icon name="rocket" size={16} /> Publish
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <ConfirmDialog
          trigger={
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => e.preventDefault()}
              data-testid={`blog-action-delete-${post.id}`}
            >
              <Icon name="trash" size={16} /> Delete
            </DropdownMenuItem>
          }
          title={`Delete "${post.title}"?`}
          description="This permanently removes the article. If it was published, its URL will return 404 — consider unpublishing instead if you might bring it back."
          confirmLabel="Delete article"
          onConfirm={() => onDelete(post)}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Page ─────────────────────────────────────────────────────────── */

export default function AdminBlogPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [search, setSearch] = React.useState("");

  const postsQ = useQuery({ queryKey: ["admin", "blog"], queryFn: () => listAdminBlogPosts() });
  const posts = React.useMemo(() => postsQ.data ?? [], [postsQ.data]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin", "blog"] });
  const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Something went wrong");

  const createM = useMutation({
    mutationFn: createAdminBlogPost,
    onSuccess: (p) => {
      invalidate();
      toast.success(`Draft "${p.title}" saved`);
    },
    onError,
  });
  const updateM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<BlogPostInput> & { status?: AdminBlogPost["status"] } }) =>
      updateAdminBlogPost(id, patch),
    onSuccess: (p) => {
      invalidate();
      toast.success(p.status === "published" ? `"${p.title}" is live` : `"${p.title}" updated`);
    },
    onError,
  });
  const deleteM = useMutation({
    mutationFn: deleteAdminBlogPost,
    onSuccess: () => {
      invalidate();
      toast.success("Article deleted");
    },
    onError,
  });

  async function handleCreate(input: BlogPostInput) {
    await createM.mutateAsync(input);
  }
  async function handleEdit(id: string, input: BlogPostInput) {
    await updateM.mutateAsync({ id, patch: input });
  }

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.slug.includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [posts, statusFilter, search]);

  const publishedCount = posts.filter((p) => p.status === "published").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Content"
        title="Blog"
        description="Write, optimise and publish articles. Published posts appear on /blog, in the sitemap, and carry their own SEO meta tags."
      >
        <PostEditor
          onSubmit={handleCreate}
          trigger={
            <Button variant="gradient" className="group" data-testid="blog-create-btn">
              <Icon name="plus" size={16} className="text-white" />
              New article
            </Button>
          }
        />
      </PageHeader>

      <QueryBoundary isLoading={postsQ.isLoading} error={postsQ.error} onRetry={() => void postsQ.refetch()}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Articles" value={String(posts.length)} icon="fileText" hint="All statuses" testId="blog-stat-total" />
          <StatCard label="Published" value={String(publishedCount)} icon="rocket" hint="Live on /blog" testId="blog-stat-published" />
          <StatCard label="Drafts" value={String(posts.length - publishedCount)} icon="edit" hint="Not yet public" testId="blog-stat-drafts" />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Search title, slug or tag…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="sm:max-w-xs"
            data-testid="blog-search-input"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="sm:w-44" data-testid="blog-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon="fileText"
            title={posts.length === 0 ? "No articles yet" : "No articles match your filters"}
            description={
              posts.length === 0
                ? "Content is the biggest SEO lever — write the first guide and publish it."
                : "Try a different status or clear your search."
            }
            testId="blog-empty-state"
          >
            {posts.length === 0 && (
              <PostEditor
                onSubmit={handleCreate}
                trigger={
                  <Button variant="gradient" data-testid="blog-empty-create-btn">
                    <Icon name="plus" size={16} className="text-white" /> Write the first article
                  </Button>
                }
              />
            )}
          </EmptyState>
        ) : (
          <Card className="overflow-hidden">
            <Table data-testid="blog-posts-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead className="hidden md:table-cell">Tags</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">Published</TableHead>
                  <TableHead className="hidden lg:table-cell">Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id} data-testid={`blog-row-${p.id}`}>
                    <TableCell className="max-w-72">
                      <p className="truncate font-medium" data-testid={`blog-row-title-${p.id}`}>{p.title}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">/blog/{p.slug}</p>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {p.tags.slice(0, 3).map((t) => (
                          <Badge key={t} variant="secondary" className="text-xs">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={p.status === "published" ? "success" : "secondary"}
                        data-testid={`blog-row-status-${p.id}`}
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {p.published_at ? formatDate(p.published_at) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {formatDate(p.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        post={p}
                        onEdit={handleEdit}
                        onSetStatus={(post, status) => updateM.mutate({ id: post.id, patch: { status } })}
                        onDelete={(post) => deleteM.mutate(post.id)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </QueryBoundary>
    </div>
  );
}
