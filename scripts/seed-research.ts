import { closeDb, db } from '../src/lib/db/client';
import { updatePassword } from '../src/lib/auth/users';
import { DEMO_RESEARCHER_EMAIL } from '../src/lib/admin/switch';
import { createItem, createProject, updateProject } from '../src/lib/research/store';
import { createArticle, updateArticle } from '../src/lib/research/articles-store';
import { newArticleDoc, type ArticleDoc, type Reference } from '../src/lib/research/article';
import { SAMPLE_DATA, type ModelDoc, type PlotDoc } from '../src/lib/research/doc';
import { staff } from './seed-showcase';

/**
 * Демо-исследователь для показов раздела «Исследования»: три проекта с рисунками,
 * моделями и статьёй. Админ платформы попадает к нему через «Войти как → исследователь».
 *
 * Повторный запуск пересоздаёт материалы исследователя с нуля — это стенд, не рабочие данные.
 */

const PASSWORD = 'demo-2026';
const NAME = 'Айгерим Сапарова';

const FIG = { title: '', xLabel: 'x', yLabel: 'y', xLog: false, yLog: false, style: 'paper' as const, grid: true };

const PENDULUM_DATA = `L, м\tT², с²\tσ, с²
0.20\t0.81\t0.03
0.30\t1.20\t0.03
0.40\t1.62\t0.04
0.50\t2.00\t0.04
0.60\t2.43\t0.05
0.70\t2.80\t0.05
0.80\t3.23\t0.06
0.90\t3.60\t0.06
1.00\t4.04\t0.07`;

const DAMPING_DATA = `t, с\tA, см
0\t10.0
5\t8.1
10\t6.6
15\t5.4
20\t4.5
25\t3.6
30\t2.9
35\t2.4
40\t1.9`;

const YEAST_DATA = `t, ч\tN, млн/мл
0\t0.5
2\t0.9
4\t1.7
6\t3.1
8\t5.2
10\t7.6
12\t9.4
14\t10.6
16\t11.2
18\t11.5
20\t11.7`;

/** Только общеизвестные учебники — выдуманных ссылок в демо быть не должно. */
const REFS: Reference[] = [
  {
    id: 'horowitz2015', type: 'book', authors: [{ family: 'Horowitz', given: 'P.' }, { family: 'Hill', given: 'W.' }],
    title: 'The Art of Electronics', container: '', year: 2015, volume: '', issue: '', pages: '',
    publisher: 'Cambridge University Press', doi: '', url: '',
  },
  {
    id: 'taylor1997', type: 'book', authors: [{ family: 'Taylor', given: 'J. R.' }],
    title: 'An Introduction to Error Analysis', container: '', year: 1997, volume: '', issue: '', pages: '',
    publisher: 'University Science Books', doi: '', url: '',
  },
];

function plot(doc: Partial<PlotDoc> & Pick<PlotDoc, 'data' | 'series'>): PlotDoc {
  return { ...FIG, x: 0, ...doc };
}

function model(doc: Partial<ModelDoc> & Pick<ModelDoc, 'mode' | 'lines' | 'params' | 'from' | 'to'>): ModelDoc {
  return { ...FIG, initial: {}, data: '', dataX: 0, dataY: null, ...doc };
}

export async function seedResearch(print: (line: string) => void, allowProduction = false): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !allowProduction) {
    throw new Error('seed:research заводит аккаунт с известным паролем. В продакшне — только с флагом --allow-production.');
  }
  const user = await staff(DEMO_RESEARCHER_EMAIL, NAME);
  await updatePassword(user.id, PASSWORD);
  await db().query('DELETE FROM research_articles WHERE owner_id = $1', [user.id]);
  await db().query('DELETE FROM research_items WHERE owner_id = $1', [user.id]);
  await db().query('DELETE FROM research_projects WHERE owner_id = $1', [user.id]);

  // 1. Маятник: g из наклона T²(L) и затухание.
  const pend = await createProject(user.id, {
    title: 'Математический маятник: оценка g',
    description: 'Период колебаний при разной длине нити и затухание амплитуды. Лабораторная работа, 1 курс.',
  });
  await createItem(user.id, {
    kind: 'plot', projectId: pend.id, title: 'T² от длины нити',
    doc: plot({
      title: 'T² от длины нити', xLabel: 'L, м', yLabel: 'T², с²', data: PENDULUM_DATA, residuals: true, band: true,
      series: [{ y: 1, err: 2, label: 'Эксперимент', mode: 'markers', fit: { model: 'linear' } }],
      annotations: [{ x: 0.6, y: 2.43, text: 'наклон = 4π²/g' }],
    }),
  });
  await createItem(user.id, {
    kind: 'plot', projectId: pend.id, title: 'Затухание амплитуды',
    doc: plot({
      title: 'Затухание амплитуды', xLabel: 't, с', yLabel: 'A, см', data: DAMPING_DATA,
      series: [{ y: 1, err: null, label: 'Амплитуда', mode: 'markers', fit: { model: 'exp' } }],
    }),
  });
  await createItem(user.id, {
    kind: 'model', projectId: pend.id, title: 'Нелинейный маятник с трением',
    doc: model({
      title: 'Нелинейный маятник с трением', xLabel: 't, с', yLabel: 'θ, рад', mode: 'ode',
      lines: ["th' = w", "w' = -(g/L)*sin(th) - k*w"],
      params: [
        { name: 'g', value: 9.81, min: 1, max: 20, hint: 'ускорение свободного падения, м/с²' },
        { name: 'L', value: 0.8, min: 0.1, max: 2, hint: 'длина нити, м' },
        { name: 'k', value: 0.08, min: 0, max: 1, hint: 'коэффициент трения, 1/с' },
      ],
      from: 0, to: 30, initial: { th: 1.2, w: 0 }, view: 'phase', phaseX: 'th', phaseY: 'w',
      varLabels: { th: 'θ, рад', w: 'ω, рад/с' },
    }),
  });

  // 2. RC-цепь: данные, модель и статья.
  const rc = await createProject(user.id, {
    title: 'Разряд конденсатора через резистор',
    description: 'Измерение постоянной времени RC-цепи и сравнение с номиналом элементов.',
  });
  const rcPlot = await createItem(user.id, {
    kind: 'plot', projectId: rc.id, title: 'Напряжение на конденсаторе',
    doc: plot({
      title: 'Напряжение на конденсаторе', xLabel: 't, с', yLabel: 'U, В', data: SAMPLE_DATA, band: true, residuals: true,
      series: [{ y: 1, err: 2, label: 'Эксперимент', mode: 'markers', fit: { model: 'exp' } }],
    }),
  });
  const rcModel = await createItem(user.id, {
    kind: 'model', projectId: rc.id, title: 'Модель разряда',
    doc: model({
      title: 'Модель разряда', xLabel: 't, с', yLabel: 'U, В', mode: 'function',
      lines: ['U = U0*exp(-t/(R*C))'],
      params: [
        { name: 'U0', value: 10, min: 0, max: 15, hint: 'начальное напряжение, В' },
        { name: 'R', value: 10, min: 1, max: 50, hint: 'сопротивление, кОм' },
        { name: 'C', value: 0.1, min: 0.01, max: 0.5, hint: 'ёмкость, мФ' },
      ],
      from: 0, to: 4, data: SAMPLE_DATA, dataX: 0, dataY: 1,
      snapshots: [{ label: 'R = 20 кОм', values: { U0: 10, R: 20, C: 0.1 } }],
    }),
  });
  await updateProject(user.id, rc.id, {
    shared: true,
    graphical: {
      headline: 'Постоянная времени RC-цепи совпала с номиналом в пределах 3 %',
      steps: [
        { label: 'Заряд', detail: 'Конденсатор 100 мкФ заряжен до 10 В' },
        { label: 'Измерение', detail: 'Напряжение снято каждые 0,5 с' },
        { label: 'Подгонка', detail: 'Экспонента по методу наименьших квадратов' },
      ],
      takeaway: 'τ = 0,97 ± 0,03 с против номинала 1,0 с',
      figureId: rcPlot.id,
    },
  });
  const article = await createArticle(user.id, { title: 'Определение постоянной времени RC-цепи', projectId: rc.id, kind: 'experimental', lang: 'ru' });
  const doc: ArticleDoc = newArticleDoc('experimental', 'ru');
  const body: Record<string, string> = {
    introduction: 'Разряд конденсатора через резистор — классический пример экспоненциального процесса [@horowitz2015]. '
      + 'Цель работы — определить постоянную времени цепи по данным измерений и сравнить её с номиналом элементов.',
    methods: 'Конденсатор ёмкостью 100 мкФ заряжали до 10 В и разряжали через резистор 10 кОм. Напряжение снимали '
      + 'цифровым мультиметром каждые 0,5 с. Погрешности оценены по паспорту прибора [@taylor1997].',
    results: `Зависимость напряжения от времени показана на [[fig:${rcPlot.id}]].\n\n{{fig:${rcPlot.id}}}\n\n`
      + `Подгонка экспонентой даёт τ = 0,97 ± 0,03 с. Модель с номинальными R и C ([[fig:${rcModel.id}]]) ложится на данные без систематического отклонения.\n\n{{fig:${rcModel.id}}}`,
    discussion: 'Расхождение с номиналом (3 %) укладывается в допуск конденсатора. Остатки подгонки не показывают тренда, '
      + 'значит утечка через мультиметр пренебрежимо мала.',
    conclusion: 'Постоянная времени RC-цепи определена с точностью 3 % и согласуется с номиналом элементов.',
    acknowledgements: 'Автор благодарит лабораторию общей физики за предоставленное оборудование.',
  };
  doc.sections = doc.sections.map((s) => ({ ...s, body: body[s.key] ?? s.body }));
  doc.authors = [{ name: NAME, affiliation: 'Демо-университет Tesseract', orcid: '', email: DEMO_RESEARCHER_EMAIL, corresponding: true }];
  doc.abstract = { ru: 'Измерена постоянная времени RC-цепи: τ = 0,97 ± 0,03 с при номинале 1,0 с. Данные описываются экспонентой без систематических отклонений.' };
  doc.keywords = { ru: 'RC-цепь, постоянная времени, аппроксимация, погрешность' };
  doc.references = REFS;
  await updateArticle(user.id, article.id, { doc });

  // 3. Популяции: логистический рост и хищник–жертва.
  const pop = await createProject(user.id, {
    title: 'Динамика популяций',
    description: 'Рост культуры дрожжей и модель «хищник–жертва» Лотки–Вольтерры.',
  });
  await createItem(user.id, {
    kind: 'plot', projectId: pop.id, title: 'Рост культуры дрожжей',
    doc: plot({
      title: 'Рост культуры дрожжей', xLabel: 't, ч', yLabel: 'N, млн/мл', data: YEAST_DATA, excluded: [9],
      series: [{ y: 1, err: null, label: 'Подсчёт в камере Горяева', mode: 'markers', fit: { model: 'logistic' } }],
    }),
  });
  await createItem(user.id, {
    kind: 'model', projectId: pop.id, title: 'Хищник и жертва',
    doc: model({
      title: 'Хищник и жертва', xLabel: 't', yLabel: 'численность', mode: 'ode',
      lines: ["x' = a*x - b*x*y", "y' = -c*y + d*x*y"],
      params: [
        { name: 'a', value: 1.1, min: 0, max: 3, hint: 'рождаемость жертв' },
        { name: 'b', value: 0.4, min: 0, max: 2, hint: 'вылов жертв хищниками' },
        { name: 'c', value: 0.4, min: 0, max: 2, hint: 'гибель хищников' },
        { name: 'd', value: 0.1, min: 0, max: 1, hint: 'прирост хищников' },
      ],
      from: 0, to: 50, initial: { x: 10, y: 10 }, view: 'time',
      varLabels: { x: 'жертвы', y: 'хищники' },
      snapshots: [{ label: 'a = 1,5', values: { a: 1.5, b: 0.4, c: 0.4, d: 0.1 } }],
    }),
  });

  print(`Демо-исследователь готов: ${DEMO_RESEARCHER_EMAIL} / ${PASSWORD} (${NAME}).`);
  print('Проекты: маятник, RC-цепь (со статьёй и публичной ссылкой), динамика популяций.');
}

if (process.argv[1]?.endsWith('seed-research.ts')) {
  seedResearch((line) => console.log(line), process.argv.includes('--allow-production'))
    .catch((e) => { console.error(e instanceof Error ? e.stack ?? e.message : e); process.exitCode = 1; })
    .finally(() => closeDb());
}
