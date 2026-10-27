/** Текст ответа наставника → то, что можно прочитать вслух: без разметки, ссылок и команд TeX. Модуль чистый. */
export function speechText(s: string): string {
  return s
    .replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1')
    .replace(/\$\$?([^$]+)\$\$?/g, (_, tex: string) => tex
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1 / $2')
      .replace(/\\(?:cdot|times)/g, ' · ')
      .replace(/\\(?:text|mathrm|mathbf)\{([^{}]*)\}/g, '$1')
      .replace(/\\([A-Za-z]+)/g, '$1')
      .replace(/[{}_]/g, ' '))
    .replace(/^#+\s*/gm, '')
    .replace(/^\s*-\s+/gm, '')
    .replace(/\*\*?([^*\n]+)\*\*?/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
