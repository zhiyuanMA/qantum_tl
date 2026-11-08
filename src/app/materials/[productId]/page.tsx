import { catalogueProductIds } from '@/adapters/composition';
import { MaterialEscalationView } from '@/components/MaterialEscalationView';

export const dynamicParams = false;

export function generateStaticParams() {
  return catalogueProductIds().map((productId) => ({ productId }));
}

export default async function MaterialPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return <MaterialEscalationView productId={productId} />;
}
