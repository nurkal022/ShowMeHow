/** Справочник API кита для системного промпта генератора. */
export const UIKIT_DOC = `
В артефакт УЖЕ встроен UI-kit SimUI (не подключай его сам, не пиши свои position:fixed
панели, легенды и инфо-блоки). Всё, что не является самой сценой, делается через SimUI.
Опции принимаются объектом; неизвестный метод SimUI не роняет страницу, но засчитывается как ошибка.

ГЛАВНЫЙ ЦИКЛ — одной строкой (ОБЯЗАТЕЛЬНО, свой requestAnimationFrame-цикл не пиши):
- var app = SimUI.run({ physics: PHYS, P: P, S: S, draw: draw, hooks: hooks })
    Сам делает: цикл с клампом dt и множителем скорости, кнопки «Пауза/Сброс», скорость времени,
    сброс (S = PHYS.init(P) на месте), SimUI.expose для проверок, обновление приборов с key,
    hooks.frame(o, dt) каждый кадр и hooks.reset() при сбросе, draw(o, P, S, dt) каждый кадр
    (и на паузе). o = PHYS.observe(S, P). Параметр, влияющий только на init, перезапускает опыт сам.
    app.reset(), app.pause(), app.play(), app.observe().

ПАРАМЕТРЫ (панель справа):
- SimUI.title('Название')
- SimUI.params(P, [{name:'k', label:'Жёсткость', min:1, max:100, step:1, value:20, unit:'Н/м', group:'Пружина'}, ...])
    — слайдеры для всех параметров сразу, сами пишут P[name]; name = spec.parameters[].name
- SimUI.slider({name, label, min, max, step, value, unit, onChange}) — одиночный слайдер
- SimUI.select({name:'view', label:'Вид', options:['сбоку','сверху'], value:'сбоку', onChange})
- SimUI.toggle({name:'cut', label:'Разрез', value:true, onChange})
- SimUI.button({name:'kick', label:'Толчок', onClick})
- SimUI.presets([{label:'Земля', values:{g:9.8}}, {label:'Луна', values:{g:1.6}}])

ПРИБОРЫ (докируются по углам corner:'tl'|'bl'|'br'|'tr', сворачиваются, на телефоне — вкладки).
key — имя величины из PHYS.observe (или параметра P): прибор обновляется сам, код обновления не нужен.
Вместо key можно value: function (o, P) { return ...; }.
- SimUI.readouts({h:{label:'Высота', unit:'м'}, v:{label:'Скорость', unit:'м/с', digits:2}})
- SimUI.readout({key:'E', label:'Энергия', unit:'Дж'}) -> {set(v)}
- SimUI.chart({title:'Энергия', x:'t', y:['Ek','Ep'], series:[{name:'кинет.', color:'blue'},
    {name:'потенц.', color:'orange'}], xLabel:'t, с', yLabel:'E, Дж', corner:'br'})
    mode:'xy' — фазовая/индикаторная диаграмма (x:'V', y:'p'); без x/y — вручную chart.push(x, [y...]).
    mode:'bars' или 'curve' с data: function (o, P) { return {x:[...], y:[...]}; } — гистограмма,
    профиль волны, спектр (пересчитывается сам).
- SimUI.plot({title:'U(x)', fn:function (x, P) { return P.k*x*x/2; }, x:[-1, 1], marker:'x'})
    — график функции; перестраивается при смене параметров, marker — текущая точка.
- SimUI.sweep({title:'Ток от сопротивления', param:'R', y:'I', xLabel:'R, Ом', yLabel:'I, А', settle:0})
    — зависимость величины от параметра по всему диапазону слайдера, считает само ядро (init → settle с
    шагов → observe); маркер — текущее состояние. Для «зависимости от параметра» — только так, не chart.
- SimUI.formula({title:'Как это работает', tex:'T = 2\\\\pi\\\\sqrt{m/k}', vars:{m:{label:'m', unit:'кг'},
    T:{label:'T', unit:'с'}}, note:'пояснение', corner:'tl'}) — KaTeX и живые значения vars.
    Ключи vars — ИМЕНА величин из observe/P латиницей (m, T, theta0), не LaTeX; LaTeX — только в label.
- SimUI.banner({items:[{name:'Впуск', sub:'клапан открыт', color:'blue'}, ...], phase:'phase'})
    — крупная плашка текущей фазы; phase — ключ observe с номером фазы или function (o, P) -> номер
- SimUI.phases({key:'phase', mode:'step', items:[{name:'Впуск', text:'что происходит', color:'blue'}, ...]})
    — показ по фазам: тренажёр останавливается в начале каждой фазы, «Далее» проигрывает её целиком,
    «Назад» и клик по фазе возвращают к её началу; observe[key] — номер фазы 0..n-1. Баннер фаз тогда не нужен.
- SimUI.meter({key:'T', label:'Температура', min:0, max:100, unit:'°C', zones:[{to:80, color:'green'},
    {to:100, color:'red'}]}) — шкала-полоса
- SimUI.legend({items:[{color:'blue', label:'холодные'}]}), SimUI.goals(['цель', ...]),
  SimUI.note({title:'Почему', text:'...'}), SimUI.panel({title, corner}) -> DIV для своего содержимого
- SimUI.actions([{label:'⚡ Толчок', onClick: fn}]) — крупные кнопки действий над сценой (снизу)
- SimUI.toast('Резонанс!', {color:'yellow'}) — всплывающее сообщение о событии (не чаще раза в 3 с)

УРОК (лаборатории и исследования):
- SimUI.steps({items:[{title:'Наблюдай', text:'что сделать', values:{L:1}}, ...], onStep:function (i) {}})
    — шаги с «Назад/Далее»; values шага выставляются сами
- SimUI.task({question:'Каков период при L = 2 м?', answer:'T' или function (o, P) {...}, tolerance:0.05,
    unit:'с', hint:'T = 2π√(L/g)', explain:'период растёт как √L'}); выбор: {question, options:[...], correct:0}
- SimUI.table({title:'Измерения', columns:[{label:'L', unit:'м', key:'L'}, {label:'T', unit:'с', key:'T'}]})
    — кнопка «Записать» берёт значения по key сама
- SimUI.set('L', 2) — выставить контрол по name

2D-СЦЕНА — мировые координаты (метры), ось y вверх, сама вписывается в свободную часть экрана:
- var view = SimUI.view2d({x:[-1, 5], y:[0, 7], grid:true})   // x, y — видимая область мира
  В draw: view.clear() первым, затем примитивы (style — {color, width, fill, dash, alpha, glow, label}
  или просто цвет; цвета словами: 'blue','orange','green','red','purple','yellow','cyan','pink','gray','white'):
  view.line(x1,y1,x2,y2,s) · view.path([[x,y],...], s) · view.polygon(pts, s) · view.circle(x,y,r,s)
  view.ball(x,y,r,'blue') — объёмный шар · view.dot(x,y,s) · view.dots([[x,y],...], {r:3, color}) — сотни частиц
  view.rect(x,y,w,h,s) · view.box(cx,cy,w,h,angle,{color, label}) · view.arrow(x1,y1,x2,y2,{color, label})
  view.vector(x,y,vx,vy,{scale, color, label}) · view.spring(x1,y1,x2,y2,{coils}) · view.angle(cx,cy,r,a0,a1,{label})
  view.text(x,y,'текст',{size, color}) · view.label(x,y,'подпись') — с плашкой · view.ground(y) · view.support(x1,y,x2)
  view.fn(function (x) { return ...; }, {color}) — кривая y(x) · view.field(function (x, y) { return [fx, fy]; })
  var tr = view.trail(300); tr.push(x, y); tr.draw({color}) — след траектории
  view.heatmap(grid | function (x, y) {...}, {x:[a,b], y:[c,d], min, max}) — поле цветом (температура, потенциал)
  view.bars([3, 1, 2], {x:[0, 6], color:'blue', labels}) — столбики (массив при сортировке, распределение)
  view.tex(x, y, 'F = ma', {color}) — формула-баллон в точке · view.button(x, y, 'Толкнуть', fn) — кнопка на сцене
  view.drag({hit:{x:function(){return S.x;}, y:function(){return 0;}, r:0.2}, onDrag:function (x, y) {...}})
  view.onClick(function (x, y) {...}) · view.toPx(x, y), view.toWorld(px, py), view.bounds
  Область мира — по размеру объекта при НАЧАЛЬНЫХ значениях с запасом 20-30% (объект — крупно, на пол-экрана).
  Размер зависит от параметра (длина нити, дальность) — view.setWorld({x:[...], y:[...]}) в draw, переход плавный;
  тело улетает из кадра — view.follow(x, y).
  SimUI.heat(k) — цвет 0..1 холодный→горячий; SimUI.color('blue') — hex палитры

3D-СЦЕНА (mode 3d), в <script type="module">:
- var v3 = SimUI.scene3d(THREE, OrbitControls, {radius: 3, grid: true}) -> {scene, camera, renderer,
    controls, fit(radius), render(), label(text, object|[x,y,z], {color}), arrow(from, to, color)}
  — свет, камера по размеру объекта и свободной части экрана; в draw меняй объекты и вызывай v3.render().
  Пример: var ball = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16),
    new THREE.MeshStandardMaterial({color: 0x5b9cff})); v3.scene.add(ball); v3.label('груз', ball, {color:'blue'});
    function draw(o) { ball.position.y = o.h; v3.render(); }  …  SimUI.run({physics: PHYS, P, S, draw, hooks});

Физика SimPhys (и в ядре PHYS, и в сцене): substep, rk4, eulerCromer, verlet, collide, walls, field, spring,
clamp, lerp; SimPhys.periodMeter() -> {feed(t, x), get(), reset()} — живой замер периода.

Лейаут: центр экрана — только под визуализацию (canvas #scene на всё окно); подписи, величины,
графики и формулы — через примитивы выше, они сами докируются по углам.
`;
