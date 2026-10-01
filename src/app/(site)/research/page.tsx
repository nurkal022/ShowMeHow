import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/page-guard';
import { listMemberships } from '@/lib/org/access';
import { canGenerate } from '@/lib/org/policy';
import { listItems, listProjects } from '@/lib/research/store';
import { listSimulations } from '@/lib/storage';
import { itemCards } from '@/lib/research/cards';
import { listArticles } from '@/lib/research/articles-store';
import ResearchHub from '@/components/research/ResearchHub';
import { getLocale } from '@/i18n/server';

/** Рабочее место исследователя — тем, кто может создавать (ученику без права генерации — 404). */
export default async function ResearchPage() {
  const user = await requirePageUser('/research');
  if (!user) return null;
  if (!canGenerate(user, await listMemberships(user.id))) notFound();
  const [projects, items, sims, articles] = await Promise.all([
    listProjects(user.id), listItems(user.id), listSimulations(user.id), listArticles(user.id),
  ]);
  const cards = itemCards(items, projects, await getLocale());
  return (
    <ResearchHub items={cards} articles={articles}
      projects={projects.map((p) => {
        const own = articles.filter((a) => a.projectId === p.id);
        return {
          ...p, articles: own.length, words: own.reduce((n, a) => n + a.words, 0),
          thumbs: cards.filter((c) => c.projectId === p.id && c.thumb).slice(0, 3).map((c) => c.thumb!),
        };
      })}
      sims={sims.filter((s) => !s.demo).map((s) => ({ id: s.id, title: s.title }))} />
  );
}
