import Link from "next/link";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/icons";
import { fetchBlogPosts, type BlogPostSummary } from "@/lib/blog";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Blog — Shipping, Logistics & API Engineering in India",
  description:
    "Guides and deep dives on shipping rate calculation, pincode data, courier logistics and API engineering for Indian ecommerce — from the Postpin team.",
  path: "/blog",
  keywords: [
    "shipping blog India",
    "how to calculate shipping charges",
    "ecommerce logistics guides",
    "shipping API tutorials",
  ],
});

// Rendered on demand so newly published posts appear immediately.
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

function PostCard({ post, featured }: { post: BlogPostSummary; featured?: boolean }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block" data-testid={`blog-card-${post.slug}`}>
      <Card className={`h-full overflow-hidden transition-shadow hover:shadow-lg ${featured ? "md:grid md:grid-cols-2" : ""}`}>
        {post.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.cover_image}
            alt={post.title}
            loading="lazy"
            data-testid={`blog-card-cover-${post.slug}`}
            className={`w-full object-cover ${featured ? "h-full min-h-56" : "aspect-video"}`}
          />
        ) : (
          <div className={`flex items-center justify-center bg-brand-gradient ${featured ? "min-h-56" : "aspect-video"}`}>
            <Icon name="zap" size={40} className="text-white/80" />
          </div>
        )}
        <div className="flex h-full flex-col gap-3 p-6">
          <div className="flex flex-wrap gap-2">
            {post.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" data-testid={`blog-card-tag-${post.slug}-${tag}`}>
                {tag}
              </Badge>
            ))}
          </div>
          <h2
            className={`font-display font-bold leading-snug group-hover:text-primary ${featured ? "text-2xl" : "text-lg"}`}
            data-testid={`blog-card-title-${post.slug}`}
          >
            {post.title}
          </h2>
          <p className="line-clamp-3 text-sm text-muted-foreground" data-testid={`blog-card-excerpt-${post.slug}`}>
            {post.excerpt}
          </p>
          <div className="mt-auto flex items-center gap-3 pt-2 text-xs text-muted-foreground">
            <span data-testid={`blog-card-author-${post.slug}`}>{post.author_name}</span>
            <span aria-hidden>·</span>
            <time dateTime={post.published_at} data-testid={`blog-card-date-${post.slug}`}>
              {dateFmt.format(new Date(post.published_at))}
            </time>
            <span aria-hidden>·</span>
            <span data-testid={`blog-card-readtime-${post.slug}`}>{post.reading_time_mins} min read</span>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default async function BlogPage() {
  const { posts } = await fetchBlogPosts();
  const [featured, ...rest] = posts;

  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6" data-testid="blog-page-container">
      <header className="mx-auto max-w-2xl text-center">
        <Badge variant="outline" className="mb-4">
          <Icon name="rocket" size={14} className="mr-1" /> Blog
        </Badge>
        <h1 className="text-balance font-display text-4xl font-bold tracking-tight sm:text-5xl" data-testid="blog-page-heading">
          Shipping, logistics &amp; API engineering
        </h1>
        <p className="mt-4 text-pretty text-muted-foreground">
          Guides and deep dives on shipping rate calculation, pincode data and courier logistics for
          Indian ecommerce — written by the team building Postpin.
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="mx-auto mt-16 max-w-md text-center text-muted-foreground" data-testid="blog-empty-state">
          <Icon name="clock" size={32} className="mx-auto mb-3 opacity-60" />
          <p>No articles published yet — we&apos;re writing the first ones now. Check back soon.</p>
        </div>
      ) : (
        <div className="mt-14 space-y-10">
          {featured && <PostCard post={featured} featured />}
          {rest.length > 0 && (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-testid="blog-post-grid">
              {rest.map((post) => (
                <PostCard key={post.slug} post={post} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
