import { sampleVisitIds } from '@/adapters/composition';
import { VisitDetailView } from '@/components/VisitDetailView';

export const dynamicParams = false;

export function generateStaticParams() {
  return sampleVisitIds().map((id) => ({ id }));
}

export default async function VisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VisitDetailView visitId={id} />;
}
