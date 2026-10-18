import fs from 'node:fs';
import path from 'node:path';

/**
 * Картинка из public/landing, если она уже положена (см. materials/landing-images.md), иначе null.
 * Страницы ссылаются только на существующие файлы: 404 в консоли гостя выглядит как поломка.
 */
export function landingAsset(name: string): string | null {
  try {
    return fs.existsSync(path.join(process.cwd(), 'public', 'landing', name)) ? `/landing/${name}` : null;
  } catch {
    return null;
  }
}
