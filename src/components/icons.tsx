/**
 * Единственный источник иконок. Всё рисуется линиями в currentColor,
 * поэтому иконка наследует цвет и состояние кнопки, в которую вложена.
 * Эмодзи в интерфейсе не используются: они разные в каждой ОС и ломают ритм строки.
 */
interface IconProps { size?: number; className?: string }

function svg(path: React.ReactNode, extra?: { fill?: boolean }) {
  return function Icon({ size = 20, className }: IconProps) {
    return (
      <svg
        width={size} height={size} viewBox="0 0 24 24" className={className}
        fill={extra?.fill ? 'currentColor' : 'none'}
        stroke={extra?.fill ? 'none' : 'currentColor'}
        strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
        aria-hidden="true" focusable="false"
      >{path}</svg>
    );
  };
}

export const IconLogo = svg(<>
  <path d="M12 2.6 20.5 7v10L12 21.4 3.5 17V7z" />
  <path d="M12 12.2 20.5 7M12 12.2 3.5 7M12 12.2v9.2" opacity=".55" />
</>);

export const IconPlus = svg(<><path d="M12 5v14M5 12h14" /></>);
export const IconLibrary = svg(<>
  <rect x="3" y="4" width="7" height="16" rx="1.5" />
  <rect x="14" y="4" width="7" height="7" rx="1.5" />
  <rect x="14" y="13" width="7" height="7" rx="1.5" />
</>);
export const IconPlay = svg(<><path d="M8 5.6v12.8l10-6.4z" /></>);
export const IconDownload = svg(<><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M4 18h16" /></>);
export const IconTrash = svg(<>
  <path d="M4 7h16M9.5 7V5h5v2" /><path d="M6.5 7 7.4 20h9.2L17.5 7" /><path d="M10 11v5M14 11v5" />
</>);
export const IconCheck = svg(<><path d="M4.5 12.5 9.5 17.5 19.5 6.5" /></>);
export const IconAlert = svg(<><path d="M12 3.8 21 19.4H3z" /><path d="M12 9.6v4.2M12 16.8h.01" /></>);
export const IconClose = svg(<><path d="M6 6l12 12M18 6L6 18" /></>);
export const IconMic = svg(<>
  <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v3" />
</>);
export const IconImage = svg(<>
  <rect x="3" y="4.5" width="18" height="15" rx="2.5" /><circle cx="8.8" cy="10" r="1.6" />
  <path d="m4 17 4.8-4.5 4 3.6 3-2.6L20 17.5" />
</>);
export const IconSliders = svg(<>
  <path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" />
</>);
export const IconUser = svg(<><circle cx="12" cy="8.2" r="3.6" /><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" /></>);
export const IconLogout = svg(<>
  <path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15" />
  <path d="M11 16l4-4-4-4M15 12H4" />
</>);
export const IconSearch = svg(<><circle cx="11" cy="11" r="6.3" /><path d="m15.8 15.8 4.2 4.2" /></>);
export const IconSun = svg(<>
  <circle cx="12" cy="12" r="4" />
  <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
</>);
export const IconMoon = svg(<><path d="M20 13.6A8.2 8.2 0 0 1 10.4 4a8.4 8.4 0 1 0 9.6 9.6z" /></>);
export const IconMonitor = svg(<>
  <rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M9 20h6M12 16.5V20" />
</>);
export const IconSend = svg(<><path d="M12 19V5M12 5l-6 6M12 5l6 6" /></>);
export const IconWand = svg(<>
  <path d="M4 20 15 9" /><path d="m17.5 3-1 2.6L14 6.6l2.5 1 1 2.6 1-2.6 2.5-1-2.5-1z" /><path d="M7.5 4.5 8 6l1.5.5L8 7l-.5 1.5L7 7l-1.5-.5L7 6z" />
</>);
export const IconHistory = svg(<>
  <path d="M4.2 12a7.8 7.8 0 1 0 2.4-5.6" /><path d="M4 4v4h4" /><path d="M12 8v4.4l3 1.8" />
</>);
export const IconExpand = svg(<><path d="M9 4H4v5M15 20h5v-5M20 9V4h-5M4 15v5h5" /></>);
export const IconChevron = svg(<><path d="m7 10 5 5 5-5" /></>);
export const IconBack = svg(<><path d="M11 6l-6 6 6 6M5 12h14" /></>);
export const IconSpark = svg(<>
  <path d="m12 3 2 6.2 6.2 2-6.2 2L12 21l-2-7.8-6.2-2 6.2-2z" />
</>);
export const IconKey = svg(<>
  <circle cx="8" cy="12" r="4.2" /><path d="M12.2 12H21M18 12v3M15 12v2" />
</>);
