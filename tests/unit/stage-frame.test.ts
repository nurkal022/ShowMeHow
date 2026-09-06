import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { kitPreviewDoc } from '@/components/constructor/stage/kitPreviewDoc';

/**
 * Сторож для дефекта, который однажды уже сделал стенд неработоспособным в
 * тёмной теме: сцена белела целиком, образа не было видно.
 *
 * Причина не в наших стилях. Документ внутри sandbox-кадра не получает цветовую
 * схему страницы, и если объявленная им схема расходится со схемой окружения,
 * браузер подкладывает под кадр НЕПРОЗРАЧНЫЙ холст — тот закрывает собой всё,
 * что нарисовано ниже. Опыт показал: совпадать должны схема документа кадра и
 * схема элемента .stage. Обе обязаны быть dark, потому что сцена тёмная в любой
 * теме приложения. «light dark» не годится: без передачи схемы он разрешается
 * в светлую и снова расходится.
 */
describe('кадр приборов не должен закрашивать сцену', () => {
  const doc = kitPreviewDoc();

  it('документ кадра объявляет ровно тёмную схему', () => {
    expect(doc).toContain('color-scheme: dark');
    expect(doc).not.toContain('color-scheme: light dark');
  });

  it('фон документа кадра прозрачный — под ним лежит образ', () => {
    expect(doc).toMatch(/html,\s*body\s*{[^}]*background:\s*transparent/);
  });

  it('у сцены та же тёмная схема, иначе схемы разойдутся', () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
    const stage = css.slice(css.indexOf('\n.stage {'), css.indexOf('\n.stage-art'));
    expect(stage).toContain('color-scheme: dark');
  });
});
