/**
 * Галерея моделей на казахском и английском. Русский — в самой галерее
 * (lib/research/model-gallery.ts); здесь только то, что видит человек: название,
 * описание, заголовок и оси рисунка, подписи параметров и переменных, имена кривых.
 * Формулы и имена переменных не переводятся.
 */
export interface GalleryText {
  title: string;
  description: string;
  docTitle: string;
  xLabel: string;
  yLabel: string;
  params?: Record<string, string>;
  varLabels?: Record<string, string>;
  /** Строки модели целиком — только для явных формул с подписанными кривыми. */
  lines?: string[];
}

export const galleryText: Record<'kk' | 'en', Record<string, GalleryText>> = {
  kk: {
    'damped-oscillator': {
      title: 'Өшетін осциллятор',
      description: 'Тұтқыр үйкелісі бар серіппедегі жүк: әлсіз, күшті және критикалық өшу. Механика, акустика және тербелмелі контурлар үшін негіз.',
      docTitle: 'Өшетін гармоникалық осциллятор', xLabel: 't, с', yLabel: 'x, м; v, м/с',
      params: { g: 'өшу коэффициенті, 1/с', w: 'меншікті жиілік, рад/с' },
      varLabels: { x: 'x, м', v: 'v, м/с' },
    },
    pendulum: {
      title: 'Сызықтық емес маятник',
      description: 'Үлкен бұрыштардағы маятник: период амплитудаға тәуелді, ал фазалық жазықтықта сепаратриса мен айналу көрінеді. Сызықтық емес динамиканың классикасы.',
      docTitle: 'Үйкелісі бар сызықтық емес маятник', xLabel: 't, с', yLabel: 'θ, рад; ω, рад/с',
      params: { g: 'еркін түсу үдеуі, м/с²', L: 'жіптің ұзындығы, м', k: 'үйкеліс, 1/с' },
      varLabels: { theta: 'θ, рад', omega: 'ω, рад/с' },
    },
    'projectile-drag': {
      title: 'Ауа кедергісі бар дененің ұшуы',
      description: 'Квадраттық кедергімен бұрыш жасай лақтыру: траектория симметриялы емес, ұшу қашықтығы параболалықтан аз. Баллистика, спорт, тамшылар.',
      docTitle: 'Квадраттық кедергімен ұшу', xLabel: 't, с', yLabel: 'координаталар, м; жылдамдықтар, м/с',
      params: { k: 'кедергі k = ρC·S/(2m), 1/м', g: 'еркін түсу үдеуі, м/с²' },
      varLabels: { x: 'x, м', y: 'y, м', vx: 'vx, м/с', vy: 'vy, м/с' },
    },
    'decay-chain': {
      title: 'Радиоактивті ыдырау тізбегі',
      description: 'Аналық ядро → еншілес → тұрақты: аралық изотоптың жиналуы мен азаюы, ғасырлық тепе-теңдік. Радиохимия, жас анықтау, медицина.',
      docTitle: 'Радиоактивті ыдырау A → B → C', xLabel: 't, сағ', yLabel: 'ядролар үлесі',
      params: { T1: 'A-ның жартылай ыдырау периоды, сағ', T2: 'B-ның жартылай ыдырау периоды, сағ' },
      varLabels: { A: 'A (аналық)', B: 'B (еншілес)', C: 'C (тұрақты)' },
    },
    'rc-discharge': {
      title: 'Конденсатордың разрядталуы (RC)',
      description: 'τ = RC уақыт тұрақтысымен кернеудің экспоненциалды кемуі. Зертханалық жұмыста осциллограмманы алдымен осымен салыстырады.',
      docTitle: 'Конденсатордың резистор арқылы разрядталуы', xLabel: 't, с', yLabel: 'U, В',
      params: { U0: 'бастапқы кернеу, В', R: 'кедергі, кОм', C: 'сыйымдылық, мФ' },
      lines: ['U = U0*exp(-t/(R*C))', '1/e деңгейі = U0*exp(-1)'],
    },
    rlc: {
      title: 'Тізбектей RLC-контур',
      description: 'RLC-тізбекке тұрақты кернеуді қосу: заряд пен токтың тербелмелі және апериодты өтпелі процесі.',
      docTitle: 'RLC-контурдағы өтпелі процесс', xLabel: 't, мс', yLabel: 'q, мКл; i, А',
      params: { E: 'көздің ЭҚК-і, В', R: 'кедергі, Ом', L: 'индуктивтілік, мГн', C: 'сыйымдылық, мкФ' },
      varLabels: { q: 'q, мКл', i: 'i, А' },
    },
    'reaction-chain': {
      title: 'Тізбектей реакция A → B → C',
      description: 'Бірінші ретті кинетика: аралық өнім B максимумнан өтеді. B-ны көбірек жинау үшін синтезді қашан тоқтату керек.',
      docTitle: 'Тізбектей реакция A → B → C', xLabel: 't, мин', yLabel: 'c, моль/л',
      params: { k1: 'A → B тұрақтысы, 1/мин', k2: 'B → C тұрақтысы, 1/мин' },
      varLabels: { A: '[A], моль/л', B: '[B], моль/л', C: '[C], моль/л' },
    },
    'michaelis-menten': {
      title: 'Михаэлис — Ментен кинетикасы',
      description: 'Ферменттік реакция жылдамдығының субстрат концентрациясына тәуелділігі және бәсекелес ингибитордың әсері. Энзимология мен фармакологияның негізі.',
      docTitle: 'Михаэлис — Ментен кинетикасы', xLabel: '[S], мМ', yLabel: 'v, мкМ/с',
      params: { Vmax: 'максималды жылдамдық, мкМ/с', Km: 'Михаэлис тұрақтысы, мМ', I: 'ингибитор концентрациясы, мМ', Ki: 'ингибирлеу тұрақтысы, мМ' },
      lines: ['ингибиторсыз = Vmax*x/(Km + x)', 'ингибитормен = Vmax*x/(Km*(1 + I/Ki) + x)', 'Vmax асимптотасы = Vmax'],
    },
    logistic: {
      title: 'Логистикалық өсу',
      description: 'Ортаның сыйымдылығы шектеулі популяцияның өсуі: S-қисық K деңгейіне шығады. Колбадағы бактериялар, жасуша культуралары, технологиялардың таралуы.',
      docTitle: 'Популяцияның логистикалық өсуі', xLabel: 't, сағ', yLabel: 'N, дарақ',
      params: { K: 'ортаның сыйымдылығы, дарақ', N0: 'бастапқы саны', r: 'өсу жылдамдығы, 1/сағ' },
      lines: ['N = K/(1 + (K/N0 - 1)*exp(-r*t))', 'K асимптотасы = K'],
    },
    'lotka-volterra': {
      title: 'Жыртқыш — жемтік (Лотка — Вольтерра)',
      description: 'Қояндар мен сілеусіндер санының фазалар ығысуымен тербелуі; фазалық жазықтықта — тепе-теңдік нүктесін айнала тұйық орбиталар.',
      docTitle: 'Жыртқыш — жемтік (Лотка — Вольтерра)', xLabel: 't, жыл', yLabel: 'саны',
      params: { a: 'жемтіктің туу жиілігі, 1/жыл', b: 'жыртқыштардың жемтікті жеуі', c: 'жыртқыштардың өлім-жітімі, 1/жыл', d: 'аңшылықтан жыртқыштардың өсімі' },
      varLabels: { x: 'жемтіктер', y: 'жыртқыштар' },
    },
    sir: {
      title: 'SIR эпидемиясы',
      description: 'Бейім → жұқтырған → сауыққан: эпидемия шыңы және R₀ = β/γ табалдырығы. Сырқаттанушылықтың кез келген болжамы осы модельден басталады.',
      docTitle: 'SIR эпидемия моделі', xLabel: 't, тәул', yLabel: 'халық үлесі',
      params: { beta: 'жұқтыру жылдамдығы β, 1/тәул', gamma: 'сауығу жылдамдығы γ, 1/тәул' },
      varLabels: { S: 'S, бейімдер', I: 'I, жұқтырғандар', R: 'R, сауыққандар' },
    },
    lorenz: {
      title: 'Лоренц аттракторы',
      description: 'Хаос тудыратын конвекцияның үш теңдеуі: x–z жазықтығындағы «көбелек» және бастапқы шарттарға сезімталдық.',
      docTitle: 'Лоренц аттракторы', xLabel: 't', yLabel: 'x, y, z',
      params: { s: 'Прандтль саны σ', r: 'Рэлей саны ρ', b: 'геометрия β' },
    },
    'van-der-pol': {
      title: 'Ван дер Поль осцилляторы',
      description: 'Сызықтық емес үйкелісі бар автотербелістер: кез келген траектория шекті циклге оралады; үлкен μ кезінде — релаксациялық тербелістер.',
      docTitle: 'Ван дер Поль осцилляторы', xLabel: 't', yLabel: 'x, y',
      params: { mu: 'сызықтық еместік μ' },
    },
  },
  en: {
    'damped-oscillator': {
      title: 'Damped oscillator',
      description: 'A mass on a spring with viscous friction: under-, over- and critical damping. The basis of mechanics, acoustics and oscillating circuits.',
      docTitle: 'Damped harmonic oscillator', xLabel: 't, s', yLabel: 'x, m; v, m/s',
      params: { g: 'damping coefficient, 1/s', w: 'natural frequency, rad/s' },
      varLabels: { x: 'x, m', v: 'v, m/s' },
    },
    pendulum: {
      title: 'Nonlinear pendulum',
      description: 'A pendulum at large angles: the period depends on amplitude, and the phase plane shows the separatrix and rotation. A classic of nonlinear dynamics.',
      docTitle: 'Nonlinear pendulum with friction', xLabel: 't, s', yLabel: 'θ, rad; ω, rad/s',
      params: { g: 'gravitational acceleration, m/s²', L: 'string length, m', k: 'friction, 1/s' },
      varLabels: { theta: 'θ, rad', omega: 'ω, rad/s' },
    },
    'projectile-drag': {
      title: 'Projectile with air drag',
      description: 'An angled throw with quadratic drag: the trajectory is asymmetric and the range is shorter than the parabolic one. Ballistics, sports, droplets.',
      docTitle: 'Flight with quadratic drag', xLabel: 't, s', yLabel: 'coordinates, m; velocities, m/s',
      params: { k: 'drag k = ρC·S/(2m), 1/m', g: 'gravitational acceleration, m/s²' },
      varLabels: { x: 'x, m', y: 'y, m', vx: 'vx, m/s', vy: 'vy, m/s' },
    },
    'decay-chain': {
      title: 'Radioactive decay chain',
      description: 'Parent nucleus → daughter → stable: build-up and decay of the intermediate isotope, secular equilibrium. Radiochemistry, dating, medicine.',
      docTitle: 'Radioactive decay A → B → C', xLabel: 't, h', yLabel: 'fraction of nuclei',
      params: { T1: 'half-life of A, h', T2: 'half-life of B, h' },
      varLabels: { A: 'A (parent)', B: 'B (daughter)', C: 'C (stable)' },
    },
    'rc-discharge': {
      title: 'Capacitor discharge (RC)',
      description: 'Exponential voltage decay with time constant τ = RC. The first thing an oscilloscope trace is compared with in a lab.',
      docTitle: 'Capacitor discharge through a resistor', xLabel: 't, s', yLabel: 'U, V',
      params: { U0: 'initial voltage, V', R: 'resistance, kΩ', C: 'capacitance, mF' },
      lines: ['U = U0*exp(-t/(R*C))', 'level 1/e = U0*exp(-1)'],
    },
    rlc: {
      title: 'Series RLC circuit',
      description: 'Switching a DC voltage onto an RLC circuit: oscillatory and aperiodic transients of charge and current.',
      docTitle: 'Transient in an RLC circuit', xLabel: 't, ms', yLabel: 'q, mC; i, A',
      params: { E: 'source EMF, V', R: 'resistance, Ω', L: 'inductance, mH', C: 'capacitance, μF' },
      varLabels: { q: 'q, mC', i: 'i, A' },
    },
    'reaction-chain': {
      title: 'Consecutive reaction A → B → C',
      description: 'First-order kinetics: the intermediate B passes through a maximum. When to stop the synthesis to collect the most B.',
      docTitle: 'Consecutive reaction A → B → C', xLabel: 't, min', yLabel: 'c, mol/L',
      params: { k1: 'rate constant A → B, 1/min', k2: 'rate constant B → C, 1/min' },
      varLabels: { A: '[A], mol/L', B: '[B], mol/L', C: '[C], mol/L' },
    },
    'michaelis-menten': {
      title: 'Michaelis–Menten kinetics',
      description: 'Enzyme reaction rate versus substrate concentration and the effect of a competitive inhibitor. The basis of enzymology and pharmacology.',
      docTitle: 'Michaelis–Menten kinetics', xLabel: '[S], mM', yLabel: 'v, μM/s',
      params: { Vmax: 'maximum rate, μM/s', Km: 'Michaelis constant, mM', I: 'inhibitor concentration, mM', Ki: 'inhibition constant, mM' },
      lines: ['no inhibitor = Vmax*x/(Km + x)', 'with inhibitor = Vmax*x/(Km*(1 + I/Ki) + x)', 'asymptote Vmax = Vmax'],
    },
    logistic: {
      title: 'Logistic growth',
      description: 'Population growth with limited carrying capacity: the S-curve levels off at K. Bacteria in a flask, cell cultures, technology adoption.',
      docTitle: 'Logistic population growth', xLabel: 't, h', yLabel: 'N, individuals',
      params: { K: 'carrying capacity, individuals', N0: 'initial population', r: 'growth rate, 1/h' },
      lines: ['N = K/(1 + (K/N0 - 1)*exp(-r*t))', 'asymptote K = K'],
    },
    'lotka-volterra': {
      title: 'Predator–prey (Lotka–Volterra)',
      description: 'Phase-shifted oscillations of hare and lynx populations; closed orbits around the equilibrium in the phase plane.',
      docTitle: 'Predator–prey (Lotka–Volterra)', xLabel: 't, years', yLabel: 'population',
      params: { a: 'prey birth rate, 1/year', b: 'predation rate', c: 'predator death rate, 1/year', d: 'predator growth from hunting' },
      varLabels: { x: 'prey', y: 'predators' },
    },
    sir: {
      title: 'SIR epidemic',
      description: 'Susceptible → infected → recovered: the epidemic peak and the threshold R₀ = β/γ. The model every incidence forecast starts from.',
      docTitle: 'SIR epidemic model', xLabel: 't, days', yLabel: 'fraction of population',
      params: { beta: 'infection rate β, 1/day', gamma: 'recovery rate γ, 1/day' },
      varLabels: { S: 'S, susceptible', I: 'I, infected', R: 'R, recovered' },
    },
    lorenz: {
      title: 'Lorenz attractor',
      description: 'Three convection equations that produce chaos: the “butterfly” in the x–z plane and sensitivity to initial conditions.',
      docTitle: 'Lorenz attractor', xLabel: 't', yLabel: 'x, y, z',
      params: { s: 'Prandtl number σ', r: 'Rayleigh number ρ', b: 'geometry β' },
    },
    'van-der-pol': {
      title: 'Van der Pol oscillator',
      description: 'Self-sustained oscillations with nonlinear friction: every trajectory winds onto a limit cycle; at large μ — relaxation oscillations.',
      docTitle: 'Van der Pol oscillator', xLabel: 't', yLabel: 'x, y',
      params: { mu: 'nonlinearity μ' },
    },
  },
};
