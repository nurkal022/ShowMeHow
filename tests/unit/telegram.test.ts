import { describe, it, expect } from 'vitest';
import { parseCommand, parseShare } from '@/lib/telegram/bot';
import { RateLimiter } from '@/lib/telegram/rate';
import { canUseUrlButton, personaHome } from '@/lib/telegram/urls';
import { topicUrl } from '@/lib/telegram/group';
import { isPublicPath } from '@/middleware';

describe('parseCommand', () => {
  it('команда, аргументы и упоминание бота', () => {
    expect(parseCommand('/start')).toEqual({ cmd: 'start', args: '' });
    expect(parseCommand('/START link_abc')).toEqual({ cmd: 'start', args: 'link_abc' });
    expect(parseCommand('/share@TesseractHubBot https://x.kz  коммент ')).toEqual({ cmd: 'share', args: 'https://x.kz  коммент' });
    expect(parseCommand('  /mute 12')).toEqual({ cmd: 'mute', args: '12' });
  });
  it('не команда', () => {
    expect(parseCommand('привет')).toBeNull();
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('/')).toBeNull();
    expect(parseCommand('текст /start')).toBeNull();
  });
});

describe('parseShare', () => {
  const site = 'https://tesseract.kz';
  it('ссылка на наш сайт с комментарием', () => {
    expect(parseShare('https://tesseract.kz/s/42 очень   полезно', site)).toEqual({ url: 'https://tesseract.kz/s/42', comment: 'очень полезно' });
    expect(parseShare('https://tesseract.kz/s/42', site)).toEqual({ url: 'https://tesseract.kz/s/42', comment: '' });
  });
  it('пусто — подсказка', () => {
    expect(parseShare('', site)).toBe('usage');
    expect(parseShare('   ', site)).toBe('usage');
  });
  it('чужие и кривые ссылки отклоняются', () => {
    expect(parseShare('https://evil.kz/s/42', site)).toBe('bad-url');
    expect(parseShare('https://tesseract.kz.evil.kz/', site)).toBe('bad-url');
    expect(parseShare('http://tesseract.kz/s/42', site)).toBe('bad-url');
    expect(parseShare('javascript:alert(1)', site)).toBe('bad-url');
    expect(parseShare('просто текст', site)).toBe('bad-url');
  });
});

describe('RateLimiter', () => {
  it('предупреждает один раз, потом молчит, после окна снова пускает', () => {
    let now = 0;
    const r = new RateLimiter(2, 1000, () => now);
    expect(r.hit(1)).toBe('ok');
    expect(r.hit(1)).toBe('ok');
    expect(r.hit(1)).toBe('limit');
    expect(r.hit(1)).toBe('over');
    expect(r.hit(2)).toBe('ok'); // у другого человека свой счётчик
    now = 1500;
    expect(r.hit(1)).toBe('ok');
  });
});

describe('ссылки', () => {
  it('кнопки только для настоящих доменов', () => {
    expect(canUseUrlButton('https://tesseract.kz/tg/claim?t=x')).toBe(true);
    expect(canUseUrlButton('http://localhost:3000/x')).toBe(false);
    expect(canUseUrlButton('http://10.0.0.5:3000/x')).toBe(false);
    expect(canUseUrlButton('не ссылка')).toBe(false);
  });
  it('домашняя страница по роли', () => {
    expect(personaHome('teacher')).toBe('/teach');
    expect(personaHome('student')).toBe('/learn');
    expect(personaHome('researcher')).toBe('/research');
    expect(personaHome(null)).toBe('/');
  });
  it('ссылка на тему без префикса -100', () => {
    const g = { chatId: -1004444056400, topics: { biology: 9 } };
    expect(topicUrl(g, 'biology')).toBe('https://t.me/c/4444056400/9');
    expect(topicUrl(g, 'math')).toBeNull();
  });
  it('страницы бота открыты без входа, остальное — нет', () => {
    expect(isPublicPath('/tg/claim')).toBe(true);
    expect(isPublicPath('/api/tg/login')).toBe(true);
    expect(isPublicPath('/api/me/telegram')).toBe(false);
    expect(isPublicPath('/admin/community')).toBe(false);
  });
});
