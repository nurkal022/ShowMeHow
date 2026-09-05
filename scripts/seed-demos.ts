import { installDemos } from '../src/lib/demos';
import { closeBrowser } from '../src/lib/renderer';
import { TEMP_OWNER_ID } from '../src/lib/auth/current';

async function main() {
  const { installed, skipped } = await installDemos(TEMP_OWNER_ID);
  console.log(`Установлено: ${installed.length ? installed.join(', ') : '(нет)'}`);
  console.log(`Пропущено (уже установлены): ${skipped.length ? skipped.join(', ') : '(нет)'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeBrowser());
