/** Справочник API кита для системного промпта генератора. */
export const UIKIT_DOC = `
В артефакт УЖЕ встроен UI-kit (не подключай его сам, не пиши свои position:fixed
панели, легенды и инфо-блоки). Всё, что не является самой сценой, делается через SimUI.

Панель управления (правый верхний угол):
- SimUI.title('Название симуляции')
- SimUI.slider({name:'temp', label:'Температура', min:0, max:100, step:1, value:20,
    unit:'°C', onChange:function(v){...}}) — name обязателен, совпадает с spec.parameters
- SimUI.select({name:'view', label:'Вид', options:['сбоку','сверху'], value:'сбоку',
    onChange:function(v){...}})
- SimUI.toggle({name:'cut', label:'Разрез', value:true, onChange:function(on){...}})
- SimUI.button({name:'kick', label:'Толчок', onClick:function(){...}})
- SimUI.presets({items:[{label:'Холостой ход', values:{rpm:800}},
    {label:'Трасса', values:{rpm:2600}}]}) — двигает слайдеры по их name
- SimUI.speed({values:[0.25,0.5,1,2], value:1}) -> {get()} — ОБЯЗАТЕЛЕН. Множитель dt.
    Первую секунду get() плавно разгоняется от нуля: симуляция открывается спокойно,
    а не рывком. Умножай dt на get() в каждом кадре.
- SimUI.playPause({onPlay:..., onPause:..., onReset:...}) — ОБЯЗАТЕЛЬНО

Информация (докируется по углам, сворачивается, на мобиле свёрнута):
- SimUI.readout({label:'Температура', unit:'К', digits:1, corner:'bl'}) -> {set(v)}
- SimUI.chart({title:'Энергия', xLabel:'t, с', yLabel:'E, Дж', mode:'time'|'xy',
    series:[{name:'Кинетическая', color:'#4f8ff7'}], corner:'br'}) -> {push(x,[y...]), clear()}
    mode:'xy' — фазовые и индикаторные диаграммы (p-V), последняя точка подсвечена
- SimUI.formula({title:'Как это работает', tex:'E = mc^2',
    vars:{m:{label:'m', unit:'кг'}}, note:'пояснение', corner:'tl'}) -> {set({m: 2})}
    KaTeX грузится китом сам, подключать его не надо
- SimUI.legend({items:[{color:'#4f8ff7', label:'холодные'}], corner:'tl'})
- SimUI.goals(['что должен понять студент', ...])
- SimUI.banner({items:[{name:'Впуск', sub:'клапан открыт', color:'#4f8ff7'}, ...]}) -> {set(i)}
    крупная плашка сверху по центру: текущий такт/фаза/режим
- SimUI.panel({title:'Своё', corner:'bl'}) -> DIV для произвольного содержимого

Самопроверка (ОБЯЗАТЕЛЬНО):
- SimUI.expose({getState:function(){return {t:state.t, x:state.x, temp:temp};},
    reset:resetSim}) — getState отдаёт простой объект с числами (время, координаты,
    измеряемые величины и текущие значения параметров). Без него симуляция не проходит
    автоматические пробы качества.

Лейаут: центр экрана — только под визуализацию (canvas на всё окно); все подписи,
величины, графики и формулы — через примитивы выше, они сами докируются по углам.
`;
