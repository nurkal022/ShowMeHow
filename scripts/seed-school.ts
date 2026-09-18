import { closeDb, db } from '../src/lib/db/client';
import {
  createLoginUser, createUser, findUserByIdentifier, setTemporaryPassword, updatePassword, updateProfile,
  type AuthUser,
} from '../src/lib/auth/users';
import { generateTempPassword } from '../src/lib/auth/temp-password';
import { addMember, createOrganization, findOrgBySlug } from '../src/lib/org/orgs';
import { addToGroup, assignTeacher, createGroup, findGroupByTitle, listGroups } from '../src/lib/org/groups';
import { savePendingCredential } from '../src/lib/org/credentials';
import { candidateLogin } from '../src/lib/org/roster';
import { orgRoleOf } from '../src/lib/org/access';
import { setPlatformRole } from '../src/lib/admin/users';
import { bundledThumbnail, listBundledDemos } from '../src/lib/demos';
import { instrument } from '../src/lib/artifact';
import { createSimulation, saveThumbnail } from '../src/lib/storage';
import { createCourse, createTopic, setCourseGroups, setCourseStatus } from '../src/lib/lms/courses';
import { createBlock, updateBlock } from '../src/lib/lms/blocks';
import type { BlockKind } from '../src/lib/lms/block-schema';
import { OrgError } from '../src/lib/org/types';

/**
 * Тестовая школа для ручной проверки B2B-части (спецификация §10).
 * Взрослым ставится известный пароль, ученикам — временные, как в жизни.
 * Повторный запуск ничего не дублирует и заново выдаёт пароли.
 *
 * Второй режим — `--org <слаг> --teacher <логин-или-почта>`: организация и люди
 * уже есть (например, боевая «Демо-школа»), нужен только показательный курс.
 * В этом режиме скрипт никого не заводит и паролей не трогает и не печатает.
 */

export const SEED_PASSWORD = 'tesseract-demo-2026';
export const SEED_COURSE_TITLE = 'Физика 7: механика';
export const SEED_STUDENTS: readonly (readonly [string, string])[] = [
  ['Иванов', 'Иван'],
  ['Петрова', 'Анна'],
  ['Сидоров', 'Пётр'],
];

export function refuseInProduction(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('seed:school заводит тестовые аккаунты с известными паролями и в продакшне не запускается.');
  }
}

async function staffUser(email: string, name: string): Promise<AuthUser> {
  const user = (await findUserByIdentifier(email)) ?? await createUser(email, SEED_PASSWORD);
  await updatePassword(user.id, SEED_PASSWORD);
  await updateProfile(user.id, { displayName: name });
  await db().query('UPDATE users SET disabled_at = NULL WHERE id = $1', [user.id]);
  return user;
}

/** Маятник из встроенных примеров — в библиотеку учителя, если его там ещё нет. */
async function pendulumFor(ownerId: string): Promise<string> {
  const { rows } = await db().query<{ id: string }>(
    "SELECT id FROM simulations WHERE owner_id = $1 AND demo = 'pendulum'", [ownerId]);
  if (rows[0]) return rows[0].id;
  const demo = listBundledDemos().find((d) => d.slug === 'pendulum');
  if (!demo) throw new Error('Встроенный пример «pendulum» не найден в каталоге demos/.');
  const meta = await createSimulation(ownerId,
    { title: demo.title, prompt: demo.prompt, subject: demo.subject, tags: demo.tags, demo: demo.slug },
    instrument(demo.html));
  const thumbnail = bundledThumbnail(demo.slug);
  if (thumbnail) await saveThumbnail(ownerId, meta.id, thumbnail);
  return meta.id;
}

/**
 * Тренажёр для блока в чужой, уже живущей организации: сначала библиотека
 * учителя, потом общий каталог. Нет ни того, ни другого — блока просто не будет.
 */
async function existingSimulationFor(ownerId: string): Promise<string | null> {
  const { rows } = await db().query<{ id: string }>(
    `SELECT id FROM simulations WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 1`, [ownerId]);
  if (rows[0]) return rows[0].id;
  const catalog = await db().query<{ id: string }>(
    `SELECT id FROM simulations WHERE visibility = 'catalog' ORDER BY updated_at DESC LIMIT 1`);
  return catalog.rows[0]?.id ?? null;
}

async function addBlock(topicId: string, kind: BlockKind, payload: unknown): Promise<void> {
  const block = await createBlock(topicId, kind);
  await updateBlock(block.id, payload);
}

/**
 * Показательный курс: текст, тренажёр, лаборатория и задания всех трёх видов.
 * simId === null — тренажёрного блока и стенда у задания не будет.
 * Возвращает false, если курс с таким названием в организации уже есть.
 */
async function seedCourse(
  orgId: string, teacherId: string, groupIds: string[], simId: string | null,
): Promise<boolean> {
  const exists = await db().query('SELECT 1 FROM courses WHERE org_id = $1 AND title = $2', [orgId, SEED_COURSE_TITLE]);
  if (exists.rowCount) return false;
  const course = await createCourse({
    orgId, ownerId: teacherId, title: SEED_COURSE_TITLE, subject: 'Физика',
    description: 'Колебания и свет — пробный курс для проверки платформы.',
  });
  const pendulum = await createTopic(course.id, 'Колебания маятника');
  await addBlock(pendulum.id, 'text', {
    title: 'Что такое период',
    body: '## Период\nВремя одного полного колебания называют **периодом**.\n\n'
      + '- Период не зависит от массы груза.\n- Чем длиннее нить, тем *дольше* период.',
  });
  if (simId) {
    await addBlock(pendulum.id, 'simulation', { simulationId: simId, caption: 'Меняйте длину нити и следите за периодом.' });
  }
  await addBlock(pendulum.id, 'assignment', {
    prompt: 'От чего зависит период математического маятника?', points: 10,
    stand: simId ? { kind: 'simulation', simulationId: simId } : null, allowRetry: false,
    spec: { type: 'choice', multiple: false, options: [
      { id: 'len', text: 'От длины нити', correct: true },
      { id: 'mass', text: 'От массы груза', correct: false },
      { id: 'color', text: 'От цвета нити', correct: false },
    ] },
  });
  await addBlock(pendulum.id, 'assignment', {
    prompt: 'Чему равен период маятника длиной 1 м? Ответ округлите до десятых.', points: 10,
    stand: null, allowRetry: true,
    spec: { type: 'number', answer: 2, tolerance: 0.1, unit: 'с' },
  });
  const light = await createTopic(course.id, 'Свет и линзы');
  await addBlock(light.id, 'lab', { slug: 'physics', caption: 'Поставьте линзу на пути луча.' });
  await addBlock(light.id, 'assignment', {
    prompt: 'Опишите, что происходит с белым лучом, когда он проходит через призму.', points: 10,
    stand: { kind: 'lab', slug: 'physics' }, allowRetry: false, spec: { type: 'text' },
  });
  await setCourseGroups(course.id, groupIds, new Set(groupIds));
  await setCourseStatus(course.id, 'published');
  return true;
}

export async function seedSchool(print: (line: string) => void): Promise<void> {
  refuseInProduction();
  const admin = await staffUser('admin@local.test', 'Админ платформы');
  await setPlatformRole(admin.id, 'admin');

  const org = (await findOrgBySlug('sch12')) ?? await createOrganization({ slug: 'sch12', name: 'Школа №12', kind: 'school' });
  await db().query('UPDATE organizations SET archived_at = NULL WHERE id = $1', [org.id]);
  const director = await staffUser('director@local.test', 'Директор Школы №12');
  await addMember(org.id, director.id, 'org_admin');
  const teacher = await staffUser('teacher@local.test', 'Учитель физики');
  await addMember(org.id, teacher.id, 'teacher');

  const group = (await findGroupByTitle(org.id, '7А')) ?? await createGroup(org.id, '7А');
  await assignTeacher(group.id, teacher.id);

  const students: { login: string; password: string }[] = [];
  for (const [last, first] of SEED_STUDENTS) {
    const login = candidateLogin(last, first, org.slug, 1);
    const password = generateTempPassword();
    const found = await findUserByIdentifier(login);
    const user = found ?? await createLoginUser({ login, displayName: `${last} ${first}`, password, mustChangePassword: true });
    if (found) await setTemporaryPassword(found.id, password);
    await addMember(org.id, user.id, 'student');
    await addToGroup(group.id, user.id);
    await savePendingCredential(user.id, password);
    students.push({ login, password });
  }

  const simId = await pendulumFor(teacher.id);
  const created = await seedCourse(org.id, teacher.id, [group.id], simId);

  print('Тестовая школа готова. Адрес: http://localhost:3000');
  print(`Админ платформы:  admin@local.test / ${SEED_PASSWORD}`);
  print(`Админ «Школы №12»: director@local.test / ${SEED_PASSWORD}`);
  print(`Учитель:          teacher@local.test / ${SEED_PASSWORD}`);
  print('Ученики группы 7А (временные пароли, при первом входе система попросит придумать свой):');
  for (const s of students) print(`  ${s.login} / ${s.password}`);
  print(created
    ? `Курс «${SEED_COURSE_TITLE}» создан и открыт группе 7А.`
    : `Курс «${SEED_COURSE_TITLE}» уже был — оставлен как есть.`);
}

/**
 * Режим «организация уже есть»: только курс у названного учителя, открытый всем
 * группам организации. Никого не заводит, паролей не меняет и не печатает,
 * поэтому запрет на продакшн здесь не нужен. Повторный запуск курс не дублирует.
 */
export async function seedDemoCourse(
  print: (line: string) => void, args: { orgSlug: string; teacher: string },
): Promise<void> {
  const org = await findOrgBySlug(args.orgSlug);
  if (!org) throw new OrgError(`Организация «${args.orgSlug}» не найдена.`);
  const teacher = await findUserByIdentifier(args.teacher);
  if (!teacher) throw new OrgError(`Пользователь «${args.teacher}» не найден.`);
  const role = await orgRoleOf(teacher.id, org.id);
  if (role !== 'teacher' && role !== 'org_admin') {
    throw new OrgError(`«${args.teacher}» не учитель организации «${org.slug}».`);
  }

  const groups = await listGroups(org.id);
  const simId = await existingSimulationFor(teacher.id);
  const created = await seedCourse(org.id, teacher.id, groups.map((g) => g.id), simId);

  print(`Организация: ${org.name} (${org.slug}); учитель: ${teacher.displayName ?? teacher.login ?? teacher.email}.`);
  if (created) {
    print(`Курс «${SEED_COURSE_TITLE}» создан, опубликован и открыт группам: `
      + (groups.length ? groups.map((g) => g.title).join(', ') : 'групп в организации нет'));
    print(simId ? 'Блок с тренажёром добавлен.' : 'Тренажёров у учителя и в общем каталоге нет — блок с тренажёром пропущен.');
  } else {
    print(`Курс «${SEED_COURSE_TITLE}» в этой организации уже есть — оставлен как есть.`);
  }
}

/** Разбор аргументов: без флагов — полная тестовая школа. */
export function parseSeedArgs(argv: string[]): { orgSlug: string; teacher: string } | null {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const name = argv[i].slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new OrgError(`У флага --${name} нет значения.`);
    flags[name] = value;
    i++;
  }
  const orgSlug = flags.org?.trim();
  const teacher = flags.teacher?.trim();
  if (!orgSlug && !teacher) return null;
  if (!orgSlug || !teacher) {
    throw new OrgError('Режим существующей организации требует оба флага: --org <слаг> --teacher <логин-или-почта>.');
  }
  return { orgSlug, teacher };
}

export async function runSeedSchool(argv: string[], print: (line: string) => void): Promise<void> {
  const args = parseSeedArgs(argv);
  if (args) await seedDemoCourse(print, args);
  else await seedSchool(print);
}

// Запуск как скрипт: `npm run seed:school`. При импорте из тестов main не вызывается.
if (process.argv[1]?.endsWith('seed-school.ts')) {
  runSeedSchool(process.argv.slice(2), (line) => console.log(line))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
