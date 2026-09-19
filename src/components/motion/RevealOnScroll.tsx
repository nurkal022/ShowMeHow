'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

const SELECTOR = '.learn-block, .cab-card, .panel, .chart-card, .lab-card, .learn-topic, .cf-block';

/**
 * Блоки ниже первого экрана проявляются, когда до них докручивают. Один наблюдатель на
 * страницу; то, что уже видно при загрузке, не трогаем — иначе контент мигал бы при входе.
 */
export default function RevealOnScroll() {
  const pathname = usePathname();
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('reveal-in');
        io.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    const arm = () => {
      for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
        if (el.dataset.reveal) continue;
        el.dataset.reveal = '1';
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) continue;
        el.classList.add('reveal');
        io.observe(el);
      }
    };
    const timer = setTimeout(arm, 60);
    return () => { clearTimeout(timer); io.disconnect(); };
  }, [pathname]);
  return null;
}
