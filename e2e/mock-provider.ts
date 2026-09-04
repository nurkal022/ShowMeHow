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
// Искусственная задержка перед ответом на генераторный запрос: даёт e2e-тесту отмены
// окно, в которое клик «Отменить» гарантированно успевает до того, как кандидат сгенерован
// (остальные роли отвечают мгновенно — не тормозим планировщика/критика/судью).
const GENERATOR_DELAY_MS = 1200;

export type MockRole = 'planner' | 'judge' | 'critic' | 'html';

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
  if (system.includes('Ты — придирчивый физик-рецензент')) return 'critic';
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
    default:
      return '```html\n' + ARTIFACT + '\n```';
  }
}

export function startMockProvider(port: number): Promise<() => Promise<void>> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const { messages } = JSON.parse(body || '{}');
      const system = String(messages?.[0]?.content ?? '');
      const send = () => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          choices: [{ message: { content: reply(system) } }],
        }));
      };
      if (system.includes(GENERATOR_MARKER)) setTimeout(send, GENERATOR_DELAY_MS);
      else send();
    });
  });
  return new Promise((resolve) => {
    server.listen(port, () =>
      resolve(() => new Promise((r) => server.close(() => r()))));
  });
}
