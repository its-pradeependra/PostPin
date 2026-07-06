/**
 * Blog data access (server components) + a small, safe markdown renderer.
 * Content is authored by platform staff in the admin console; we still escape
 * all HTML before applying markdown rules.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";

export interface BlogPostSummary {
  title: string;
  slug: string;
  excerpt: string;
  cover_image: string | null;
  tags: string[];
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string[];
  published_at: string;
  updated_at: string;
  author_name: string;
  reading_time_mins: number;
}

export interface BlogPost extends BlogPostSummary {
  content: string;
}

export async function fetchBlogPosts(): Promise<{ posts: BlogPostSummary[]; total: number }> {
  try {
    const res = await fetch(`${API_BASE}/public/blog?limit=50`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const j = (await res.json()) as { data: BlogPostSummary[]; meta?: { total?: number } };
    return { posts: j.data ?? [], total: j.meta?.total ?? j.data?.length ?? 0 };
  } catch {
    return { posts: [], total: 0 };
  }
}

export async function fetchBlogPost(slug: string): Promise<BlogPost | null> {
  try {
    const res = await fetch(`${API_BASE}/public/blog/${slug}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { data: BlogPost };
    return j.data ?? null;
  } catch {
    return null;
  }
}

export async function fetchBlogSitemap(): Promise<{ slug: string; published_at: string; updated_at: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/public/blog/sitemap`, { cache: "no-store" });
    if (!res.ok) return [];
    const j = (await res.json()) as { data: { slug: string; published_at: string; updated_at: string }[] };
    return j.data ?? [];
  } catch {
    return [];
  }
}

/* ── Markdown (safe subset) ─────────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) and site-relative URLs survive; everything else is dropped. */
function safeUrl(url: string): string | null {
  const u = url.trim();
  if (/^(https?:\/\/|\/)/i.test(u)) return u;
  return null;
}

function inline(md: string): string {
  let s = escapeHtml(md);
  // images before links: ![alt](src)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => {
    const u = safeUrl(src);
    return u ? `<img src="${u}" alt="${alt}" loading="lazy" />` : alt;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
    const u = safeUrl(href);
    return u ? `<a href="${u}"${u.startsWith("/") ? "" : ' target="_blank" rel="noopener noreferrer"'}>${text}</a>` : text;
  });
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s;
}

/**
 * Render a markdown subset to HTML: h2–h4, paragraphs, bold/italic/code,
 * links, images, ordered/unordered lists, blockquotes, fenced code, hr.
 */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;
  let code: string[] | null = null;
  let quote: string[] = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.tag}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote><p>${inline(quote.join(" "))}</p></blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (code !== null) {
      if (/^```/.test(line)) {
        out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = null;
      } else code.push(raw);
      continue;
    }
    if (/^```/.test(line)) {
      flushAll();
      code = [];
      continue;
    }

    const heading = /^(#{2,4})\s+(.*)$/.exec(line);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushAll();
      out.push("<hr />");
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      flushPara();
      flushQuote();
      if (!list || list.tag !== "ul") {
        flushList();
        list = { tag: "ul", items: [] };
      }
      list.items.push(inline(ul[1]));
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      flushPara();
      flushQuote();
      if (!list || list.tag !== "ol") {
        flushList();
        list = { tag: "ol", items: [] };
      }
      list.items.push(inline(ol[1]));
      continue;
    }
    const bq = /^>\s?(.*)$/.exec(line);
    if (bq) {
      flushPara();
      flushList();
      quote.push(bq[1]);
      continue;
    }
    if (line.trim() === "") {
      flushAll();
      continue;
    }
    flushList();
    flushQuote();
    para.push(line.trim());
  }
  if (code !== null) out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushAll();
  return out.join("\n");
}
