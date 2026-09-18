'use client';
import { useRouter } from 'next/navigation';
import { withOrgParam } from '@/lib/lms/links';
import GroupRowMenu from './GroupRowMenu';

/** Действия в шапке карточки группы: то же меню, что в строке списка; после архива — назад к списку. */
export default function GroupAdminActions({ slug, groupId, title }: { slug: string; groupId: string; title: string }) {
  const router = useRouter();
  return (
    <GroupRowMenu slug={slug} groupId={groupId} title={title}
      onArchived={() => router.push(withOrgParam('/org/groups', slug))} />
  );
}
