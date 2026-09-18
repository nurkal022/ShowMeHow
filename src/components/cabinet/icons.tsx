/**
 * Иконки оболочки кабинетов. Рисуются так же, как в src/components/icons.tsx
 * (линии в currentColor), но живут отдельно: общий файл правят параллельно.
 */
interface IconProps { size?: number; className?: string }

function svg(path: React.ReactNode) {
  return function Icon({ size = 20, className }: IconProps) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="none"
        stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false">{path}</svg>
    );
  };
}

export const IconMenu = svg(<><path d="M4 7h16M4 12h16M4 17h16" /></>);
export const IconDashboard = svg(<>
  <rect x="3.5" y="3.5" width="7" height="9" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.6" />
  <rect x="13.5" y="11.5" width="7" height="9" rx="1.6" /><rect x="3.5" y="15.5" width="7" height="5" rx="1.6" />
</>);
export const IconPeople = svg(<>
  <circle cx="9" cy="8.4" r="3.2" /><path d="M2.8 19.6a6.2 6.2 0 0 1 12.4 0" />
  <path d="M16 5.6a3.1 3.1 0 0 1 0 5.8M17.6 14.4a5.6 5.6 0 0 1 3.6 5.2" />
</>);
export const IconGroup = svg(<>
  <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" /><path d="M3.5 9.5h17M8.5 4.5v15" />
</>);
export const IconSettings = svg(<>
  <circle cx="12" cy="12" r="3" />
  <path d="M12 3.2v2.4M12 18.4v2.4M3.2 12h2.4M18.4 12h2.4M5.8 5.8l1.7 1.7M16.5 16.5l1.7 1.7M18.2 5.8l-1.7 1.7M7.5 16.5l-1.7 1.7" />
</>);
export const IconList = svg(<><path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" /></>);
export const IconCatalog = svg(<>
  <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" />
  <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><path d="M17 14v6M14 17h6" />
</>);
export const IconChevronRight = svg(<><path d="m10 7 5 5-5 5" /></>);
export const IconInbox = svg(<>
  <path d="M3.5 13.5 6 5.6A1.6 1.6 0 0 1 7.5 4.5h9A1.6 1.6 0 0 1 18 5.6l2.5 7.9v4.4a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z" />
  <path d="M3.5 13.5h4.6l1.2 2.4h5.4l1.2-2.4h4.6" />
</>);
export const IconChart = svg(<><path d="M4 19.5h16" /><path d="m5 15 4.5-5 3.5 3 6-7" /></>);
export const IconStar = svg(<><path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8z" /></>);
export const IconView = svg(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>);
export const IconExternal = svg(<><path d="M13.5 4.5h6v6M19.5 4.5l-8 8" /><path d="M18 13.5v4.4a1.6 1.6 0 0 1-1.6 1.6H6.1a1.6 1.6 0 0 1-1.6-1.6V7.6A1.6 1.6 0 0 1 6.1 6h4.4" /></>);
