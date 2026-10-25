// Язык интерфейса: ?lang= в адресе, иначе cookie tesseract-lang (как в Tesseract), иначе русский.
const pick = () => {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'ru' || q === 'kk' || q === 'en') return q;
    const m = document.cookie.match(/(?:^|;\s*)tesseract-lang=(ru|kk|en)/);
    if (m) return m[1];
  } catch { /* воркер или нет document */ }
  return 'ru';
};

export const LANG = pick();
try { document.documentElement.lang = LANG; } catch { /* нет document */ }

export const tr = (ru, kk, en) => (LANG === 'kk' ? kk : LANG === 'en' ? en : ru);
