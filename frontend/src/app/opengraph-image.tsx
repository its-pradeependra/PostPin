import { readFileSync } from "fs";
import { join } from "path";
import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = `${site.name} — Shipping Calculation API for India`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Inlined so generation never depends on fetching our own origin.
// Logo is 1774×506 (≈3.5:1); dark wordmark → rendered on a white chip.
const logoSrc = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "logo.png")).toString("base64")}`;

/** Default social share image for every page (blog posts override with their own). */
export default function OgImage() {
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
          background: "linear-gradient(135deg, #17253b 0%, #1e3049 55%, #0b1322 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              background: "#ffffff",
              borderRadius: 20,
              padding: "16px 26px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoSrc} alt={site.name} width={280} height={80} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.1, maxWidth: 980 }}>
            The Shipping Calculation API for India
          </div>
          <div style={{ fontSize: 32, opacity: 0.9, maxWidth: 900 }}>
            Accurate shipping charges between any two Indian pincodes — one API call.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, opacity: 0.85 }}>
          <div>{new URL(site.url).host}</div>
          <div>1,57,000+ pincodes · &lt;50ms · 99.9% uptime</div>
        </div>
      </div>
    ),
    size,
  );
}
