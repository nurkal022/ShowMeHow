import http from 'node:http';

const SPEC = {
  title: 'Диффузия духов', subject: 'Физика', mode: '2d',
  learningGoals: ['понять диффузию'], physics: 'случайные блуждания частиц',
  parameters: [{ name: 'speed', label: 'Скорость', min: 1, max: 10, step: 1,
    value: 3, unit: '' }],
  visualPlan: 'частицы на canvas',
};

const ARTIFACT = `<!DOCTYPE html><html><head><title>sim</title></head><body>
<canvas id="c" width="800" height="600"></canvas>
<script>
  var ctx = document.getElementById('c').getContext('2d'); var t = 0;
  SimUI.title('Диффузия духов');
  SimUI.slider({label:'Скорость',min:1,max:10,step:1,value:3,unit:'',onChange:function(){}});
  SimUI.playPause({onPlay:function(){},onPause:function(){},onReset:function(){}});
  (function loop(){ ctx.fillStyle='#000'; ctx.fillRect(0,0,800,600);
    ctx.fillStyle='#4f8ff7'; ctx.fillRect((t+=3)%800, 300, 30, 30);
    requestAnimationFrame(loop); })();
</script></body></html>`;

// Маркер из EXAMPLE_SKELETON-блока generatorSystem() — встречается ТОЛЬКО в системном
// промпте генератора кандидата (не в планировщике/критике/судье/фиксере), поэтому
// им можно отличить генераторный запрос, не совпадая случайно с другими ролями.
const GENERATOR_MARKER = 'Каркас качественной симуляции';
// Задержка по умолчанию перед ответом на генераторный запрос (остальные роли отвечают
// мгновенно). Спека отмены задаёт свою, долгую: отмена доходит до пайплайна только
// через сердцебиение воркера, и кандидат не должен успеть сгенерироваться раньше.
const GENERATOR_DELAY_MS = 1200;

export type MockRole = 'planner' | 'judge' | 'critic' | 'core' | 'layer' | 'html';

/**
 * Роль по системному промпту. Маркеры — самоидентификация роли из первой строки
 * её промпта, и только её: слово «рецензент» подходить не может, оно встречается
 * и у судьи («физика-рецензента по каждому»), и у рефайнера («по замечаниям судьи,
 * физика-рецензента»), из-за чего рефайнеру раньше отвечали вердиктом критика,
 * а не HTML. Соответствие маркеров реальным промптам закреплено юнит-тестом
 * tests/unit/mock-provider.test.ts.
 */
export function roleOf(system: string): MockRole {
  if (system.includes('Ты — методист и физик')) return 'planner';
  if (system.includes('Ты — судья качества')) return 'judge';
  if (system.includes('Ты — рецензент учебных тренажёров')) return 'critic';
  if (system.includes('ЯДРО ФИЗИКИ')) return 'core';
  if (system.includes('Ты достраиваешь работающий учебный тренажёр')) return 'layer';
  return 'html'; // генератор, фиксер, рефайнер — все ждут HTML-документ
}

function reply(system: string): string {
  switch (roleOf(system)) {
    case 'planner':
      return JSON.stringify(SPEC);
    case 'judge':
      return JSON.stringify({ winnerIndex: 0,
        scores: [{ physics: 9, clarity: 9, interactivity: 9, aesthetics: 9 }],
        feedback: '' });
    case 'critic':
      return '{"physicsOk": true, "issues": []}';
    case 'core':
      return '```js\nvar PHYS = { init: function (p) { return { t: 0 }; }, step: function (s, p, dt) { s.t += dt; },\n' +
        '  observe: function (s, p) { return { t: s.t }; } };\n```';
    case 'layer':
      return '```js\n// ==== @section views ====\n// мок: слой без содержимого\n// ==== @end views ====\n```';
    default:
      return '```html\n' + ARTIFACT + '\n```';
  }
}

export function startMockProvider(
  port: number, opts: { generatorDelayMs?: number } = {},
): Promise<() => Promise<void>> {
  const delay = opts.generatorDelayMs ?? GENERATOR_DELAY_MS;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { messages, stream } = JSON.parse(body || '{}');
      const system = String(messages?.[0]?.content ?? '');
      const send = () => {
        const content = reply(system);
        // Генератор, фиксер и рефайнер читают ответ потоком (живая лента кода) — отвечаем
        // так же, как настоящий OpenAI-совместимый провайдер: SSE-кусками и [DONE].
        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          for (let i = 0; i < content.length; i += 400) {
            res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: content.slice(i, i + 400) } }] })}\n\n`);
          }
          res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            usage: { prompt_tokens: 10, completion_tokens: 10 } })}\n\n`);
          res.end('data: [DONE]\n\n');
          return;
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          choices: [{ message: { content } }],
        }));
      };
      if (system.includes(GENERATOR_MARKER)) setTimeout(send, delay);
      else send();
    });
  });
  return new Promise((resolve) => {
    server.listen(port, () =>
      resolve(() => new Promise((r) => server.close(() => r()))));
  });
}
