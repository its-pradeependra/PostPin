"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  className?: string;
  label?: string;
  testId?: string;
  toastMessage?: string;
}

export function CopyButton({
  value,
  className,
  label,
  testId,
  toastMessage = "Copied to clipboard",
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(toastMessage);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — try selecting the text");
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      data-testid={testId ?? "copy-btn"}
      aria-label={label ?? "Copy"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "check" : "copy"}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="inline-flex"
        >
          {copied ? (
            <Check className="size-3.5 text-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </motion.span>
      </AnimatePresence>
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}
