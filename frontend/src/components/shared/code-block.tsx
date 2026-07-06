"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
  testId?: string;
}

/** Lightweight code block with header, language tag, and copy. */
export function CodeBlock({ code, language = "bash", filename, className, testId }: CodeBlockProps) {
  return (
    <div
      data-testid={testId ?? "code-block"}
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-[#0d0d12] text-zinc-100 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </span>
          {filename && (
            <span className="ml-2 font-mono text-xs text-zinc-400">{filename}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            {language}
          </span>
          <CopyButton
            value={code}
            testId="code-copy-btn"
            className="border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
          />
        </div>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono">{code}</code>
      </pre>
    </div>
  );
}

interface CodeTabsProps {
  tabs: { label: string; language: string; code: string }[];
  className?: string;
  testId?: string;
}

/** Tabbed code block (curl / JS / Python …). */
export function CodeTabs({ tabs, className, testId }: CodeTabsProps) {
  const [active, setActive] = React.useState(0);
  const current = tabs[active];
  return (
    <div
      data-testid={testId ?? "code-tabs"}
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-[#0d0d12] text-zinc-100 shadow-sm",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-2">
        <div className="flex">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              type="button"
              data-testid={`code-tab-${t.label.toLowerCase()}`}
              onClick={() => setActive(i)}
              className={cn(
                "border-b-2 px-3 py-2.5 text-xs font-medium transition-colors",
                i === active
                  ? "border-primary text-white"
                  : "border-transparent text-zinc-400 hover:text-zinc-200",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <CopyButton
          value={current.code}
          testId="code-tabs-copy-btn"
          className="mr-1 border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white"
        />
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed">
        <code className="font-mono">{current.code}</code>
      </pre>
    </div>
  );
}
