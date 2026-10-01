/**
 * Координаты каретки внутри textarea — чтобы всплывающее меню «/» и «@» появлялось
 * прямо у курсора. Классический приём: зеркальный div с теми же стилями и текстом до каретки.
 */
const PROPS = [
  'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform', 'textIndent', 'letterSpacing', 'wordSpacing', 'tabSize',
] as const;

export function caretCoords(el: HTMLTextAreaElement, pos: number): { top: number; left: number; height: number } {
  const div = document.createElement('div');
  const style = getComputedStyle(el);
  for (const p of PROPS) div.style[p] = style[p];
  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.overflowWrap = 'break-word';
  div.textContent = el.value.slice(0, pos);
  const span = document.createElement('span');
  span.textContent = el.value.slice(pos) || '.';
  div.appendChild(span);
  document.body.appendChild(div);
  const top = span.offsetTop - el.scrollTop;
  const left = span.offsetLeft - el.scrollLeft;
  const height = parseFloat(style.lineHeight) || 20;
  document.body.removeChild(div);
  return { top, left, height };
}
