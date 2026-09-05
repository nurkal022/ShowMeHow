import { installDemos } from '../src/lib/demos';
import { closeBrowser } from '../src/lib/renderer';
import { closeDb } from '../src/lib/db/client';
import { findUserByEmail } from '../src/lib/auth/users';

// Владелец больше не заглушка: демки устанавливаются существующему пользователю,
// почта которого передаётся аргументом (npm run seed -- owner@example.com).
async function main() {
  const email = process.argv[2];
  if (!email) {
    throw new Error('укажите почту владельца: npm run seed -- owner@example.com');
  }
  const user = await findUserByEmail(email);
  if (!user) {
    throw new Error(`пользователь с почтой ${email} не найден`);
  }
  const { installed, skipped } = await installDemos(user.id);
  console.log(`Установлено: ${installed.length ? installed.join(', ') : '(нет)'}`);
  console.log(`Пропущено (уже установлены): ${skipped.length ? skipped.join(', ') : '(нет)'}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => { closeBrowser(); void closeDb(); });
