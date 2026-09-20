import { closeDb, db } from '../src/lib/db/client';
import { createLoginUser, findUserByIdentifier, updatePassword } from '../src/lib/auth/users';
import { addMember, createOrganization, findOrgBySlug, updateOrgSettings } from '../src/lib/org/orgs';
import { addToGroup, assignTeacher, createGroup, findGroupByTitle } from '../src/lib/org/groups';
import { candidateLogin } from '../src/lib/org/roster';
import { createCourse, createTopic, setCourseGroups, setCourseStatus, setTopicDue, setTopicFormat } from '../src/lib/lms/courses';
import type { Block } from '../src/lib/lms/blocks';
import {
  add, buildChemistry, buildCourse, buildInformatics, demoSimulation, liveThrough, rng, staff, task,
  type Built, type Kid,
} from './seed-showcase';

/**
 * Демо-организация для показов: четыре полных курса, три учителя и десять учеников
 * с «прожитой» учёбой. Три курса собираются теми же построителями, что и витрина
 * (scripts/seed-showcase.ts), четвёртый — биология — живёт здесь.
 *
 * Организация помечается флагом demo: админ платформы переключается «Войти как»
 * только между её участниками. Повторный запуск ничего не дублирует.
 */

export const DEMO_PASSWORD = 'demo-2026';
const ORG = { slug: 'demo', name: 'Демо-школа Tesseract', kind: 'school' };
const BIO_TITLE = 'Биология 8: клетка и вещества';

const STAFF = {
  director: { email: 'director@demo.test', name: 'Директор демо-школы' },
  physics: { email: 'physics@demo.test', name: 'Асель Нурпеисова' },
  cs: { email: 'cs@demo.test', name: 'Марат Ибраев' },
  science: { email: 'science@demo.test', name: 'Ольга Тихонова' },
};

/** По пять человек в двух классах: хватает и для журнала, и для аналитики. */
const CLASS_A: [string, string][] = [
  ['Абишев', 'Данияр'], ['Громова', 'Вера'], ['Ермек', 'Асем'], ['Крылов', 'Никита'], ['Оспанова', 'Лейла'],
];
const CLASS_B: [string, string][] = [
  ['Байжанов', 'Ержан'], ['Зайцева', 'Ника'], ['Мирзоев', 'Руслан'], ['Савельева', 'Дарья'], ['Турсын', 'Алишер'],
];

/** Четвёртый курс: клетка, осмос и диффузия — с VR-лабораторией «Внутри клетки». */
async function buildBiology(
  orgId: string, teacherId: string, groupIds: string[], sims: Record<string, string>,
): Promise<Built> {
  const course = await createCourse({
    orgId, ownerId: teacherId, title: BIO_TITLE, subject: 'Биология',
    description: 'Как устроена клетка и как вещества проходят сквозь мембрану. Осмос и диффузия — на тренажёрах, '
      + 'рибосома и ДНК — в трёхмерной лаборатории, которую можно обойти вокруг.',
  });
  const built: Built = { courseId: course.id, topics: [] };

  const t1 = await createTopic(course.id, 'Клетка изнутри');
  const b1: Block[] = [];
  b1.push(await add(t1.id, 'text', {
    title: 'Завод, который помещается в точку',
    body: 'В ядре хранится **ДНК** — инструкция. С неё снимается копия, **мРНК**, и выходит в цитоплазму.\n\n'
      + 'Там её читает **рибосома** и собирает белок — аминокислоту за аминокислотой. Готовый белок '
      + 'упаковывается в **везикулу** и уезжает к мембране.',
  }));
  b1.push(await add(t1.id, 'lab', { slug: 'biology', caption: 'Обойдите клетку изнутри: найдите ядро, рибосому и везикулу. В очках Quest — по QR-коду.' }));
  b1.push(await add(t1.id, 'callout', {
    tone: 'definition', title: 'Определение',
    body: '**Мембрана** — оболочка клетки. Она пропускает одни вещества и задерживает другие, поэтому её называют *полупроницаемой*.',
  }));
  b1.push(await add(t1.id, 'assignment', task('Расставьте по порядку путь белка в клетке.', {
    type: 'order', items: [
      { text: 'В ядре с ДНК снимается копия — мРНК' }, { text: 'мРНК выходит через пору ядра' },
      { text: 'Рибосома читает мРНК' }, { text: 'Собирается цепочка аминокислот' },
      { text: 'Белок упаковывается в везикулу' },
    ] }, { allowRetry: true })));
  b1.push(await add(t1.id, 'assignment', task('Соедините часть клетки и её работу.', {
    type: 'match', pairs: [
      { left: 'Ядро', right: 'хранит ДНК' }, { left: 'Рибосома', right: 'собирает белок' },
      { left: 'Мембрана', right: 'пропускает вещества' }, { left: 'Везикула', right: 'перевозит груз' },
    ] })));
  built.topics.push({ id: t1.id, kind: 'lesson', blocks: b1 });

  const t2 = await createTopic(course.id, 'Диффузия и осмос');
  const b2: Block[] = [];
  b2.push(await add(t2.id, 'text', {
    title: 'Почему чай окрашивает воду сам',
    body: 'Частицы всё время движутся и растекаются из мест, где их много, туда, где их мало. Это **диффузия**.\n\n'
      + 'Если между растворами стоит полупроницаемая мембрана, сквозь неё идёт **вода** — в сторону более '
      + 'солёного раствора. Это **осмос**, и именно поэтому вянет несолёный огурец в рассоле.',
  }));
  b2.push(await add(t2.id, 'simulation', { simulationId: sims.diffusion, caption: 'Поднимите температуру — смотрите, как быстрее выравнивается концентрация.', preset: {}, locked: [] }));
  b2.push(await add(t2.id, 'simulation', { simulationId: sims.osmosis, caption: 'Меняйте солёность справа и следите за уровнем воды.', preset: {}, locked: [] }));
  b2.push(await add(t2.id, 'assignment', task('Что произойдёт с клеткой, если положить её в очень солёный раствор?', {
    type: 'choice', multiple: false, shuffle: true, options: [
      { id: 'a', text: 'Потеряет воду и сожмётся', correct: true },
      { id: 'b', text: 'Наберёт воду и лопнет', correct: false },
      { id: 'c', text: 'Ничего не изменится', correct: false },
    ] }, { explanation: 'Вода уходит туда, где раствор солонее, — то есть наружу.' })));
  b2.push(await add(t2.id, 'assignment', task('Заполните пропуски.', {
    type: 'gaps',
    text: 'Движение частиц из области с большей концентрацией в область с меньшей называют {{диффузией|диффузия}}. '
      + 'Через полупроницаемую мембрану движется {{вода}}.',
  }, { allowRetry: true })));
  b2.push(await add(t2.id, 'assignment', task('Объясните, почему сушёные фрукты разбухают в воде. Используйте слова «мембрана» и «осмос».', { type: 'text' }, {
    stand: { kind: 'simulation', simulationId: sims.osmosis },
    rubric: [{ label: 'Направление движения воды', points: 4 }, { label: 'Роль мембраны', points: 4 }, { label: 'Ясно изложено', points: 2 }],
  })));
  built.topics.push({ id: t2.id, kind: 'lesson', blocks: b2 });

  const t3 = await createTopic(course.id, 'Повторение у доски');
  await setTopicFormat(t3.id, 'slides', null);
  const b3: Block[] = [];
  b3.push(await add(t3.id, 'callout', { tone: 'info', title: 'Три слова урока', body: 'Мембрана · диффузия · осмос' }));
  b3.push(await add(t3.id, 'formula', { latex: '\\text{осмос} = \\text{движение воды сквозь мембрану}', caption: 'Движется вода, а не соль' }));
  b3.push(await add(t3.id, 'assignment', task('Как называется оболочка клетки, пропускающая одни вещества и задерживающая другие?', {
    type: 'short', accepted: ['мембрана', 'мембраной', 'клеточная мембрана'] })));
  built.topics.push({ id: t3.id, kind: 'slides', blocks: b3 });

  const t4 = await createTopic(course.id, 'Контрольная: клетка и вещества');
  await setTopicFormat(t4.id, 'exam', 15);
  const b4: Block[] = [];
  b4.push(await add(t4.id, 'assignment', task('Где в клетке собирается белок?', {
    type: 'choice', multiple: false, shuffle: true, options: [
      { id: 'r', text: 'На рибосоме', correct: true }, { id: 'n', text: 'В ядре', correct: false },
      { id: 'm', text: 'На мембране', correct: false },
    ] })));
  b4.push(await add(t4.id, 'assignment', task('Выберите все верные утверждения.', {
    type: 'choice', multiple: true, shuffle: true, options: [
      { id: 'd', text: 'Диффузия идёт быстрее при нагревании', correct: true },
      { id: 'o', text: 'При осмосе сквозь мембрану движется вода', correct: true },
      { id: 's', text: 'Соль проходит через мембрану так же легко, как вода', correct: false },
      { id: 'k', text: 'В ядре хранится ДНК', correct: true },
    ] })));
  b4.push(await add(t4.id, 'assignment', task('Заполните пропуск.', { type: 'gaps', text: 'Копия участка ДНК, выходящая из ядра, — это {{мРНК|м-РНК}}.' })));
  built.topics.push({ id: t4.id, kind: 'exam', blocks: b4 });

  await setCourseGroups(course.id, groupIds, new Set(groupIds));
  await setCourseStatus(course.id, 'published');
  return built;
}

export async function seedDemo(print: (line: string) => void, allowProduction = false): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error('seed:demo заводит аккаунты с известными паролями. В продакшне — только с флагом --allow-production.');
  }
  const org = (await findOrgBySlug(ORG.slug)) ?? await createOrganization(ORG);
  await db().query('UPDATE organizations SET archived_at = NULL, demo = true WHERE id = $1', [org.id]);
  // Демонстрационная — ровно одна: иначе «Войти как» снова превращается в список всех.
  await db().query('UPDATE organizations SET demo = false WHERE id <> $1', [org.id]);
  await updateOrgSettings(org.id, { studentsCanGenerate: false });

  const director = await staff(STAFF.director.email, STAFF.director.name);
  const physics = await staff(STAFF.physics.email, STAFF.physics.name);
  const cs = await staff(STAFF.cs.email, STAFF.cs.name);
  const science = await staff(STAFF.science.email, STAFF.science.name);
  await addMember(org.id, director.id, 'org_admin');
  for (const t of [physics, cs, science]) await addMember(org.id, t.id, 'teacher');

  const groups: { id: string; title: string; roster: [string, string][] }[] = [];
  for (const [title, roster] of [['8А', CLASS_A], ['8Б', CLASS_B]] as const) {
    const g = (await findGroupByTitle(org.id, title)) ?? await createGroup(org.id, title);
    for (const t of [physics, cs, science]) await assignTeacher(g.id, t.id);
    groups.push({ id: g.id, title, roster: [...roster] });
  }

  const kids: Kid[] = [];
  for (const g of groups) {
    for (const [last, first] of g.roster) {
      const login = candidateLogin(last, first, org.slug, 1);
      const found = await findUserByIdentifier(login);
      const user = found ?? await createLoginUser({
        login, displayName: `${last} ${first}`, password: DEMO_PASSWORD, mustChangePassword: false,
      });
      await updatePassword(user.id, DEMO_PASSWORD);
      await addMember(org.id, user.id, 'student');
      await addToGroup(g.id, user.id);
      const r = rng(login);
      kids.push({ user, login, password: DEMO_PASSWORD, group: g.title, diligence: 0.45 + r() * 0.55, skill: 0.4 + r() * 0.6 });
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

  // Четыре курса: физика и химия — всем, информатика — 8Б, биология — всем.
  const plan: [string, () => Promise<Built>, string, Kid[]][] = [
    ['Физика 8: колебания, волны и свет', () => buildCourse(org.id, physics.id, all, sims), physics.id, kids],
    ['Информатика 8: алгоритмы', () => buildInformatics(org.id, cs.id, [groups[1].id]), cs.id, kids.filter((k) => k.group === '8Б')],
    ['Химия 8: признаки реакций', () => buildChemistry(org.id, science.id, all), science.id, kids],
    [BIO_TITLE, () => buildBiology(org.id, science.id, all, sims), science.id, kids],
  ];
  let pending = 0;
  const made: string[] = [];
  for (const [title, build, owner, audience] of plan) {
    const has = await db().query('SELECT 1 FROM courses WHERE org_id = $1 AND title = $2', [org.id, title]);
    if (has.rowCount) continue;
    const built = await build();
    // Ближайшие сроки, чтобы «Сегодня» и «Сдать» на главной ученика не пустовали.
    if (built.topics[1]) await setTopicDue(built.topics[1].id, new Date(Date.now() + 2 * 86_400_000).toISOString());
    if (built.topics[3]) await setTopicDue(built.topics[3].id, new Date(Date.now() + 6 * 86_400_000).toISOString());
    pending += (await liveThrough(built, audience, owner)).pending;
    made.push(title);
  }

  // Старые пробные курсы демо-школы прячем в черновики: на показе они только мешают.
  const hidden = await db().query(
    `UPDATE courses SET status = 'draft' WHERE org_id = $1 AND status = 'published' AND title <> ALL($2::text[])`,
    [org.id, plan.map(([t]) => t)]);

  print(`Демо-организация готова: ${ORG.name} (${ORG.slug}).`);
  print(`Директор:   ${STAFF.director.email} / ${DEMO_PASSWORD}`);
  print(`Физика:     ${STAFF.physics.email} / ${DEMO_PASSWORD}`);
  print(`Информатика:${STAFF.cs.email} / ${DEMO_PASSWORD}`);
  print(`Химия и биология: ${STAFF.science.email} / ${DEMO_PASSWORD}`);
  print(`Ученики (10, пароль ${DEMO_PASSWORD}): ${kids.map((k) => k.login).join(', ')}`);
  print(made.length ? `Созданы курсы: ${made.join('; ')}. Работ ждут проверки: ${pending}.` : 'Все четыре курса уже были — оставлены как есть.');
  if (hidden.rowCount) print(`Прочие курсы школы убраны в черновики: ${hidden.rowCount}.`);
}

if (process.argv[1]?.endsWith('seed-demo.ts')) {
  seedDemo((line) => console.log(line), process.argv.includes('--allow-production'))
    .catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exitCode = 1; })
    .finally(() => closeDb());
}
