/** Шаг «С чего начать»: отмечается по данным кабинета; без href — только подсказка. */
export interface StartStep {
  key: string;
  done: boolean;
  title: string;
  hint: string;
  href?: string;
  cta?: string;
}

/** Cookie, по которой сервер больше не рисует «Первые шаги» этого кабинета. */
export const startCookie = (scope: string) => `onb-${scope}`;
