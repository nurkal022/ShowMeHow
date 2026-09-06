import fs from 'node:fs';
import path from 'node:path';
import { listBundledDemos, demosRoot, THUMBNAIL_FILE } from '../src/lib/demos';
import { instrument } from '../src/lib/artifact';
import { renderArtifact, closeBrowser } from '../src/lib/renderer';

/**
 * Перерисовывает превью встроенных демок и кладёт их рядом с артефактом.
 * Демки статичны, поэтому картинка у всех пользователей одна и та же —
 * снимать её при каждой установке значило бы поднимать Chromium на ровном месте.
 * Запускать после правки demos/: npm run demos:thumbs
 */
async function main(): Promise<void> {
  const demos = listBundledDemos();
  if (!demos.length) throw new Error(`демки не найдены в ${demosRoot()}`);
  for (const demo of demos) {
    const report = await renderArtifact(instrument(demo.html));
    const shot = report.screenshots[1] ?? report.screenshots[0];
    if (!shot) {
      console.warn(`${demo.slug}: снимок не получен, пропускаю`);
      continue;
    }
    const file = path.join(demosRoot(), demo.slug, THUMBNAIL_FILE);
    fs.writeFileSync(file, shot);
    console.log(`${demo.slug}: ${Math.round(shot.length / 1024)} КБ`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => closeBrowser());
