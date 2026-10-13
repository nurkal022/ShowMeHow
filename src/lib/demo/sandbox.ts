import crypto from 'node:crypto';
import { db } from '../db/client';
import { createLoginUser, type AuthUser } from '../auth/users';
import { addMember, createOrganization } from '../org/orgs';
import { addToGroup, assignTeacher, createGroup } from '../org/groups';
import { candidateLogin } from '../org/roster';
import { setTopicDue } from '../lms/courses';
import { sandboxOf, type Sandbox } from './access';
import {
  buildChemistry, buildCourse, buildInformatics, demoSimulation, liveThrough, rng, type Built, type Kid,
} from '../../../scripts/seed-showcase';
import { buildBiology } from '../../../scripts/seed-demo';
import { fillResearch } from '../../../scripts/seed-research';

/**
 * Личный демо-университет для тех, кто пришёл посмотреть: четыре курса, три преподавателя,
 * две группы студентов с «прожитой» учёбой, работы на проверке и три исследовательских проекта.
 * Сам человек — руководство; преподаватели и студенты — служебные аккаунты без известного пароля,
 * их глазами он смотрит через «Демо-режим». Данные свои у каждого — тестеры не мешают друг другу.
 */

const TEACHERS: [string, string][] = [['Нурпеисова', 'Асель'], ['Ибраев', 'Марат'], ['Тихонова', 'Ольга']];
const GROUPS: [string, [string, string][]][] = [
  ['ФИЗ-21', [['Абишев', 'Данияр'], ['Громова', 'Вера'], ['Ермек', 'Асем'], ['Крылов', 'Никита'], ['Оспанова', 'Лейла']]],
  ['ИС-22', [['Байжанов', 'Ержан'], ['Зайцева', 'Ника'], ['Мирзоев', 'Руслан'], ['Савельева', 'Дарья'], ['Турсын', 'Алишер']]],
];

const pending = new Map<string, Promise<Sandbox>>();

/** Создаёт песочницу один раз; повторный вызов (двойной клик, гонка) вернёт ту же. */
export function ensureSandbox(user: AuthUser): Promise<Sandbox> {
  const running = pending.get(user.id);
  if (running) return running;
  const job = build(user).finally(() => pending.delete(user.id));
  pending.set(user.id, job);
  return job;
}

async function person(last: string, first: string, slug: string, firstNameFirst = false): Promise<AuthUser> {
  return createLoginUser({
    // Преподаватель — «Имя Фамилия» (приветствие берёт первое слово), студент — как в списке группы.
    login: candidateLogin(last, first, slug, 1), displayName: firstNameFirst ? `${first} ${last}` : `${last} ${first}`,
    // Пароль никому не известен: войти можно только «глазами» из демо-режима владельца.
    password: crypto.randomBytes(18).toString('base64url'), mustChangePassword: false,
  });
}

async function build(user: AuthUser): Promise<Sandbox> {
  const existing = await sandboxOf(user.id);
  if (existing) return existing;
  const slug = `demo-${crypto.randomBytes(4).toString('hex')}`;
  const org = await createOrganization({ slug, name: 'Демо-университет', kind: 'university' });
  await db().query('UPDATE organizations SET sandbox_owner = $2 WHERE id = $1', [org.id, user.id]);
  await addMember(org.id, user.id, 'org_admin');

  const [physics, cs, science] = await Promise.all(TEACHERS.map(([l, f]) => person(l, f, slug, true)));
  for (const t of [physics, cs, science]) await addMember(org.id, t.id, 'teacher');

  const groups: { id: string; title: string }[] = [];
  const kids: Kid[] = [];
  for (const [title, roster] of GROUPS) {
    const g = await createGroup(org.id, title);
    for (const t of [physics, cs, science]) await assignTeacher(g.id, t.id);
    groups.push({ id: g.id, title });
    for (const [last, first] of roster) {
      const kid = await person(last, first, slug);
      await addMember(org.id, kid.id, 'student');
      await addToGroup(g.id, kid.id);
      const r = rng(`${last}${first}`);
      kids.push({ user: kid, login: kid.login ?? '', password: '', group: title, diligence: 0.45 + r() * 0.55, skill: 0.4 + r() * 0.6 });
    }
  }

  const sims = {
    pendulum: await demoSimulation(physics.id, 'pendulum'),
    interference: await demoSimulation(physics.id, 'interference'),
    refraction: await demoSimulation(physics.id, 'refraction'),
    diffusion: await demoSimulation(science.id, 'diffusion'),
    osmosis: await demoSimulation(science.id, 'osmosis'),
  };
  const all = groups.map((g) => g.id);
  const plan: [() => Promise<Built>, string, Kid[]][] = [
    [() => buildCourse(org.id, physics.id, all, sims), physics.id, kids],
    [() => buildInformatics(org.id, cs.id, [groups[1].id]), cs.id, kids.filter((k) => k.group === groups[1].title)],
    [() => buildChemistry(org.id, science.id, all), science.id, kids],
    [() => buildBiology(org.id, science.id, all, sims), science.id, kids],
  ];
  for (const [make, owner, audience] of plan) {
    const built = await make();
    if (built.topics[1]) await setTopicDue(built.topics[1].id, new Date(Date.now() + 2 * 86_400_000).toISOString());
    if (built.topics[3]) await setTopicDue(built.topics[3].id, new Date(Date.now() + 6 * 86_400_000).toISOString());
    await liveThrough(built, audience, owner);
  }
  // Сиды писались для школы: «Физика 8: …» → «Физика: …».
  await db().query(`UPDATE courses SET title = regexp_replace(title, '\\s+\\d+:', ':') WHERE org_id = $1`, [org.id]);
  const research = await db().query('SELECT 1 FROM research_projects WHERE owner_id = $1 LIMIT 1', [user.id]);
  if (!research.rowCount) await fillResearch(user);
  return { orgId: org.id, slug, name: org.name };
}
