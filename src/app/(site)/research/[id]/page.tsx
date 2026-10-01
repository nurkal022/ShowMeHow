import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { getItem, listProjects } from '@/lib/research/store';
import ItemEditor from '@/components/research/ItemEditor';

export default async function ResearchItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(`/research/${id}`);
  if (!user) return null;
  const [item, projects] = await Promise.all([getItem(user.id, id), listProjects(user.id)]);
  if (!item) notFound();
  return <ItemEditor item={item} projects={projects.map((p) => ({ id: p.id, title: p.title }))} />;
}
