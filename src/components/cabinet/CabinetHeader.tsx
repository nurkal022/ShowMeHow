import type { OrgChoice } from '@/lib/org/cabinet';
import OrgSwitcher from './OrgSwitcher';

/** Заголовок страницы кабинета: название, пояснение, переключатель организации и кнопки. */
export default function CabinetHeader({ title, subtitle, org, choices, children }: {
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
      {org && choices && <OrgSwitcher current={org} choices={choices} />}
      {children}
    </div>
  );
}
