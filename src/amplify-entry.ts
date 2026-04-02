// Bare minimum Amplify compute entry point - just prove it works
const http = require('http');

const server = http.createServer((req: any, res: any) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'alive',
    url: req.url,
    cwd: process.cwd(),
    dirname: __dirname,
    env_keys: Object.keys(process.env).filter((k: string) => k.startsWith('DB') || k.startsWith('DATA') || k === 'NODE_ENV' || k === 'PORT'),
    files: require('fs').readdirSync(__dirname).filter((f: string) => !f.includes('node_modules')),
  }));
});

server.listen(3000, () => {
  console.log('Minimal server running on port 3000');
});
