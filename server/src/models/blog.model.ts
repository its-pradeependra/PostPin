import { type InferSchemaType, Schema, model } from "mongoose";
import { baseOptions } from "./_base.js";

/** blogposts — platform-authored marketing/SEO articles (global, not tenant-scoped). */
const blogPostSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    excerpt: { type: String, required: true, trim: true, maxlength: 400 },
    content: { type: String, required: true }, // markdown
    coverImage: { type: String, default: null },
    tags: { type: [String], default: [] },
    // Per-post SEO overrides. Fall back to title/excerpt when empty.
    metaTitle: { type: String, default: null, maxlength: 160 },
    metaDescription: { type: String, default: null, maxlength: 320 },
    metaKeywords: { type: [String], default: [] },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    publishedAt: { type: Date, default: null },
    authorName: { type: String, required: true, trim: true },
    readingTimeMins: { type: Number, default: 1 },
    schemaVersion: { type: Number, default: 1 },
  },
  baseOptions,
);

blogPostSchema.index({ slug: 1 }, { unique: true });
blogPostSchema.index({ status: 1, publishedAt: -1 });
blogPostSchema.index({ tags: 1, status: 1 });

export type BlogPost = InferSchemaType<typeof blogPostSchema>;
export const BlogPostModel = model("BlogPost", blogPostSchema);
