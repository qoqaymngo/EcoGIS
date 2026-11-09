import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {loadAssets} from './assets.mjs';
import {createHandler} from '../server/handler.js';
import {CHAT_TOOLS} from '../public/chat-tools.js';

const port = Number(process.env.PORT || 8000);
const origin = 'http://127.0.0.1:' + port;
const assets = await loadAssets();
const handle = createHandler(path => assets.get(path), {allowLocal: true, chatTools: CHAT_TOOLS});

createServer(async (incoming, outgoing) => {
  try {
    const hasBody = !['GET', 'HEAD'].includes(incoming.method);
    const host = incoming.headers.host;
    if (host !== '127.0.0.1:' + port && host !== 'localhost:' + port) {
      outgoing.writeHead(403).end();
      return;
    }
    const request = new Request('http://' + host + incoming.url, {
      method: incoming.method,
      headers: incoming.headers,
      ...(hasBody ? {body: Readable.toWeb(incoming), duplex: 'half'} : {}),
    });
    const response = await handle(request, process.env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch {
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
}).listen(port, '127.0.0.1', () => console.log('ЭкоГИС · ' + origin));
