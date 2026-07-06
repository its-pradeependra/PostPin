import { ImageResponse } from "next/og";
import { fetchBlogPost } from "@/lib/blog";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";

const size = { width: 1200, height: 630 };

/**
 * Per-post share image at the stable URL /blog/<slug>/og — article title on the
 * brand gradient. Referenced from the post's openGraph metadata.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchBlogPost(slug);
  const title = post?.title ?? `${site.name} Blog`;
  const author = post?.author_name ?? site.name;
  const mins = post?.reading_time_mins;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #db2777 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 34, fontWeight: 700 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 52,
              height: 52,
              borderRadius: 14,
              background: "rgba(255,255,255,0.18)",
            }}
          >
            P
          </div>
          {site.name} · Blog
        </div>

        <div
          style={{
            fontSize: title.length > 70 ? 56 : 68,
            fontWeight: 800,
            lineHeight: 1.12,
            maxWidth: 1020,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, opacity: 0.85 }}>
          <div>{`${author}${mins ? ` · ${mins} min read` : ""}`}</div>
          <div>{`${new URL(site.url).host}/blog`}</div>
        </div>
      </div>
    ),
    size,
  );
}
