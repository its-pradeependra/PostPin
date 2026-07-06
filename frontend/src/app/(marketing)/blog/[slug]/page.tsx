import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { fetchBlogPost, fetchBlogPosts, renderMarkdown } from "@/lib/blog";
import { articleJsonLd, pageMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

// Rendered on demand so publishing/unpublishing takes effect immediately.
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

/** SEO: per-post meta from the admin-authored fields, falling back to title/excerpt. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  if (!post) return { title: "Article not found", robots: { index: false, follow: false } };
  const base = pageMetadata({
    title: post.meta_title ?? post.title,
    description: post.meta_description ?? post.excerpt,
    path: `/blog/${post.slug}`,
    keywords: [...post.meta_keywords, ...post.tags],
  });
  const ogImage = post.cover_image ?? `${site.url}/blog/${post.slug}/og`;
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: "article",
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      authors: [post.author_name],
      images: [{ url: ogImage, width: 1200, height: 630, alt: post.title }],
    },
    twitter: { ...base.twitter, images: [ogImage] },
  };
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

export default async function BlogPostPage({ params }: Params) {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  if (!post) notFound();

  const html = renderMarkdown(post.content);
  const { posts } = await fetchBlogPosts();
  const related = posts.filter((p) => p.slug !== post.slug).slice(0, 3);

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6" data-testid={`blog-post-${post.slug}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(post)) }}
      />

      <nav className="mb-8 text-sm" data-testid="blog-post-breadcrumb">
        <Link href="/blog" className="text-muted-foreground hover:text-foreground">
          ← All articles
        </Link>
      </nav>

      <header>
        <div className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Badge key={tag} variant="secondary" data-testid={`blog-post-tag-${tag}`}>
              {tag}
            </Badge>
          ))}
        </div>
        <h1
          className="mt-4 text-balance font-display text-3xl font-bold tracking-tight sm:text-[2.6rem] sm:leading-tight"
          data-testid="blog-post-title"
        >
          {post.title}
        </h1>
        <p className="mt-4 text-pretty text-lg text-muted-foreground" data-testid="blog-post-excerpt">
          {post.excerpt}
        </p>
        <div className="mt-6 flex items-center gap-3 border-y py-4 text-sm text-muted-foreground">
          <div className="grid size-9 place-items-center rounded-full bg-brand-gradient font-display text-sm font-bold text-white">
            {post.author_name.slice(0, 1)}
          </div>
          <span className="font-medium text-foreground" data-testid="blog-post-author">
            {post.author_name}
          </span>
          <span aria-hidden>·</span>
          <time dateTime={post.published_at} data-testid="blog-post-date">
            {dateFmt.format(new Date(post.published_at))}
          </time>
          <span aria-hidden>·</span>
          <span data-testid="blog-post-readtime">{post.reading_time_mins} min read</span>
        </div>
      </header>

      {post.cover_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={post.cover_image}
          alt={post.title}
          data-testid="blog-post-cover"
          className="mt-8 aspect-video w-full rounded-xl object-cover"
        />
      )}

      <div
        data-testid="blog-post-content"
        className="mt-10 space-y-5 leading-relaxed [&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mt-8 [&_h3]:font-display [&_h3]:text-xl [&_h3]:font-semibold [&_h4]:mt-6 [&_h4]:font-semibold [&_hr]:my-8 [&_img]:rounded-xl [&_li]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-6 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-6"
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <aside className="mt-14 rounded-2xl bg-brand-gradient p-8 text-white" data-testid="blog-post-cta">
        <h2 className="font-display text-2xl font-bold">Price a parcel in one API call</h2>
        <p className="mt-2 text-white/85">
          {site.name} calculates shipping charges between any two Indian pincodes — free tier, no
          credit card.
        </p>
        <Button asChild variant="secondary" className="mt-5" data-testid="blog-post-cta-btn">
          <Link href="/signup">Get your free API key</Link>
        </Button>
      </aside>

      {related.length > 0 && (
        <footer className="mt-14 border-t pt-10">
          <h2 className="font-display text-xl font-bold">Keep reading</h2>
          <ul className="mt-4 space-y-3" data-testid="blog-post-related">
            {related.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/blog/${p.slug}`}
                  className="group flex items-center gap-2 text-muted-foreground hover:text-foreground"
                  data-testid={`blog-related-link-${p.slug}`}
                >
                  <Icon name="external" size={14} className="shrink-0 opacity-60" />
                  <span className="group-hover:underline">{p.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </article>
  );
}
