import { IconSearch } from '@/components/icons';

/** Поиск обычной GET-формой: страница серверная, запрос — в адресе. */
export default function SearchForm({ action, query, placeholder, label }: {
  action: string; query: string; placeholder: string; label: string;
}) {
  return (
    <form className="search" action={action} method="get" role="search">
      <IconSearch size={18} />
      <input name="q" defaultValue={query} placeholder={placeholder} aria-label={label} />
    </form>
  );
}
