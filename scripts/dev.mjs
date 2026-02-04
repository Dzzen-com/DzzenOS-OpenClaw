#!/usr/bin/env node
import net from 'node:net';
import { spawn } from 'node:child_process';
import process from 'node:process';

const HOST = process.env.HOST ?? '127.0.0.1';
const API_PORT_START = Number(process.env.API_PORT ?? 8787);
const UI_PORT_START = Number(process.env.UI_PORT ?? 5173);

function isPortFree(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => resolve(false));
    srv.listen(port, host, () => {
      srv.close(() => resolve(true));
    });
  });
}

async function findFreePort(startPort, host, maxTries = 50) {
  for (let p = startPort; p < startPort + maxTries; p++) {
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p, host)) return p;
  }
  throw new Error(`No free port found in range ${startPort}-${startPort + maxTries - 1} on ${host}`);
}

function run(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    env: { ...process.env, ...(opts.env ?? {}) },
    cwd: opts.cwd,
  });
  return child;
}

async function main() {
  const apiPort = await findFreePort(API_PORT_START, HOST);
  const uiPort = await findFreePort(UI_PORT_START, HOST);
  const apiBase = `http://${HOST}:${apiPort}`;

  if (apiPort !== API_PORT_START) {
    console.log(`[dev] API port ${API_PORT_START} is busy; using ${apiPort}`);
  }
  if (uiPort !== UI_PORT_START) {
    console.log(`[dev] UI port ${UI_PORT_START} is busy; using ${uiPort}`);
  }

  console.log(`\n[dev] Starting DzzenOS...`);
  console.log(`[dev] API: ${apiBase}`);
  console.log(`[dev] UI : http://${HOST}:${uiPort}`);
  console.log('');

  const children = [];

  children.push(
    run('node', [
      '--experimental-strip-types',
      'skills/dzzenos/api/server.ts',
      '--host',
      HOST,
      '--port',
      String(apiPort),
    ])
  );

  // Use corepack to ensure pnpm exists on fresh machines.
  children.push(
    run(
      'corepack',
      ['pnpm', '-C', 'apps/ui', 'dev', '--', '--host', HOST, '--port', String(uiPort), '--strictPort'],
      { env: { VITE_API_BASE: apiBase } }
    )
  );

  const shutdown = (signal) => {
    console.log(`\n[dev] Received ${signal}, shutting down...`);
    for (const c of children) {
      if (!c.killed) c.kill('SIGTERM');
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // If any child exits, exit with the same code.
  await new Promise((resolve) => {
    let exited = false;
    for (const c of children) {
      c.on('exit', (code, sig) => {
        if (exited) return;
        exited = true;
        if (sig) {
          process.exitCode = 1;
        } else {
          process.exitCode = code ?? 1;
        }
        shutdown('child-exit');
        resolve();
      });
    }
  });
}

main().catch((err) => {
  console.error('[dev] Failed to start:', err);
  process.exit(1);
});
