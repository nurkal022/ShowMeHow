// Лабораторные работы: шаги с автоматической проверкой выполнения.
import { state, actions, allRuns } from './state.js';
import { tr } from './i18n.js';

const H = 3600;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const hasRun = (pred, tMin) => allRuns().some((r) => pred(r.cfg) && r.tEnd >= tMin);
const cfgIs = (o) => Object.entries(o).every(([k, v]) => (typeof v === 'number' ? near(state.cfg[k], v, k === 'U' ? 0.06 : 3) : state.cfg[k] === v));

function setup(o, mode) {
  return () => {
    const sample = ['presetId', 'L', 'kPerm'].some((k) => k in o && o[k] !== state.cfg[k]);
    if (sample) actions.setSample(o); else { actions.reset(); actions.setLive(o); }
    if (mode) state.view.mode = mode;
    actions.setSpeed(2000);
  };
}

export const LABS = [
  {
    id: 'L1',
    title: tr('Л1. Влияние температуры потока', 'З1. Ағын температурасының әсері', 'L1. Effect of flow temperature'),
    goal: tr('Повторить вычислительный эксперимент Калменовой и соавторов (2023): прогрев нефтешлама горячим воздухом при T₀ = 150, 250 и 450 °C, U₀ = 1.6 м/с.', 'Калменова және бірлескен авторлардың (2023) есептеу тәжірибесін қайталау: T₀ = 150, 250 және 450 °C, U₀ = 1.6 м/с кезінде мұнай шламын ыстық ауамен қыздыру.', 'Reproduce the computational experiment of Kalmenova et al. (2023): heating oil sludge with hot air at T₀ = 150, 250 and 450 °C, U₀ = 1.6 m/s.'),
    steps: [
      { text: tr('Образец «Нефтешлам из амбара», L = 5 см, U₀ = 1.6 м/с, T₀ = 150 °C. Нажмите «Настроить».', '«Амбардағы мұнай шламы» үлгісі, L = 5 см, U₀ = 1.6 м/с, T₀ = 150 °C. «Қадамды баптау» батырмасын басыңыз.', 'Sample “Pit oil sludge”, L = 5 cm, U₀ = 1.6 m/s, T₀ = 150 °C. Press “Set up step”.'), apply: setup({ presetId: 'pit', L: 0.05, U: 1.6, Tf: 150, insulated: true, latentHeat: true }, 'thermal'), check: () => cfgIs({ presetId: 'pit', U: 1.6, Tf: 150 }) },
      { text: tr('Запустите опыт (▶) и проведите его до 3 ч модельного времени. Следите за тепловизором и термопарами T1–T4.', 'Тәжірибені іске қосып (▶), оны модельдік уақыт бойынша 3 сағатқа дейін жүргізіңіз. Жылулық бейнені және T1–T4 термопараларын бақылаңыз.', 'Start the run (▶) and continue it to 3 h of model time. Watch the thermal view and thermocouples T1–T4.'), check: () => hasRun((c) => near(c.Tf, 150, 3) && near(c.U, 1.6, 0.06), 3 * H) },
      { text: tr('Повторите опыт при T₀ = 250 °C (до 3 ч).', 'Тәжірибені T₀ = 250 °C кезінде қайталаңыз (3 сағатқа дейін).', 'Repeat the run at T₀ = 250 °C (up to 3 h).'), apply: setup({ presetId: 'pit', L: 0.05, U: 1.6, Tf: 250 }, 'thermal'), check: () => hasRun((c) => near(c.Tf, 250, 3) && near(c.U, 1.6, 0.06), 3 * H) },
      { text: tr('Повторите опыт при T₀ = 450 °C (до 3 ч).', 'Тәжірибені T₀ = 450 °C кезінде қайталаңыз (3 сағатқа дейін).', 'Repeat the run at T₀ = 450 °C (up to 3 h).'), apply: setup({ presetId: 'pit', L: 0.05, U: 1.6, Tf: 450 }, 'thermal'), check: () => hasRun((c) => near(c.Tf, 450, 3) && near(c.U, 1.6, 0.06), 3 * H) },
      { text: tr('Откройте вкладку «Сравнение» на панели графиков и сравните кривые средней температуры и потери массы.', 'Графиктер панеліндегі «Салыстыру» қойындысын ашып, орташа температура мен масса шығыны қисықтарын салыстырыңыз.', 'Open the “Comparison” tab on the charts panel and compare the mean temperature and mass loss curves.'), check: () => state.view.graph === 'compare' },
    ],
    conclusion: tr('Тепловой поток в образец q = h·(T₀ − T_s) растёт с T₀, поэтому образец прогревается и теряет массу быстрее. При Bi = hL/λ > 1 внутри куба сохраняется сильный градиент: нижние слои успевают высохнуть, а верхние ещё холодные. Это лимитирует процесс сильнее, чем подвод тепла.', 'Үлгіге берілетін жылу ағыны q = h·(T₀ − T_s) T₀ артқан сайын өседі, сондықтан үлгі тезірек қызып, массасын тезірек жоғалтады. Bi = hL/λ > 1 болғанда текшенің ішінде күшті градиент сақталады: төменгі қабаттар кеуіп үлгереді, ал жоғарғылары әлі суық. Бұл процесті жылу берілуіне қарағанда күштірек шектейді.', 'The heat flux into the sample q = h·(T₀ − T_s) grows with T₀, so the sample heats up and loses mass faster. With Bi = hL/λ > 1 a strong gradient persists inside the cube: the bottom layers dry out while the top ones are still cold. This limits the process more than the heat supply does.'),
  },
  {
    id: 'L2',
    title: tr('Л2. Влияние скорости потока', 'З2. Ағын жылдамдығының әсері', 'L2. Effect of flow velocity'),
    goal: tr('Исследовать влияние U₀ = 0.83, 1.6 и 2.7 м/с при T₀ = 250 °C (как в статье).', 'T₀ = 250 °C кезінде U₀ = 0.83, 1.6 және 2.7 м/с әсерін зерттеу (мақаладағыдай).', 'Study the effect of U₀ = 0.83, 1.6 and 2.7 m/s at T₀ = 250 °C (as in the paper).'),
    steps: [
      { text: tr('Настройте: T₀ = 250 °C, U₀ = 0.83 м/с. Запустите и проведите опыт до 3 ч.', 'Баптаңыз: T₀ = 250 °C, U₀ = 0.83 м/с. Іске қосып, тәжірибені 3 сағатқа дейін жүргізіңіз.', 'Set: T₀ = 250 °C, U₀ = 0.83 m/s. Start and run to 3 h.'), apply: setup({ presetId: 'pit', L: 0.05, U: 0.83, Tf: 250 }, 'thermal'), check: () => hasRun((c) => near(c.Tf, 250, 3) && near(c.U, 0.83, 0.06), 3 * H) },
      { text: tr('Повторите при U₀ = 1.6 м/с.', 'U₀ = 1.6 м/с кезінде қайталаңыз.', 'Repeat at U₀ = 1.6 m/s.'), apply: setup({ presetId: 'pit', L: 0.05, U: 1.6, Tf: 250 }, 'thermal'), check: () => hasRun((c) => near(c.Tf, 250, 3) && near(c.U, 1.6, 0.06), 3 * H) },
      { text: tr('Повторите при U₀ = 2.7 м/с.', 'U₀ = 2.7 м/с кезінде қайталаңыз.', 'Repeat at U₀ = 2.7 m/s.'), apply: setup({ presetId: 'pit', L: 0.05, U: 2.7, Tf: 250 }, 'thermal'), check: () => hasRun((c) => near(c.Tf, 250, 3) && near(c.U, 2.7, 0.06), 3 * H) },
      { text: tr('Откройте панель «Модель → Числа подобия»: сравните h и Bi. Затем вкладку «Сравнение».', '«Модель → Ұқсастық сандары» панелін ашып, h пен Bi мәндерін салыстырыңыз. Содан кейін «Салыстыру» қойындысын ашыңыз.', 'Open “Model → Similarity numbers” and compare h and Bi. Then open the “Comparison” tab.'), check: () => state.view.graph === 'compare' },
    ],
    conclusion: tr('В ламинарном пограничном слое Nu = 0.664·Re^½·Pr^⅓, поэтому h ∝ √U₀: при росте U₀ с 0.83 до 2.7 м/с h увеличивается в ≈1.8 раза. Обратите внимание на локальный коэффициент h_x ∝ x^−½: передняя (по потоку) кромка образца греется быстрее. Этот эффект двумерен и в одномерной модели отсутствует.', 'Ламинарлы шекаралық қабатта Nu = 0.664·Re^½·Pr^⅓, сондықтан h ∝ √U₀: U₀ 0.83-тен 2.7 м/с-қа дейін артқанда h шамамен 1.8 есе өседі. Жергілікті h_x ∝ x^−½ коэффициентіне назар аударыңыз: үлгінің ағын бойынша алдыңғы жиегі тезірек қызады. Бұл әсер екі өлшемді, бір өлшемді модельде ол жоқ.', 'In a laminar boundary layer Nu = 0.664·Re^½·Pr^⅓, so h ∝ √U₀: raising U₀ from 0.83 to 2.7 m/s increases h by ≈1.8 times. Note the local coefficient h_x ∝ x^−½: the leading (upstream) edge of the sample heats faster. This effect is two-dimensional and absent from a 1D model.'),
  },
  {
    id: 'L3',
    title: tr('Л3. Плато кипения и фракции', 'З3. Қайнау платосы және фракциялар', 'L3. Boiling plateau and fractions'),
    goal: tr('Наблюдать связь тепло- и массопереноса: температурное плато 100 °C при кипении воды и последовательную отгонку фракций нефти.', 'Жылу және масса тасымалының байланысын бақылау: су қайнаған кездегі 100 °C температуралық плато және мұнай фракцияларының бірізді айдалуы.', 'Observe the coupling of heat and mass transfer: the 100 °C temperature plateau while water boils and the sequential distillation of oil fractions.'),
    steps: [
      { text: tr('Настройте: T₀ = 450 °C, U₀ = 2.7 м/с, режим «Вода». Термопара T1 — у нагреваемой грани.', 'Баптаңыз: T₀ = 450 °C, U₀ = 2.7 м/с, «Су» режимі. T1 термопарасы — қыздырылатын беттің жанында.', 'Set: T₀ = 450 °C, U₀ = 2.7 m/s, “Water” mode. Thermocouple T1 is near the heated face.'), apply: setup({ presetId: 'pit', L: 0.05, U: 2.7, Tf: 450 }, 'water'), check: () => cfgIs({ Tf: 450, U: 2.7 }) },
      { text: tr('Запустите опыт. На графике «Температура» найдите плато ≈100 °C у T1 и T2. Пока в ячейке есть вода, тепло идёт на испарение, а не на нагрев.', 'Тәжірибені іске қосыңыз. «Температура» графигінен T1 мен T2 үшін ≈100 °C платоны табыңыз. Ұяшықта су болғанша жылу қыздыруға емес, булануға жұмсалады.', 'Start the run. On the “Temperature” chart find the ≈100 °C plateau for T1 and T2. While a cell still holds water, heat goes into evaporation rather than heating.'), check: () => state.snap && state.snap.t > 1.5 * H },
      { text: tr('Включите сечение по X и переключите режимы «Вода» и «Нефть»: виден фронт сушки, идущий снизу вверх.', 'X бойынша қиманы қосып, «Су» және «Мұнай» режимдерін ауыстырыңыз: төменнен жоғары қарай жылжитын кептіру фронты көрінеді.', 'Turn on section X and switch between the “Water” and “Oil” modes: a drying front moving from bottom to top is visible.'), check: () => state.view.slice !== 'none' },
      { text: tr('Откройте вкладку «Фракции»: сравните степень удаления воды, лёгких, средних и тяжёлых УВ.', '«Фракциялар» қойындысын ашып, судың, жеңіл, орташа және ауыр КС-тың жойылу дәрежесін салыстырыңыз.', 'Open the “Fractions” tab and compare the removal of water, light, medium and heavy HC.'), check: () => state.view.graph === 'fractions' },
    ],
    conclusion: tr('Каждая фракция уходит при своей температуре: давление насыщенного пара p_sat(T) растёт экспоненциально (уравнение Клапейрона–Клаузиуса), а у смеси — по закону Рауля. Теплота испарения создаёт плато и фронт сушки (задача Стефана). Чтобы удалить тяжёлые фракции (C21+), нужны T₀ > 400 °C.', 'Әр фракция өз температурасында бөлінеді: қаныққан бу қысымы p_sat(T) экспоненциалды түрде өседі (Клапейрон–Клаузиус теңдеуі), ал қоспа үшін — Рауль заңы бойынша. Булану жылуы плато мен кептіру фронтын тудырады (Стефан есебі). Ауыр фракцияларды (C21+) жою үшін T₀ > 400 °C қажет.', 'Each fraction leaves at its own temperature: the saturated vapour pressure p_sat(T) grows exponentially (Clausius–Clapeyron equation), and for a mixture it follows Raoult’s law. The heat of vaporization creates the plateau and the drying front (Stefan problem). Removing the heavy fractions (C21+) requires T₀ > 400 °C.'),
  },
  {
    id: 'L4',
    title: tr('Л4. Пиролиз и коксование', 'З4. Пиролиз және кокстеу', 'L4. Pyrolysis and coking'),
    goal: tr('Изучить термическое разложение смол и асфальтенов (кинетика Аррениуса), образование кокса и выделение H₂S.', 'Шайырлар мен асфальтендердің термиялық ыдырауын (Аррениус кинетикасы), кокстың түзілуін және H₂S бөлінуін зерттеу.', 'Study the thermal decomposition of resins and asphaltenes (Arrhenius kinetics), coke formation and H₂S release.'),
    steps: [
      { text: tr('Настройте: T₀ = 600 °C, U₀ = 2.7 м/с, режим «Кокс».', 'Баптаңыз: T₀ = 600 °C, U₀ = 2.7 м/с, «Кокс» режимі.', 'Set: T₀ = 600 °C, U₀ = 2.7 m/s, “Coke” mode.'), apply: setup({ presetId: 'pit', L: 0.05, U: 2.7, Tf: 600 }, 'coke'), check: () => cfgIs({ Tf: 600, U: 2.7 }) },
      { text: tr('Запустите опыт. Наблюдайте рост чёрной зоны кокса от нагреваемой грани и бурый дым. Доведите до 4 ч.', 'Тәжірибені іске қосыңыз. Қыздырылатын беттен бастап кокстың қара аймағының өсуін және қоңыр түтінді бақылаңыз. 4 сағатқа дейін жеткізіңіз.', 'Start the run. Watch the black coke zone grow from the heated face and the brown smoke. Continue to 4 h.'), check: () => state.snap && state.snap.t > 4 * H },
      { text: tr('Посмотрите на газоанализатор: концентрацию H₂S в вытяжке. Переключите вид «Реальный»: раскалённая поверхность светится.', 'Газ талдағышқа қараңыз: сорғыштағы H₂S концентрациясы. «Нақты» көрінісіне ауыстырыңыз: қызған бет жарқырайды.', 'Look at the gas analyzer: the H₂S concentration in the exhaust. Switch to the “Realistic” view: the red-hot surface glows.'), check: () => state.view.mode === 'real' },
      { text: tr('Вкладка «Масса (ТГА)»: найдите ступени потери массы (вода → лёгкие → средние/тяжёлые → пиролиз).', '«Масса (ТГА)» қойындысы: масса шығынының сатыларын табыңыз (су → жеңіл → орташа/ауыр → пиролиз).', '“Mass (TGA)” tab: find the mass-loss steps (water → light → medium/heavy → pyrolysis).'), check: () => state.view.graph === 'mass' },
    ],
    conclusion: tr('Константа скорости k = A·exp(−E/RT) при E = 150 кДж/моль растёт примерно в 30 раз при нагреве с 400 до 500 °C. Поэтому пиролиз идёт узким фронтом у горячей грани. Из смол получаются газ (20 %), пары смолы (40 %) и кокс (40 %), а сера смол частично уходит в H₂S.', 'E = 150 кДж/моль кезінде жылдамдық константасы k = A·exp(−E/RT) 400-ден 500 °C-қа дейін қыздырғанда шамамен 30 есе өседі. Сондықтан пиролиз ыстық беттің жанында тар фронтпен жүреді. Шайырлардан газ (20 %), шайыр булары (40 %) және кокс (40 %) түзіледі, ал шайырлардағы күкірттің бір бөлігі H₂S түрінде бөлінеді.', 'With E = 150 kJ/mol the rate constant k = A·exp(−E/RT) grows about 30-fold when heating from 400 to 500 °C. Therefore pyrolysis proceeds as a narrow front near the hot face. Resins yield gas (20 %), tar vapour (40 %) and coke (40 %), and part of the resin sulphur leaves as H₂S.'),
  },
  {
    id: 'L5',
    title: tr('Л5. Безопасность: вытяжной шкаф', 'З5. Қауіпсіздік: сорғыш шкаф', 'L5. Safety: fume hood'),
    goal: tr('Оценить концентрацию ЛОС и H₂S в рабочей зоне с вытяжкой и без неё и сравнить с ПДК.', 'Сорғыш қосулы және өшірулі кезде жұмыс аймағындағы ҰОҚ пен H₂S концентрациясын бағалап, ШРК-мен салыстыру.', 'Estimate the VOC and H₂S concentrations in the work zone with and without the exhaust and compare them with the OEL.'),
    steps: [
      { text: tr('Настройте: T₀ = 550 °C, U₀ = 2.7 м/с. Запустите опыт.', 'Баптаңыз: T₀ = 550 °C, U₀ = 2.7 м/с. Тәжірибені іске қосыңыз.', 'Set: T₀ = 550 °C, U₀ = 2.7 m/s. Start the run.'), apply: setup({ presetId: 'pit', L: 0.05, U: 2.7, Tf: 550 }, 'real'), check: () => state.running && cfgIs({ Tf: 550 }) },
      { text: tr('Выключите вытяжку (панель «Вид»). Наблюдайте, как дым расходится в комнату и растут концентрации в рабочей зоне.', 'Сорғышты өшіріңіз («Көрініс» панелі). Түтіннің бөлмеге таралуын және жұмыс аймағындағы концентрациялардың өсуін бақылаңыз.', 'Turn off the exhaust (“View” panel). Watch the smoke spread into the room and the work-zone concentrations rise.'), check: () => !state.view.hood && state.snap?.t > 1 * H },
      { text: tr('Дождитесь превышения ПДК (красный индикатор) или 4 ч. Включите вытяжку обратно.', 'ШРК асқанша (қызыл индикатор) немесе 4 сағат өткенше күтіңіз. Сорғышты қайта қосыңыз.', 'Wait until the OEL is exceeded (red indicator) or 4 h pass. Turn the exhaust back on.'), check: () => state.view.hood && (state.air.maxRoomH2s > 10 || state.air.maxRoomVoc > 300 || state.snap?.t > 4 * H) },
    ],
    conclusion: tr('Без вытяжки концентрация в помещении растёт по закону V·dC/dt = G − Q·C. Время выхода на стационар τ = V/Q составляет около 20 мин при 3 обменах в час. Вытяжной шкаф улавливает больше 99 % выбросов. В VR этот опыт безопасен, в реальной лаборатории он недопустим.', 'Сорғыш болмаса, бөлмедегі концентрация V·dC/dt = G − Q·C заңы бойынша өседі. Сағатына 3 рет ауа алмасқанда стационар күйге шығу уақыты τ = V/Q шамамен 20 мин. Сорғыш шкаф шығарындылардың 99 %-дан астамын ұстап қалады. VR-да бұл тәжірибе қауіпсіз, нақты зертханада оған жол берілмейді.', 'Without the exhaust the room concentration grows as V·dC/dt = G − Q·C. The time to reach steady state τ = V/Q is about 20 min at 3 air changes per hour. The fume hood captures more than 99 % of emissions. In VR this experiment is safe; in a real lab it is unacceptable.'),
  },
  {
    id: 'L6',
    title: tr('Л6. Связь тепла и массы (к модели статьи)', 'З6. Жылу мен массаның байланысы (мақала моделіне)', 'L6. Heat–mass coupling (vs. the paper’s model)'),
    goal: tr('Сравнить расширенную модель с упрощением, где испарение не забирает тепло (как в несвязанной системе (1) статьи).', 'Кеңейтілген модельді булану жылуды алмайтын жеңілдетілген нұсқамен салыстыру (мақаланың байланыспаған (1) жүйесіндегідей).', 'Compare the extended model with a simplification in which evaporation takes no heat (as in the uncoupled system (1) of the paper).'),
    steps: [
      { text: tr('Настройте: T₀ = 250 °C, U₀ = 1.6 м/с, теплота испарения ВКЛ. Проведите опыт до 3 ч.', 'Баптаңыз: T₀ = 250 °C, U₀ = 1.6 м/с, булану жылуы ҚОСУЛЫ. Тәжірибені 3 сағатқа дейін жүргізіңіз.', 'Set: T₀ = 250 °C, U₀ = 1.6 m/s, heat of vaporization ON. Run to 3 h.'), apply: setup({ presetId: 'tank', L: 0.05, U: 1.6, Tf: 250, latentHeat: true }, 'thermal'), check: () => hasRun((c) => c.latentHeat && c.presetId === 'tank' && near(c.Tf, 250, 3), 3 * H) },
      { text: tr('Выключите «Теплота испарения» и повторите опыт до 3 ч.', '«Булану жылуы» параметрін өшіріп, тәжірибені 3 сағатқа дейін қайталаңыз.', 'Turn off “Heat of vaporization” and repeat the run to 3 h.'), apply: setup({ presetId: 'tank', L: 0.05, U: 1.6, Tf: 250, latentHeat: false }, 'thermal'), check: () => hasRun((c) => !c.latentHeat && c.presetId === 'tank' && near(c.Tf, 250, 3), 3 * H) },
      { text: tr('Сравните кривые на вкладке «Сравнение».', '«Салыстыру» қойындысындағы қисықтарды салыстырыңыз.', 'Compare the curves on the “Comparison” tab.'), check: () => state.view.graph === 'compare' },
    ],
    conclusion: tr('Без стока теплоты −ṁL модель сильно завышает скорость прогрева влажного шлама (L воды = 2.26 МДж/кг). Связанная постановка тепло- и массопереноса в 3D — естественное развитие модели (1) и возможная научная новизна.', '−ṁL жылу ағыны болмаса, модель ылғалды шламның қызу жылдамдығын едәуір асырып көрсетеді (судың L = 2.26 МДж/кг). Жылу және масса тасымалының 3D байланысқан қойылымы — (1) модельдің табиғи дамуы және ықтимал ғылыми жаңалық.', 'Without the −ṁL heat sink the model greatly overestimates the heating rate of wet sludge (L of water = 2.26 MJ/kg). A coupled 3D heat and mass transfer formulation is a natural extension of model (1) and a possible scientific novelty.'),
  },
];

export const lab = { current: null, step: 0, done: new Set() };

export function labTick() {
  const L = LABS.find((l) => l.id === lab.current);
  if (!L) return;
  const s = L.steps[lab.step];
  if (s && s.check()) {
    lab.done.add(`${L.id}:${lab.step}`);
    if (lab.step < L.steps.length - 1) lab.step++;
    else lab.done.add(`${L.id}:end`);
    return true;
  }
  return false;
}
