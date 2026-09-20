'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Слой окон: рисует содержимое прямо в оболочке кабинета, а не там, где стоит кнопка.
 * Иначе окно наследует у родителя изоляцию слоёв, цвет текста и выравнивание — и уезжает
 * под верхнюю панель, как было с «Новым курсом» в цветной шапке «Сегодня».
 */
export default function Layer({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => { setHost(document.querySelector('.cab') ?? document.body); }, []);
  return host ? createPortal(children, host) : null;
}
