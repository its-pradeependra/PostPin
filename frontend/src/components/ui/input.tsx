import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, onWheel, onKeyDown, ...props }: React.ComponentProps<"input">) {
  const isNumber = type === "number";

  const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
    if (isNumber) {
      // Blur so the wheel scrolls the page instead of changing the value
      e.currentTarget.blur();
    }
    onWheel?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isNumber && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
    }
    onKeyDown?.(e);
  };

  return (
    <input
      type={type}
      data-slot="input"
      onWheel={handleWheel}
      onKeyDown={handleKeyDown}
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors",
        "placeholder:text-muted-foreground",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30",
        isNumber &&
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
