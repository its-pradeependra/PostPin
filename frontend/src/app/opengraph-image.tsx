import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

export const alt = `${site.name} — Shipping Calculation API for India`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          background: "linear-gradient(135deg, #7c3aed 0%, #9333ea 50%, #db2777 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(255,255,255,0.18)",
              fontSize: 40,
              fontWeight: 700,
            }}
          >
            P
          </div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>{site.name}</div>
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
