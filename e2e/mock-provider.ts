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

function reply(system: string): string {
  if (system.includes('методист')) return JSON.stringify(SPEC);
  // ВАЖНО: судью проверяем ДО рецензента — JUDGE_SYSTEM содержит слово «рецензента»
  if (system.includes('судья качества'))
    return JSON.stringify({ winnerIndex: 0,
      scores: [{ physics: 9, clarity: 9, interactivity: 9, aesthetics: 9 }],
      feedback: '' });
  if (system.includes('рецензент')) return '{"physicsOk": true, "issues": []}';
  return '```html\n' + ARTIFACT + '\n```';
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
