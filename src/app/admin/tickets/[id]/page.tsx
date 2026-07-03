import { TicketWorkspace } from "./ticket-workspace";

export default async function AdminTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketWorkspace ticketNumber={decodeURIComponent(id)} />;
}
