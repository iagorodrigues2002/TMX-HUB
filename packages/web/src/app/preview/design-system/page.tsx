import { DesignSystemReference } from '@/components/design-system/reference';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TMX · Design system em revisão',
  robots: { index: false, follow: false },
};

export default function DesignSystemReferencePage() {
  return <DesignSystemReference />;
}
