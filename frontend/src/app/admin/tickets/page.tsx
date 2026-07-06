import { PageHeader } from "@/components/shared/page-header";
import { TicketsQueue } from "./tickets-queue";

export default function AdminTicketsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Tickets queue"
        description="Triage, assign and resolve support tickets across every tenant."
      />

      <TicketsQueue />
    </div>
  );
}
