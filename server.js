const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

let localState = {
  clients: [],
  tickets: [],
  timeEntries: [],
  kbArticles: []
};

const server = http.createServer((req, res) => {
  const safeUrl = req.url.split('?')[0];

  if (safeUrl === '/api/state') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === 'GET') {
      res.writeHead(200);
      res.end(JSON.stringify(localState));
      return;
    }

    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          localState = {
            clients: Array.isArray(parsed.clients) ? parsed.clients : [],
            tickets: Array.isArray(parsed.tickets) ? parsed.tickets : [],
            timeEntries: Array.isArray(parsed.timeEntries) ? parsed.timeEntries : [],
            kbArticles: Array.isArray(parsed.kbArticles) ? parsed.kbArticles : []
          };
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, count: localState.clients.length }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  const relPath = safeUrl === '/' ? 'index.html' : safeUrl.replace(/^\/+/, '');
  const filePath = path.join(ROOT, relPath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': content.length,
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Workflow Zero IT PSA running at http://localhost:${PORT}`);
});
