import { closeDb } from '../src/lib/db/client';
import {
  createLoginUser, disableUser, findUserByIdentifier, setTemporaryPassword,
  InvalidLoginError, LoginTakenError, type AuthUser, type StoredUser,
} from '../src/lib/auth/users';
import { generateTempPassword } from '../src/lib/auth/temp-password';
import {
  addMember, createOrganization, findOrgBySlug, listOrganizations, updateOrgSettings, type Organization,
} from '../src/lib/org/orgs';
import { addToGroup, assignTeacher, createGroup, findGroupByTitle, type Group } from '../src/lib/org/groups';
import { ORG_SETTING_KEYS, sanitizeOrgSettings, type OrgSettingKey } from '../src/lib/org/settings';
import { OrgError, isOrgRole, type OrgRole } from '../src/lib/org/types';

/**
 * Управление организациями из консоли — до кабинета организации (цикл 2)
 * и админки (цикл 6). Работает через те же функции src/lib/org/*, что потом
 * позовут экраны.
 */

export const USAGE = [
  'Использование:',
  '  npm run org -- create --slug sch12 --name "Школа №12" --kind school',
  '  npm run org -- list',
  '  npm run org -- add-member --org sch12 --user teacher@example.com --role teacher',
  '  npm run org -- create-user --org sch12 --login ivanov.i.sch12 --name "Иванов Иван" --role student',
  '  npm run org -- create-group --org sch12 --title 7А',
  '  npm run org -- add-to-group --org sch12 --group 7А --user ivanov.i.sch12',
  '  npm run org -- assign-teacher --org sch12 --group 7А --user teacher@example.com',
  '  npm run org -- reset-password --user ivanov.i.sch12',
  '  npm run org -- disable --user ivanov.i.sch12',
  '  npm run org -- set --org sch12 studentsCanGenerate=true',
].join('\n');

export interface ParsedArgs {
  command: string;
  flags: Record<string, string>;
  rest: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = '', ...tail] = argv;
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < tail.length; i++) {
    const arg = tail[i];
    if (!arg.startsWith('--')) {
      rest.push(arg);
      continue;
    }
    const name = arg.slice(2);
    const value = tail[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new OrgError(`У флага --${name} нет значения.`);
    }
    flags[name] = value;
    i++;
  }
  return { command, flags, rest };
}

export function parseSettingAssignment(raw: string): { key: OrgSettingKey; value: boolean | number } {
  const eq = raw.indexOf('=');
  if (eq <= 0) throw new OrgError(`Настройка записывается как ключ=значение, получено «${raw}».`);
  const key = raw.slice(0, eq);
  const text = raw.slice(eq + 1);
  if (!(ORG_SETTING_KEYS as readonly string[]).includes(key)) {
    throw new OrgError(`Неизвестная настройка «${key}». Допустимые: ${ORG_SETTING_KEYS.join(', ')}.`);
  }
  const value = text === 'true' ? true : text === 'false' ? false : /^\d+$/.test(text) ? Number(text) : NaN;
  // Тип значения проверяет тот же белый список, что и запись в базу.
  if (!(key in sanitizeOrgSettings({ [key]: value }))) {
    throw new OrgError(`Недопустимое значение «${text}» для настройки «${key}».`);
  }
  return { key: key as OrgSettingKey, value: value as boolean | number };
}

function flag(flags: Record<string, string>, name: string, hint: string): string {
  const value = flags[name]?.trim();
  if (!value) throw new OrgError(`Укажите ${hint}: --${name}.`);
  return value;
}

async function requireOrg(flags: Record<string, string>): Promise<Organization> {
  const slug = flag(flags, 'org', 'организацию');
  const org = await findOrgBySlug(slug);
  if (!org) throw new OrgError(`Организация «${slug}» не найдена.`);
  return org;
}

async function requireUser(flags: Record<string, string>): Promise<StoredUser> {
  const raw = flag(flags, 'user', 'пользователя (почту или логин)');
  const user = await findUserByIdentifier(raw);
  if (!user) throw new OrgError(`Пользователь «${raw}» не найден.`);
  return user;
}

async function requireGroup(org: Organization, flags: Record<string, string>): Promise<Group> {
  const title = flag(flags, 'group', 'группу');
  const group = await findGroupByTitle(org.id, title);
  if (!group) throw new OrgError(`Группа «${title}» не найдена в организации ${org.slug}.`);
  return group;
}

function requireRole(flags: Record<string, string>): OrgRole {
  const role = flag(flags, 'role', 'роль');
  if (!isOrgRole(role)) throw new OrgError('Роль — org_admin, teacher или student.');
  return role;
}

function nameOf(user: StoredUser): string {
  return user.login ?? user.email ?? user.id;
}

export async function runOrgCommand(argv: string[], print: (line: string) => void): Promise<void> {
  const { command, flags, rest } = parseArgs(argv);
  switch (command) {
    case '':
    case 'help': {
      print(USAGE);
      return;
    }
    case 'create': {
      const org = await createOrganization({
        slug: flag(flags, 'slug', 'слаг'), name: flag(flags, 'name', 'название'), kind: flag(flags, 'kind', 'тип'),
      });
      print(`Организация ${org.slug} создана.`);
      return;
    }
    case 'list': {
      const orgs = await listOrganizations();
      if (orgs.length === 0) print('Организаций пока нет.');
      for (const o of orgs) {
        print(`${o.slug}\t${o.name}\t${o.kind}\tучастников: ${o.memberCount}${o.archivedAt ? '\t(в архиве)' : ''}`);
      }
      return;
    }
    case 'add-member': {
      const org = await requireOrg(flags);
      const role = requireRole(flags);
      const user = await requireUser(flags);
      await addMember(org.id, user.id, role);
      print(`${nameOf(user)} теперь ${role} в ${org.slug}.`);
      return;
    }
    case 'create-user': {
      // Всё проверяется до создания аккаунта, чтобы отказ не оставлял сирот.
      const org = await requireOrg(flags);
      const role = requireRole(flags);
      const login = flag(flags, 'login', 'логин');
      const displayName = flag(flags, 'name', 'имя');
      const password = generateTempPassword();
      let user: AuthUser;
      try {
        user = await createLoginUser({ login, displayName, password, mustChangePassword: true });
      } catch (e) {
        if (e instanceof InvalidLoginError || e instanceof LoginTakenError) throw new OrgError(e.message);
        throw e;
      }
      await addMember(org.id, user.id, role);
      print(`Пользователь ${user.login} создан: ${role} в ${org.slug}.`);
      print(`Временный пароль (показывается один раз): ${password}`);
      return;
    }
    case 'create-group': {
      const org = await requireOrg(flags);
      const group = await createGroup(org.id, flag(flags, 'title', 'название группы'));
      print(`Группа «${group.title}» создана в ${org.slug}.`);
      return;
    }
    case 'add-to-group': {
      const org = await requireOrg(flags);
      const group = await requireGroup(org, flags);
      const user = await requireUser(flags);
      await addToGroup(group.id, user.id);
      print(`${nameOf(user)} добавлен в группу «${group.title}».`);
      return;
    }
    case 'assign-teacher': {
      const org = await requireOrg(flags);
      const group = await requireGroup(org, flags);
      const user = await requireUser(flags);
      await assignTeacher(group.id, user.id);
      print(`${nameOf(user)} ведёт группу «${group.title}».`);
      return;
    }
    case 'reset-password': {
      const user = await requireUser(flags);
      const password = generateTempPassword();
      await setTemporaryPassword(user.id, password);
      print(`Пароль ${nameOf(user)} сброшен, все сессии закрыты.`);
      print(`Временный пароль (показывается один раз): ${password}`);
      return;
    }
    case 'disable': {
      const user = await requireUser(flags);
      await disableUser(user.id);
      print(`Пользователь ${nameOf(user)} заблокирован.`);
      return;
    }
    case 'set': {
      const org = await requireOrg(flags);
      if (rest.length === 0) throw new OrgError('Укажите хотя бы одну настройку: ключ=значение.');
      // Сначала разбираем все пары: кривая пара не должна записать соседние.
      const patch: Record<string, boolean | number> = {};
      for (const raw of rest) {
        const { key, value } = parseSettingAssignment(raw);
        patch[key] = value;
      }
      const settings = await updateOrgSettings(org.id, patch);
      print(`Настройки ${org.slug}: ${JSON.stringify(settings)}`);
      return;
    }
    default:
      throw new OrgError(`Неизвестная команда «${command}».\n${USAGE}`);
  }
}

// Запуск как скрипт: `npm run org -- <команда>`. При импорте из тестов main не вызывается.
if (process.argv[1]?.endsWith('org.ts')) {
  runOrgCommand(process.argv.slice(2), (line) => console.log(line))
    .catch((e) => {
      console.error(e instanceof OrgError ? e.message : e);
      process.exitCode = 1;
    })
    .finally(() => closeDb());
}
