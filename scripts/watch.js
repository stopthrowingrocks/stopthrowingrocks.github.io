#!/usr/bin/env node
// Runs `npm run watch` for every workspace listed in the root package.json, in parallel.
// Add a new content area to root workspaces and it's automatically included here.

const { spawn } = require('child_process');
const { workspaces } = require('../package.json');

const colors = [
  '\x1b[36m',  // cyan
  '\x1b[32m',  // green
  '\x1b[33m',  // yellow
  '\x1b[35m',  // magenta
  '\x1b[34m',  // blue
  '\x1b[96m',  // bright cyan
  '\x1b[92m',  // bright green
  '\x1b[93m',  // bright yellow
  '\x1b[95m',  // bright magenta
  '\x1b[94m',  // bright blue
  '\x1b[91m',  // bright red
  '\x1b[97m',  // bright white
];
const reset  = '\x1b[0m';

workspaces.forEach((ws, i) => {
  const color  = colors[i % colors.length];
  const label  = ws.replace('content/', '').padEnd(14);
  const prefix = `${color}[${label}]${reset} `;

  const proc = spawn('npm', ['run', 'watch', '--if-present', `--workspace=${ws}`], {
    shell: true,
  });

  const tag = line => process.stdout.write(prefix + line.trimEnd() + '\n');
  proc.stdout.on('data', d => String(d).split('\n').filter(Boolean).forEach(tag));
  proc.stderr.on('data', d => String(d).split('\n').filter(Boolean).forEach(tag));
  proc.on('close', code => {
    if (code !== 0) console.error(`${prefix}exited with code ${code}`);
  });
});

console.log(`Watching ${workspaces.length} workspaces. Press Ctrl+C to stop.\n`);
