import PageTransition from '@/components/motion/PageTransition';

export default function CabinetTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
