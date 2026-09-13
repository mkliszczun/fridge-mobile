import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve('dist');
const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}/`) && file !== root) { response.writeHead(403).end(); return; }
    let body, type;
    try { body = await readFile(file); type = types[extname(file)]; }
    catch { body = await readFile(resolve(root, 'index.html')); type = 'text/html'; }
    response.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(body);
  } catch { response.writeHead(500).end(); }
}).listen(4173, '127.0.0.1');
