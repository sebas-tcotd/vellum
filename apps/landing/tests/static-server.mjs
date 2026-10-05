// Serve the production build under a repository prefix like GitHub Pages:
// directories redirect to their trailing slash, missing files answer 404 with
// dist/404.html, and there is no SPA fallback to the home page.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const prefix = '/vellum/';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.txt': 'text/plain',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function sendNotFound(response) {
  try {
    const page = await readFile(resolve(root, '404.html'));
    response.writeHead(404, { 'Content-Type': 'text/html' }).end(page);
  } catch {
    response.writeHead(404).end('Not found');
  }
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (!url.pathname.startsWith(prefix)) throw new Error('Outside prefix');
    let file = resolve(
      root,
      decodeURIComponent(url.pathname.slice(prefix.length)),
    );
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
    await sendNotFound(response);
  }
}).listen(4178, '127.0.0.1');
