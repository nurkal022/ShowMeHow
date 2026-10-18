/**
 * Стили UI-kit'а. Тёмное «стекло» поверх сцены: панели не спорят с визуализацией,
 * цифры моноширинные (не прыгают), всё появляется мягко. На телефоне угловые панели
 * уходят во вкладки дока снизу и открываются листом — сцена остаётся свободной.
 */
export const UIKIT_CSS = `
:root { --sim-bg:#101318; --sim-panel:#161c25; --sim-text:#e8ecf1; --sim-muted:#8b95a3;
  --sim-accent:#5b9cff; --sim-border:rgba(148,163,184,.16); --sim-soft:rgba(148,163,184,.09);
  --sim-glass:rgba(19,24,33,.93); --sim-shadow:0 1px 0 rgba(255,255,255,.045) inset, 0 2px 8px rgba(0,0,0,.28);
  --sim-ease:cubic-bezier(.2,.8,.2,1); }
body { margin:0; background:var(--sim-bg); color:var(--sim-text);
  font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; -webkit-font-smoothing:antialiased; }
@keyframes sim-in { from { opacity:0; transform:translateY(8px) scale(.985); } to { opacity:1; transform:none; } }
@keyframes sim-pulse { 0% { box-shadow:0 0 0 0 color-mix(in srgb, var(--sim-banner-color, var(--sim-accent)) 55%, transparent); }
  100% { box-shadow:0 0 0 14px transparent; } }
@keyframes sim-fade { from { opacity:0; } to { opacity:1; } }
@keyframes sim-toast-in { from { opacity:0; transform:translateY(-8px) scale(.97); } to { opacity:1; transform:none; } }
@keyframes sim-press { 0% { transform:scale(1); } 40% { transform:scale(.94); } 100% { transform:scale(1); } }

.sim-panel { position:fixed; right:12px; top:12px; width:260px; padding:14px; box-sizing:border-box;
  background:var(--sim-glass); border:1px solid var(--sim-border); border-radius:14px;
  box-shadow:var(--sim-shadow); display:flex; flex-direction:column; gap:11px; z-index:10;
  animation:sim-in .4s var(--sim-ease) backwards; }
.sim-panel.sim-scroll { max-height:calc(100vh - 24px); overflow-y:auto; scrollbar-width:thin; overscroll-behavior:contain; }
.sim-panel h1 { font-size:14.5px; font-weight:650; letter-spacing:.1px; margin:0; padding-right:32px; line-height:1.3;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.sim-group { font-size:10.5px; font-weight:600; letter-spacing:.7px; text-transform:uppercase; color:var(--sim-muted);
  display:flex; align-items:center; gap:8px; margin-top:4px; }
.sim-group::after { content:''; flex:1; height:1px; background:var(--sim-border); }
.sim-control label { display:flex; justify-content:space-between; align-items:baseline; gap:8px;
  font-size:12px; color:var(--sim-muted); margin-bottom:6px; }
.sim-value { color:var(--sim-text); font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }

/* Ползунок: заполненная часть дорожки — цветом акцента (--k ставит кит). */
.sim-control input[type=range] { -webkit-appearance:none; appearance:none; width:100%; height:18px; margin:0;
  background:transparent; cursor:pointer; }
.sim-control input[type=range]::-webkit-slider-runnable-track { height:4px; border-radius:4px;
  background:linear-gradient(to right, var(--sim-accent) var(--k, 50%), rgba(148,163,184,.22) var(--k, 50%)); }
.sim-control input[type=range]::-moz-range-track { height:4px; border-radius:4px; background:rgba(148,163,184,.22); }
.sim-control input[type=range]::-moz-range-progress { height:4px; border-radius:4px; background:var(--sim-accent); }
.sim-control input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; margin-top:-6px;
  border-radius:50%; background:#fff; border:3px solid var(--sim-accent); box-shadow:0 1px 6px rgba(0,0,0,.45);
  transition:transform .15s var(--sim-ease); }
.sim-control input[type=range]::-moz-range-thumb { width:12px; height:12px; border-radius:50%; background:#fff;
  border:3px solid var(--sim-accent); }
.sim-control input[type=range]:hover::-webkit-slider-thumb { transform:scale(1.15); }
.sim-control input[type=range]:focus-visible { outline:2px solid color-mix(in srgb, var(--sim-accent) 60%, transparent); outline-offset:3px; border-radius:6px; }

.sim-btns { display:flex; gap:8px; }
.sim-btns button, .sim-presets button, .sim-task-row button { flex:1; padding:7px 10px; border-radius:9px;
  border:1px solid var(--sim-border); background:var(--sim-soft); color:var(--sim-text); cursor:pointer;
  font:inherit; font-size:13px; font-weight:500; transition:background .15s, border-color .15s, transform .1s; }
.sim-btns button:hover, .sim-presets button:hover, .sim-task-row button:hover { border-color:color-mix(in srgb, var(--sim-accent) 70%, transparent);
  background:color-mix(in srgb, var(--sim-accent) 12%, transparent); }
.sim-btns button:active, .sim-presets button:active { transform:scale(.97); }
.sim-btns button.sim-primary, .sim-presets button.on { background:color-mix(in srgb, var(--sim-accent) 26%, transparent);
  border-color:color-mix(in srgb, var(--sim-accent) 75%, transparent); }
.sim-presets { display:flex; flex-wrap:wrap; gap:6px; }
.sim-presets button { flex:1 1 auto; font-size:12px; padding:6px 10px; }

/* Сегментированный выбор: скорость времени и короткие варианты select. */
.sim-seg { display:flex; gap:2px; padding:2px; border-radius:10px; background:var(--sim-soft); border:1px solid var(--sim-border); }
.sim-seg button { flex:1; min-width:0; padding:5px 4px; border:0; border-radius:8px; background:transparent;
  color:var(--sim-muted); font:inherit; font-size:12px; font-weight:500; cursor:pointer; transition:background .15s, color .15s; }
.sim-seg button:hover { color:var(--sim-text); }
.sim-seg button.on { background:color-mix(in srgb, var(--sim-accent) 30%, #1c2431); color:var(--sim-text);
  box-shadow:0 1px 3px rgba(0,0,0,.3); }
.sim-select { width:100%; padding:7px 9px; border-radius:9px; border:1px solid var(--sim-border);
  background:var(--sim-soft); color:var(--sim-text); font:inherit; font-size:13px; cursor:pointer; }
.sim-select option { background:#161c25; }
.sim-control-toggle { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.sim-control-toggle label { margin:0; }
.sim-switch { position:relative; flex:0 0 auto; width:36px; height:20px; border-radius:999px; border:0; padding:0;
  background:rgba(148,163,184,.28); cursor:pointer; transition:background .2s; }
.sim-switch::after { content:''; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%;
  background:#fff; box-shadow:0 1px 3px rgba(0,0,0,.4); transition:transform .2s var(--sim-ease); }
.sim-switch.on { background:var(--sim-accent); }
.sim-switch.on::after { transform:translateX(16px); }
.sim-toggle { width:100%; padding:6px 8px; border-radius:8px; border:1px solid var(--sim-border);
  background:var(--sim-soft); color:var(--sim-text); font:inherit; font-size:13px; cursor:pointer; }
.sim-toggle-on { border-color:var(--sim-accent); color:var(--sim-accent); }

.sim-panel-close, .sim-dock { display:none; }

.smh-collapse-btn { position:absolute; top:7px; right:7px; z-index:3; width:26px; height:26px;
  border-radius:8px; border:1px solid var(--sim-border); background:var(--sim-soft); color:var(--sim-muted);
  font-size:12px; line-height:1; cursor:pointer; padding:0; transition:color .15s, border-color .15s; }
.smh-collapse-btn:hover { color:var(--sim-text); border-color:color-mix(in srgb, var(--sim-accent) 60%, transparent); }
/* Свёрнутая панель без заголовка — квадрат ровно под кнопку. Раньше она схлопывалась по
   содержимому (width:auto с одной абсолютной кнопкой — это 14×14 px), а
   overflow:hidden отрезал кнопку, торчавшую за этот край: развернуть панель
   обратно было невозможно, клик попадал в пустоту. */
[data-smh-panel].smh-collapsed { width:40px!important; min-width:0!important; max-width:none!important;
  height:40px!important; min-height:0!important; max-height:none!important;
  padding:0!important; overflow:hidden!important; box-sizing:border-box!important; }
[data-smh-panel].smh-collapsed > *:not(.smh-collapse-btn) { display:none!important; }
/* С заголовком — таблетка с названием: видно, что спрятано. */
[data-smh-panel].smh-collapsed.smh-has-title { width:auto!important; height:auto!important; min-height:40px!important;
  padding:10px 44px 10px 14px!important; display:flex!important; align-items:center; }
[data-smh-panel].smh-collapsed.smh-has-title > .sim-side-title,
[data-smh-panel].smh-collapsed.smh-has-title > h1 { display:block!important; cursor:pointer; margin:0; padding:0; font-size:13px; white-space:nowrap; }

.sim-corner { position:fixed; z-index:9; display:flex; flex-direction:column; gap:10px;
  overflow-y:auto; overflow-x:hidden; scrollbar-width:none; padding:2px; }
.sim-corner::-webkit-scrollbar { display:none; }
.sim-corner-tl, .sim-corner-bl { align-items:flex-start; }
.sim-corner-tr, .sim-corner-br { align-items:flex-end; }
/* Верхний и нижний угол одной стороны делят высоту окна: панели урока, таблиц и
   показаний больше не налезают друг на друга, лишнее прокручивается внутри угла.
   Правый верхний угол — слева от панели параметров, а не под ней. */
.sim-corner-tl { left:10px; top:10px; max-height:calc(58vh - 16px); }
.sim-corner-bl { left:10px; bottom:10px; max-height:calc(42vh - 16px); }
.sim-corner-tr { right:282px; top:90px; max-height:calc(58vh - 96px); }
.sim-corner-br { right:10px; bottom:10px; max-height:calc(42vh - 16px); }
.sim-side-panel { position:relative; max-width:min(340px,42vw); padding:12px 14px; box-sizing:border-box;
  background:var(--sim-glass); border:1px solid var(--sim-border); border-radius:14px;
  box-shadow:var(--sim-shadow); font-size:12px; color:var(--sim-text);
  display:flex; flex-direction:column; gap:8px; animation:sim-in .45s var(--sim-ease) backwards; }
.sim-side-title { font-size:12.5px; font-weight:650; margin:0; padding-right:30px; line-height:26px; letter-spacing:.1px; }
.sim-side-body { display:flex; flex-direction:column; gap:6px; }
.sim-corner > :nth-child(2) { animation-delay:.06s; } .sim-corner > :nth-child(3) { animation-delay:.12s; }

.sim-chart { display:block; border-radius:10px; border:1px solid var(--sim-border); background:rgba(8,11,16,.45); }
.sim-chart-legend { display:flex; flex-wrap:wrap; gap:4px 12px; margin-top:2px; font-size:11px; color:var(--sim-muted); }
.sim-chart-legend span, .sim-legend span { display:inline-flex; align-items:center; gap:5px; }
.sim-chart-legend i, .sim-legend i { width:10px; height:3px; border-radius:2px; display:inline-block; }
.sim-legend i { width:10px; height:10px; border-radius:3px; }

.sim-readout { display:flex; justify-content:space-between; align-items:baseline; gap:14px; font-size:12px;
  color:var(--sim-muted); line-height:1.75; }
.sim-readout-label { display:inline-flex; align-items:center; gap:6px; }
.sim-readout[style*="--sim-dot"] .sim-readout-label::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--sim-dot); }
.sim-readout-value { color:var(--sim-text); font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; }
.sim-legend { display:flex; flex-wrap:wrap; gap:6px 12px; font-size:11.5px; color:var(--sim-muted); }
.sim-formula-tex { font-size:16px; color:var(--sim-text); overflow-x:auto; overflow-y:hidden; scrollbar-width:none; padding:2px 0; }
.sim-formula-tex .katex-display { margin:0; text-align:left; }
.sim-formula-tex .katex-display > .katex { text-align:left; }
.sim-formula-nums { display:flex; flex-wrap:wrap; gap:4px; font-size:11.5px; font-variant-numeric:tabular-nums; }
.sim-formula-nums:empty { display:none; }
.sim-chip { display:inline-flex; align-items:baseline; gap:2px; padding:2px 8px; border-radius:999px;
  background:var(--sim-soft); border:1px solid var(--sim-border); }
.sim-chip i { font-style:normal; color:var(--sim-muted); }
.sim-chip b { font-weight:600; color:var(--sim-text); }
.sim-formula-note, .sim-note { font-size:11.5px; color:var(--sim-muted); line-height:1.5; max-width:310px; }
.sim-goals { margin:0; padding-left:16px; font-size:12px; color:var(--sim-muted); line-height:1.6; max-width:300px; }

.sim-meter { display:flex; flex-direction:column; gap:4px; min-width:190px; }
.sim-meter-head { display:flex; justify-content:space-between; gap:12px; font-size:12px; color:var(--sim-muted); }
.sim-meter-head b { color:var(--sim-text); font-variant-numeric:tabular-nums; font-weight:600; }
.sim-meter-bar { height:6px; border-radius:6px; background:rgba(148,163,184,.16); overflow:hidden; }
.sim-meter-bar i { display:block; height:100%; width:100%; transform-origin:left center; transform:scaleX(0);
  border-radius:6px; transition:transform .18s linear, background .3s; }

/* Баннер фазы: сверху по центру, не заезжает под панель управления (она справа). */
.sim-banner { position:fixed; top:12px; left:calc(50% - 136px); transform:translateX(-50%); z-index:11;
  min-width:200px; max-width:min(440px, calc(100vw - 600px)); padding:9px 22px 10px; text-align:center; box-sizing:border-box;
  background:var(--sim-glass);
  border:1px solid var(--sim-border); border-bottom:3px solid var(--sim-banner-color, var(--sim-accent));
  border-radius:14px; box-shadow:var(--sim-shadow), 0 6px 28px -6px color-mix(in srgb, var(--sim-banner-color, var(--sim-accent)) 45%, transparent);
  animation:sim-fade .4s ease backwards; transition:border-color .3s; }
.sim-banner.sim-pulse { animation:sim-pulse .7s ease-out; }
.sim-banner-name { font-size:20px; font-weight:700; color:var(--sim-text); letter-spacing:.2px; }
.sim-banner-sub { font-size:12px; color:var(--sim-muted); margin-top:2px; }
.sim-banner-sub:empty { display:none; }
@media (max-width:1100px) { .sim-banner { max-width:min(440px, calc(100vw - 320px)); } }

/* Всплывающие сообщения под баннером. */
.sim-toasts { position:fixed; top:84px; left:calc(50% - 136px); transform:translateX(-50%); z-index:14;
  display:flex; flex-direction:column; align-items:center; gap:6px; pointer-events:none; }
.sim-toast { padding:8px 16px 8px 14px; border-radius:12px; background:var(--sim-glass);
  border:1px solid var(--sim-border); border-left:3px solid var(--sim-toast-color, var(--sim-accent));
  font-size:13.5px; font-weight:600; color:var(--sim-text); box-shadow:var(--sim-shadow);
  animation:sim-toast-in .3s var(--sim-ease) backwards; transition:opacity .35s, transform .35s; max-width:min(420px, 90vw); text-align:center; }
.sim-toast.out { opacity:0; transform:translateY(-6px); }

/* Кнопки действий над сценой. */
.sim-actions { position:fixed; left:calc(50% - 136px); transform:translateX(-50%); bottom:16px; z-index:11;
  display:flex; flex-wrap:wrap; justify-content:center; gap:8px; max-width:min(560px, calc(100vw - 320px)); }
.sim-action { padding:10px 18px; border-radius:12px; border:1px solid color-mix(in srgb, var(--sim-action-color, var(--sim-accent)) 50%, var(--sim-border));
  background:var(--sim-glass); color:var(--sim-text);
  font:inherit; font-size:14px; font-weight:600; cursor:pointer; box-shadow:var(--sim-shadow);
  transition:background .15s, border-color .15s; }
.sim-action:hover { background:color-mix(in srgb, var(--sim-action-color, var(--sim-accent)) 22%, var(--sim-glass)); }
.sim-action.sim-primary { background:color-mix(in srgb, var(--sim-action-color, var(--sim-accent)) 40%, var(--sim-glass)); }
.sim-action.sim-press { animation:sim-press .25s ease; }

/* Подписи и кнопки поверх сцены (view2d.tex/tag/button, scene3d.label). */
.sim-overlay { position:fixed; inset:0; pointer-events:none; z-index:8; overflow:hidden; }
.sim-tag { position:absolute; left:0; top:0; padding:3px 9px; border-radius:9px; white-space:nowrap;
  background:rgba(16,21,29,.86); border:1px solid color-mix(in srgb, var(--sim-tag-color, #8b95a3) 55%, transparent);
  color:var(--sim-text); font-size:12px; font-weight:500; box-shadow:0 4px 14px rgba(0,0,0,.35); will-change:transform; }
.sim-tag-tex { font-size:15px; padding:4px 10px; }
.sim-tag-tex .katex { color:var(--sim-tag-color, var(--sim-text)); }
.sim-tag-btn { pointer-events:auto; cursor:pointer; font:inherit; font-size:12.5px; font-weight:600;
  background:color-mix(in srgb, var(--sim-tag-color, var(--sim-accent)) 26%, rgba(16,21,29,.9)); }
.sim-tag-btn:hover { background:color-mix(in srgb, var(--sim-tag-color, var(--sim-accent)) 45%, rgba(16,21,29,.9)); }

@media (max-width:1100px) and (min-width:641px) {
  .sim-actions { left:calc(50% - 136px); max-width:calc(100vw - 320px); }
}

/* Телефон: параметры и угловые панели — вкладки дока внизу; вкладка открывает лист. */
@media (max-width:640px) {
  .sim-dock { display:flex; position:fixed; left:8px; right:8px; bottom:10px; z-index:13; gap:4px; padding:5px;
    overflow-x:auto; scrollbar-width:none; border-radius:16px; background:rgba(20,26,35,.9); border:1px solid var(--sim-border); box-shadow:var(--sim-shadow); }
  .sim-dock::-webkit-scrollbar { display:none; }
  .sim-dock-chip { flex:0 0 auto; min-height:42px; padding:0 14px; border:0; border-radius:11px; background:transparent;
    color:var(--sim-muted); font:inherit; font-size:14px; font-weight:600; white-space:nowrap; cursor:pointer; }
  .sim-dock-chip.on { background:color-mix(in srgb, var(--sim-accent) 28%, transparent); color:var(--sim-text); }
  .sim-panel {
    left:0; right:0; top:auto; bottom:0; width:auto; z-index:12; max-height:68vh; overflow-y:auto;
    border-radius:18px 18px 0 0; padding:18px 16px 84px; animation:none;
    transform:translateY(110%); transition:transform .3s var(--sim-ease);
  }
  .sim-panel.sim-panel-open { transform:translateY(0); box-shadow:0 -10px 30px rgba(0,0,0,.5); }
  .sim-panel-close {
    display:flex; align-items:center; justify-content:center; position:absolute; top:10px; right:10px;
    width:36px; height:36px; border-radius:999px; border:1px solid var(--sim-border);
    background:var(--sim-soft); color:var(--sim-text); font-size:16px; line-height:1; cursor:pointer;
  }
  .sim-control input[type=range] { height:34px; }
  .sim-control input[type=range]::-webkit-slider-thumb { width:22px; height:22px; margin-top:-9px; }
  .sim-btns button { padding:12px 0; min-height:46px; font-size:15px; }
  .sim-seg button { padding:10px 4px; font-size:14px; }
  .sim-panel > .smh-collapse-btn, .sim-side-panel > .smh-collapse-btn { display:none; }
  body .sim-corner > .sim-side-panel:not(.sim-sheet-open) { display:none!important; }
  .sim-side-panel.sim-sheet-open { display:flex; position:fixed; left:0; right:0; bottom:0; max-width:none; max-height:62vh;
    overflow-y:auto; z-index:12; border-radius:18px 18px 0 0; padding:16px 16px 84px; font-size:13px; }
  .sim-side-panel.smh-collapsed.sim-sheet-open { width:auto!important; height:auto!important; padding:16px 16px 84px!important; }
  .sim-side-panel.sim-sheet-open > * { display:revert!important; }
  .sim-side-panel.sim-sheet-open > .sim-side-body { display:flex!important; }
  .sim-side-panel.sim-sheet-open > .smh-collapse-btn { display:none!important; }
  .sim-corner-tr { right:10px; top:64px; }
  .sim-banner { left:8px; right:8px; transform:none; max-width:none; min-width:0; padding:7px 14px; }
  .sim-banner-name { font-size:16px; }
  .sim-toasts { left:8px; right:8px; transform:none; top:70px; }
  .sim-actions { left:8px; right:8px; transform:none; max-width:none; bottom:74px; }
  .sim-action { padding:10px 14px; font-size:14px; }
  body.sim-sheet-mode .sim-actions, body.sim-sheet-mode .sim-toasts { display:none; }
}
.sim-embed .sim-side-panel.smh-collapsed:has(.sim-goals) { display:none!important; }
.sim-embed .sim-banner, .sim-embed .sim-phase-caption { transform-origin:top center; }
.sim-still .sim-panel, .sim-still .sim-side-panel, .sim-still .sim-banner, .sim-still .sim-toast,
.sim-still .sim-switch::after, .sim-still .sim-meter-bar i { animation:none!important; transition:none!important; }
@media (prefers-reduced-motion: reduce) {
  .sim-panel, .sim-side-panel, .sim-banner, .sim-toast { animation:none!important; }
  .sim-panel, .sim-switch::after, .sim-meter-bar i { transition:none!important; }
}
`;
