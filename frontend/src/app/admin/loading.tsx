import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6" data-testid="admin-loading">
      {/* PageHeader */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-lg" />
        </div>
      </div>

      {/* KPI stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={`stat-${i}`} className="p-5" data-testid={`admin-loading-stat-${i}`}>
            <div className="flex items-start justify-between">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <div className="mt-4 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-3 w-28" />
            </div>
          </Card>
        ))}
      </div>

      {/* Revenue chart + secondary panel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2" data-testid="admin-loading-chart">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-6 h-[260px] w-full rounded-xl" />
        </Card>

        <Card className="p-6" data-testid="admin-loading-side-chart">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-44" />
          </div>
          <Skeleton className="mt-6 h-[180px] w-full rounded-xl" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={`legend-${i}`} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-3 rounded-full" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Table */}
      <Card className="p-6" data-testid="admin-loading-table">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <Skeleton className="h-8 w-24 rounded-lg" />
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
              data-testid={`admin-loading-row-${r}`}
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
