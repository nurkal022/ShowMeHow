import SiteChrome from '@/components/SiteChrome';

/** Публичный сайт и раздел студента: верхняя шапка с разделами. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
