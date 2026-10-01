/**
 * Шрифт заголовков раздела «Исследования» — PT Serif: в нём есть все казахские буквы.
 * React поднимает stylesheet с precedence в <head>, а повторные подключения схлопывает.
 */
export default function ResearchFonts() {
  return <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=PT+Serif:ital,wght@0,400;0,700;1,400&display=swap" precedence="default" />;
}
