'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/** Обратный отсчёт контрольной. Когда время выходит, страница перечитывается: сервер закрывает формы и открывает разбор. */
export default function ExamTimer({ deadline }: { deadline: string }) {
  const router = useRouter();
  const end = new Date(deadline).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));
  useEffect(() => {
    const timer = setInterval(() => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      if (ms === 0) { clearInterval(timer); router.refresh(); }
    }, 1000);
    return () => clearInterval(timer);
  }, [end, router]);
  const total = Math.ceil(left / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return (
    <span className={total <= 60 ? 'learn-timer hot' : total <= 300 ? 'learn-timer warm' : 'learn-timer'} role="timer" aria-live="off">
      <span className="learn-timer-dot" aria-hidden="true" />{`${mm}:${ss}`}
    </span>
  );
}
