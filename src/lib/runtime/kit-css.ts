/** Стили панели управления симуляцией. */
export const UIKIT_CSS = `
:root { --sim-bg:#101318; --sim-panel:#1a2029; --sim-text:#e8ecf1; --sim-muted:#8b95a3;
  --sim-accent:#4f8ff7; }
body { margin:0; background:var(--sim-bg); color:var(--sim-text);
  font-family:system-ui,-apple-system,'Segoe UI',sans-serif; }
.sim-panel { position:fixed; right:12px; top:12px; width:260px; padding:14px;
  background:color-mix(in srgb, var(--sim-panel) 92%, transparent);
  border:1px solid #2a3341; border-radius:12px; backdrop-filter:blur(6px);
  display:flex; flex-direction:column; gap:10px; z-index:10; }
.sim-panel h1 { font-size:15px; margin:0 0 4px; padding-right:32px; }
.sim-control label { display:flex; justify-content:space-between;
  font-size:12px; color:var(--sim-muted); margin-bottom:4px; }
.sim-control input[type=range] { width:100%; accent-color:var(--sim-accent); }
.sim-btns { display:flex; gap:8px; }
.sim-btns button { flex:1; padding:6px 0; border-radius:8px; border:1px solid #2a3341;
  background:var(--sim-panel); color:var(--sim-text); cursor:pointer; font-size:13px; }
.sim-btns button:hover { border-color:var(--sim-accent); }
.sim-value { color:var(--sim-text); font-variant-numeric:tabular-nums; }
.sim-panel-toggle { display:none; }
.sim-panel-close { display:none; }

/* Мобильный SimUI: панель сворачивается в таблетку «Параметры» снизу; развёрнутое
   состояние — bottom-sheet с теми же контролами. На широком экране — как раньше. */
@media (max-width:640px) {
  .sim-panel {
    left:8px; right:8px; top:auto; bottom:0; width:auto; z-index:12;
    border-radius:16px 16px 0 0; max-height:72vh; overflow-y:auto;
    padding:18px 16px 26px; transform:translateY(112%); transition:transform .25s ease;
  }
  .sim-panel.sim-panel-open { transform:translateY(0); box-shadow:0 -8px 28px rgba(0,0,0,.45); }
  .sim-panel-toggle {
    display:inline-flex; align-items:center; gap:6px; position:fixed; left:50%; bottom:16px;
    transform:translateX(-50%); z-index:11; min-height:48px; padding:12px 22px;
    border-radius:999px; border:1px solid #2a3341;
    background:color-mix(in srgb, var(--sim-panel) 94%, transparent); backdrop-filter:blur(6px);
    color:var(--sim-text); font:inherit; font-size:15px; cursor:pointer;
    box-shadow:0 6px 20px rgba(0,0,0,.4);
  }
  .sim-panel-toggle.sim-panel-hidden { display:none; }
  .sim-panel-close {
    display:flex; align-items:center; justify-content:center; position:absolute; top:10px; right:10px;
    width:36px; height:36px; border-radius:999px; border:1px solid #2a3341;
    background:var(--sim-panel); color:var(--sim-text); font-size:16px; line-height:1; cursor:pointer;
  }
  .sim-control input[type=range] { height:34px; }
  .sim-btns button { padding:12px 0; min-height:46px; font-size:15px; }
  .sim-panel > .smh-collapse-btn { display:none; }
}

.smh-collapse-btn { position:absolute; top:6px; right:6px; z-index:3; width:28px; height:28px;
  border-radius:8px; border:1px solid #2a3341; background:var(--sim-panel); color:var(--sim-text);
  font-size:13px; line-height:1; cursor:pointer; padding:0; }
[data-smh-panel].smh-collapsed { width:auto!important; min-width:0!important; max-width:none!important;
  height:auto!important; min-height:0!important; max-height:none!important;
  padding:6px!important; overflow:hidden!important; }
[data-smh-panel].smh-collapsed > *:not(.smh-collapse-btn) { display:none!important; }

.sim-corner { position:fixed; z-index:9; display:flex; flex-direction:column; gap:10px; }
.sim-corner-tl, .sim-corner-bl { align-items:flex-start; }
.sim-corner-tr, .sim-corner-br { align-items:flex-end; }
.sim-corner-tl { left:12px; top:12px; } .sim-corner-bl { left:12px; bottom:12px; }
.sim-corner-tr { right:12px; top:64px; } .sim-corner-br { right:12px; bottom:12px; }
.sim-side-panel { max-width:min(340px,42vw); padding:12px 14px;
  background:color-mix(in srgb, var(--sim-panel) 92%, transparent); border:1px solid #2a3341;
  border-radius:12px; backdrop-filter:blur(6px); font-size:12px; color:var(--sim-text);
  display:flex; flex-direction:column; gap:8px; }
.sim-side-title { font-size:13px; margin:0; padding-right:26px; }
@media (max-width:640px) { .sim-side-panel { max-width:calc(100vw - 24px); } }

.sim-chart { display:block; border-radius:8px; border:1px solid #2a3341; }
.sim-chart-legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:6px;
  font-size:10.5px; color:var(--sim-muted); }
.sim-chart-legend span { display:inline-flex; align-items:center; gap:4px; }
.sim-chart-legend i { width:9px; height:9px; border-radius:2px; display:inline-block; }
`;
