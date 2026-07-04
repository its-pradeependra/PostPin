import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { env } from "@/config/env.js";
import { AppError } from "@/lib/errors.js";

/** Local-disk media storage. Files live under UPLOAD_DIR/<category>/ and are
 * served publicly at `${apiBase}/uploads/<category>/<file>`. */

export function uploadRoot(): string {
  return path.isAbsolute(env.UPLOAD_DIR) ? env.UPLOAD_DIR : path.join(process.cwd(), env.UPLOAD_DIR);
}

function apiBase(): string {
  return (env.API_PUBLIC_URL || `http://localhost:${env.PORT}`).replace(/\/+$/, "");
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
};

export const IMAGE_MIMES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
export const ATTACHMENT_MIMES = [...IMAGE_MIMES, "application/pdf", "text/plain", "text/csv"];

export interface SavedFile {
  url: string;
  path: string; // relative to uploadRoot, e.g. "avatars/abc.png"
  size: number;
  mimetype: string;
  original_name: string;
}

export function saveUpload(input: {
  buffer: Buffer;
  mimetype: string;
  originalName: string;
  category: string;
  ownerId: string;
  allowed: string[];
}): SavedFile {
  if (!input.allowed.includes(input.mimetype)) {
    throw AppError.badRequest(`Unsupported file type: ${input.mimetype}`, "unsupported_type");
  }
  if (input.buffer.length === 0) throw AppError.badRequest("Empty file", "empty_file");
  if (input.buffer.length > env.MAX_UPLOAD_BYTES) {
    throw AppError.badRequest(`File exceeds ${(env.MAX_UPLOAD_BYTES / 1e6).toFixed(0)} MB`, "file_too_large");
  }
  const ext = EXT_BY_MIME[input.mimetype] ?? "bin";
  const dir = path.join(uploadRoot(), input.category);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${input.ownerId}-${crypto.randomBytes(8).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(dir, fileName), input.buffer);
  const rel = `${input.category}/${fileName}`;
  return {
    url: `${apiBase()}/uploads/${rel}`,
    path: rel,
    size: input.buffer.length,
    mimetype: input.mimetype,
    original_name: input.originalName,
  };
}

/** Delete a previously-saved file by its public URL (best-effort, sandboxed to uploadRoot). */
export function deleteByUrl(url: string | null | undefined): void {
  if (!url) return;
  const marker = "/uploads/";
  const i = url.indexOf(marker);
  if (i < 0) return;
  const rel = url.slice(i + marker.length);
  const target = path.resolve(uploadRoot(), rel);
  if (!target.startsWith(path.resolve(uploadRoot()))) return; // path-traversal guard
  fs.promises.unlink(target).catch(() => {
    /* already gone — fine */
  });
}
