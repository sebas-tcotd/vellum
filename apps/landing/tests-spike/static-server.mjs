// Serve the spike build (target/landing-spike) at the root, like the static
// server of the production tests: directories redirect to their trailing
// slash and missing files answer 404.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('../../target/landing-spike');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    let file = resolve(root, decodeURIComponent(url.pathname.slice(1)));
    if (file !== root && !file.startsWith(root + sep))
      throw new Error('Outside build');
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith('/')) {
        response
          .writeHead(301, { Location: `${url.pathname}/${url.search}` })
          .end();
        return;
      }
      file = resolve(file, 'index.html');
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] ?? 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(4179, '127.0.0.1');
