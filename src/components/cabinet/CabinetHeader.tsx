import type { OrgChoice } from '@/lib/org/cabinet';

/**
 * Заголовок страницы кабинета: название, пояснение и кнопки справа.
 * Организацию теперь переключает боковая панель оболочки; `org` и `choices`
 * остались в свойствах, чтобы страницы не пришлось переписывать.
 */
export default function CabinetHeader({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  org?: string;
  choices?: OrgChoice[];
  children?: React.ReactNode;
}) {
  return (
    <div className="cabinet-head">
      <div className="page-head">
        <h1>{title}</h1>
        {subtitle && <span className="muted">{subtitle}</span>}
      </div>
      {children && <div className="cabinet-head-actions">{children}</div>}
    </div>
  );
}
