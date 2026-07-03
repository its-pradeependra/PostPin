import { KeyDetail } from "./key-detail";

export default async function KeyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KeyDetail keyId={id} />;
}
