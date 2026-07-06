import { installDemos } from '../src/lib/demos';
import { closeBrowser } from '../src/lib/renderer';

async function main() {
  const { installed, skipped } = await installDemos();
  console.log(`Установлено: ${installed.length ? installed.join(', ') : '(нет)'}`);
  console.log(`Пропущено (уже установлены): ${skipped.length ? skipped.join(', ') : '(нет)'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeBrowser());
