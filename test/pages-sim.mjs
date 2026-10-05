// GitHub Pages simulator for local dev and tests (CLAUDE.md §10 rule 8).
// Serves public/ under /Vaihtokaupat/ like samppafin.github.io/Vaihtokaupat/ does, and answers
// unknown paths with 404.html and status 404, which is what makes the deep-link trick testable.
//
//   npm run dev            → http://localhost:8082/Vaihtokaupat/
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE = '/Vaihtokaupat/';
const ROOT = fileURLToPath(new URL('../public/', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

async function fileFor(urlPath) {
  const rel = decodeURIComponent(urlPath.slice(BASE.length));
  const file = path.resolve(ROOT, rel);
  if (file !== ROOT.replace(/[\\/]$/, '') && !file.startsWith(ROOT)) return null; // no ../ escapes
  try {
    const s = await stat(file);
    if (s.isFile()) return file;
    if (s.isDirectory()) {
      const index = path.join(file, 'index.html');
      if ((await stat(index).catch(() => null))?.isFile()) return index;
    }
  } catch {}
  return null;
}

async function send(res, status, file) {
  const body = await readFile(file);
  res.writeHead(status, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    // Pages adds the trailing slash to a directory with a redirect; "/" leads to the site for convenience.
    if (pathname === '/' || pathname === BASE.slice(0, -1)) {
      res.writeHead(301, { location: BASE });
      return res.end();
    }
    const file = pathname.startsWith(BASE) ? await fileFor(pathname) : null;
    if (file) return send(res, 200, file);
    return send(res, 404, path.join(ROOT, '404.html'));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT) || 8082;
  createServer().listen(port, () => console.log(`Pages simulator: http://localhost:${port}${BASE}`));
}
