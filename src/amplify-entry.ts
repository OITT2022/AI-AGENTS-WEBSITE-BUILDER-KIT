// Step 0: Global error catcher
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT:', err);
});

const http = require('http');
const path = require('path');
const fs = require('fs');

// Step 1: Load env
try {
  const jp = path.join(__dirname, 'env.json');
  if (fs.existsSync(jp)) {
    const v = JSON.parse(fs.readFileSync(jp, 'utf-8'));
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === 'string') process.env[k] = val;
    }
  }
} catch {}

// Step 2: Test loading each dependency one by one
const errors: string[] = [];
const loaded: string[] = [];

function tryLoad(name: string) {
  try {
    require(name);
    loaded.push(name);
  } catch (e: any) {
    errors.push(`${name}: ${e.message}`);
  }
}

tryLoad('express');
tryLoad('cors');
tryLoad('multer');
tryLoad('pg');
tryLoad('zod');
tryLoad('uuid');
tryLoad('dotenv');
tryLoad('google-auth-library');
tryLoad('@neondatabase/serverless');
tryLoad('@vendia/serverless-express');
tryLoad('@runwayml/sdk');

// Step 3: Try loading our modules
function tryLoadLocal(name: string) {
  try {
    require(name);
    loaded.push(name);
  } catch (e: any) {
    errors.push(`${name}: ${e.message}`);
  }
}

tryLoadLocal('./lib/platform');
tryLoadLocal('./lib/logger');
tryLoadLocal('./models/schemas');
tryLoadLocal('./db/neon');
tryLoadLocal('./db/postgres');
tryLoadLocal('./db/provider');
tryLoadLocal('./db/store');
tryLoadLocal('./services/auth');
tryLoadLocal('./services/findus-client');
tryLoadLocal('./services/google-drive');
tryLoadLocal('./services/image-ai');
tryLoadLocal('./services/video-ai');
tryLoadLocal('./services/video-engine-local');
tryLoadLocal('./services/canva');
tryLoadLocal('./services/social-publish');
tryLoadLocal('./services/ingest');
tryLoadLocal('./services/scoring');
tryLoadLocal('./services/creative');
tryLoadLocal('./services/qa');
tryLoadLocal('./services/pipeline');
tryLoadLocal('./services/media-merge');

// Step 4: Try loading server
let serverError = '';
try {
  tryLoadLocal('./server');
} catch (e: any) {
  serverError = e.message;
}

// Report
http.createServer((_req: any, res: any) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ loaded, errors, serverError }, null, 2));
}).listen(3000, () => console.log('Diagnostic on 3000'));
