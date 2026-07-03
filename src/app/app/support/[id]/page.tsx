import { TicketDetail } from "./ticket-detail";

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetail ticketNumber={decodeURIComponent(id)} />;
}
