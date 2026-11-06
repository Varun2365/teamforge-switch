import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = 9333;
const [, , url, out, widthArg = '1440', heightArg = '1150', evalExpr = '', waitArg = '4500'] = process.argv;
const width = Number(widthArg);
const height = Number(heightArg);
const waitMs = Number(waitArg);
const userDataDir = join(tmpdir(), `edge-cdp-${Date.now()}`);

const edge = spawn(
  edgePath,
  [
    `--remote-debugging-port=${port}`,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getTarget() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' });
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
    }
    await sleep(250);
  }
  throw new Error('Could not reach Edge debugger');
}

let messageId = 0;
function createClient(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    }
  });
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });
  return {
    ready,
    send(method, params = {}) {
      const id = ++messageId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      ws.close();
    },
  };
}

try {
  const target = await getTarget();
  const client = createClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  await client.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  await client.send('Page.navigate', { url });
  await sleep(waitMs);

  let evalResult = null;
  let evalText = '';
  if (evalExpr) {
    const result = await client.send('Runtime.evaluate', {
      expression: evalExpr,
      awaitPromise: true,
      returnByValue: true,
    });
    evalResult = result.result?.value;
    evalText = typeof evalResult === 'string' ? evalResult : JSON.stringify(evalResult, null, 2);
    await sleep(700);
  }

  if (out) {
    mkdirSync(join(out, '..'), { recursive: true });
    const screenshot = await client.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(out, Buffer.from(screenshot.data, 'base64'));
    console.log(`screenshot: ${out}`);
  }
  if (evalText) console.log(evalText);

  client.close();
} finally {
  edge.kill();
}
