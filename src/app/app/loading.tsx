import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" data-testid="app-loading">
      {/* PageHeader */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-36 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`stat-${i}`} className="p-5" data-testid={`app-loading-stat-${i}`}>
            <div className="flex items-start justify-between">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
          </Card>
        ))}
      </div>

      {/* Chart + side card */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2" data-testid="app-loading-chart">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-6 h-[260px] w-full rounded-xl" />
        </Card>

        <Card className="flex flex-col p-5" data-testid="app-loading-side-card">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <div className="mt-6 space-y-3">
            <div className="flex items-baseline justify-between">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-2.5 w-full rounded-full" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="mt-6 h-16 w-full rounded-xl" />
          <Skeleton className="mt-6 h-10 w-full rounded-lg" />
        </Card>
      </div>

      {/* Table */}
      <Card className="p-6" data-testid="app-loading-table">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
        <div className="mt-6 space-y-3">
          {/* header row */}
          <div className="hidden grid-cols-6 gap-4 border-b border-border pb-3 md:grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={`th-${i}`} className="h-4 w-full max-w-[80px]" />
            ))}
          </div>
          {/* body rows */}
          {Array.from({ length: 6 }).map((_, r) => (
            <div
              key={`row-${r}`}
              data-testid={`app-loading-row-${r}`}
              className="grid grid-cols-2 gap-4 md:grid-cols-6"
            >
              {Array.from({ length: 6 }).map((_, c) => (
                <Skeleton
                  key={`cell-${r}-${c}`}
                  className={c >= 2 ? "hidden h-5 w-full md:block" : "h-5 w-full"}
                />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
