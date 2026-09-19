import Link from 'next/link';
import { listBundledDemos } from '@/lib/demos';
import { LABS } from '@/lib/labs';
import { getPlatformSettings } from '@/lib/platform-settings';
import { Brand } from '@/components/SiteChrome';
import {
  IconCheck, IconCourses, IconLab, IconOrg, IconPlay, IconSpark, IconTask, IconTeach, IconVr, IconWand,
} from '@/components/icons';
import LandingHeroSwitcher from './LandingHeroSwitcher';

const HERO_DEMOS = ['pendulum', 'interference', 'kepler', 'refraction'];

const FEATURES = [
  { icon: IconWand, title: 'Тренажёр по одной фразе', text: 'Опишите явление словами — через пару минут это живая симуляция с ползунками, графиками и формулами. Первая версия появляется сразу, её можно пробовать, пока идёт доводка.' },
  { icon: IconCourses, title: 'Конструктор уроков', text: 'Текст с формулами, картинки, видео, врезки, спойлеры, тренажёры и лаборатории — вставляются через «/», переставляются перетаскиванием, сохраняются сами.' },
  { icon: IconTask, title: '10 типов заданий', text: 'Выбор, число, пропуски, сопоставление, порядок, таблица измерений с графиком, состояние симуляции и развёрнутый ответ. Большинство проверяется мгновенно.' },
  { icon: IconSpark, title: 'Помощник учителя', text: 'Урок по теме за полминуты, задания по тексту, варианты задания с другими числами и черновик оценки развёрнутого ответа по критериям.' },
  { icon: IconVr, title: 'VR-лаборатории', text: 'Оптический стол, стол реакций, клетка и зал алгоритмов — в браузере и в очках Quest по QR-коду, без входа и установки.' },
  { icon: IconOrg, title: 'Школа целиком', text: 'Классы из Excel одной вставкой, листы паролей для печати, журнал, сроки, контрольные с таймером и сводка для директора.' },
];

const STEPS = [
  { n: '1', title: 'Учитель собирает урок', text: 'Сам или с помощником: объяснение, тренажёр, задания. Открывает курс классу и ставит срок.' },
  { n: '2', title: 'Ученик пробует руками', text: 'Меняет параметры, снимает показания пипеткой, строит график, отвечает — и сразу видит разбор.' },
  { n: '3', title: 'Учитель видит картину', text: 'Автопроверка уже поставила баллы, развёрнутые ответы — в ленте проверки с критериями и заготовками.' },
];

/** Первая страница для гостя: показывает продукт, а не форму входа. */
export default async function Landing() {
  const demos = listBundledDemos().filter((d) => HERO_DEMOS.includes(d.slug))
    .sort((a, b) => HERO_DEMOS.indexOf(a.slug) - HERO_DEMOS.indexOf(b.slug));
  const gallery = listBundledDemos();
  const { registrationOpen } = await getPlatformSettings();

  return (
    <div className="land">
      <header className="land-nav">
        <Brand />
        <nav>
          <a href="#features">Возможности</a>
          <a href="#how">Как это работает</a>
          <Link href="/labs">Лаборатории</Link>
        </nav>
        <span className="spacer" />
        <Link className="btn btn-ghost" href="/login">Войти</Link>
        {registrationOpen && <Link className="btn btn-primary" href="/register">Попробовать</Link>}
      </header>

      <section className="land-hero">
        <div className="land-hero-bg" aria-hidden="true"><i /><i /><i /></div>
        <div className="land-hero-text">
          <span className="land-pill"><IconSpark size={14} />Интерактивная физика, химия, биология и информатика</span>
          <h1>Уроки, которые <em>трогают руками</em></h1>
          <p>Tesseract превращает тему урока в живой эксперимент: ученик двигает ползунки, видит, как меняется мир,
            и сразу проверяет себя. Учитель собирает такой урок за минуты — сам или с ИИ-помощником.</p>
          <div className="land-cta">
            <Link className="btn btn-primary land-big" href={registrationOpen ? '/register' : '/login'}>
              {registrationOpen ? 'Создать первый тренажёр' : 'Войти в школу'}
            </Link>
            <Link className="btn land-big" href="/labs"><IconLab size={18} />Открыть лабораторию</Link>
          </div>
          <ul className="land-proof">
            <li><IconCheck size={15} />Работает в браузере и в VR-очках</li>
            <li><IconCheck size={15} />Автопроверка 8 из 10 типов заданий</li>
            <li><IconCheck size={15} />Весь класс — одной вставкой из Excel</li>
          </ul>
        </div>
        <LandingHeroSwitcher demos={demos.map((d) => ({ slug: d.slug, title: d.title, subject: d.subject }))} />
      </section>

      <section className="land-section" id="features">
        <h2>Всё для урока с экспериментом</h2>
        <p className="land-lead">Один продукт вместо конструктора, симулятора, журнала и проверки тетрадей.</p>
        <div className="land-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <article key={title} className="land-feature">
              <span className="land-feature-icon"><Icon size={22} /></span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="land-section land-how" id="how">
        <h2>Как проходит урок</h2>
        <ol className="land-steps">
          {STEPS.map((s) => (
            <li key={s.n}><span className="land-step-n">{s.n}</span><h3>{s.title}</h3><p>{s.text}</p></li>
          ))}
        </ol>
      </section>

      <section className="land-section">
        <h2>Тренажёры, которые уже готовы</h2>
        <p className="land-lead">Каждый можно вставить в урок, настроить стартовые значения и закрыть лишние ползунки.</p>
        <div className="land-gallery">
          {gallery.map((d) => (
            <a key={d.slug} className="land-card" href={`/api/public/demos/${d.slug}`} target="_blank" rel="noopener noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/public/demos/${d.slug}/thumb`} alt="" loading="lazy" />
              <span className="land-card-text"><small>{d.subject}</small><strong>{d.title}</strong></span>
              <span className="land-card-play" aria-hidden="true"><IconPlay size={16} /></span>
            </a>
          ))}
        </div>
      </section>

      <section className="land-section">
        <h2>VR-лаборатории</h2>
        <p className="land-lead">Открываются без входа — на компьютере, телефоне и в очках Quest.</p>
        <div className="land-labs">
          {LABS.map((l) => (
            <Link key={l.slug} className="land-lab" href={`/lab/${l.slug}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/labs/${l.slug}.png`} alt="" loading="lazy" />
              <span><small>{l.subject}</small><strong>{l.title}</strong></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="land-final">
        <h2>Для школы</h2>
        <p>Подключим вашу школу: заведём учителей и классы, покажем конструктор, дадим готовый курс для старта.</p>
        <div className="land-roles">
          <span><IconTeach size={18} />Учителю — конструктор, помощник, лента проверки</span>
          <span><IconCourses size={18} />Ученику — «Сегодня», сроки, мгновенный разбор</span>
          <span><IconOrg size={18} />Директору — классы, пароли, сводка по школе</span>
        </div>
        <Link className="btn btn-primary land-big" href={registrationOpen ? '/register' : '/login'}>{registrationOpen ? 'Начать бесплатно' : 'Войти'}</Link>
      </section>

      <footer className="land-foot"><Brand /><span className="muted">Интерактивные симуляции для уроков · 2026</span></footer>
    </div>
  );
}
