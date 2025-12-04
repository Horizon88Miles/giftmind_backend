#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage: node scripts/run-strapi.js <command> [...args]');
  process.exit(1);
}

const projectRoot = path.resolve(__dirname, '..');
const safeHome = path.join(projectRoot, '.strapi-home');

fs.mkdirSync(safeHome, { recursive: true });

const env = {
  ...process.env,
  HOME: safeHome,
  XDG_CONFIG_HOME: safeHome,
};

const strapiBin = path.join(
  projectRoot,
  'node_modules',
  '@strapi',
  'strapi',
  'bin',
  'strapi.js'
);

const child = spawn(process.execPath, [strapiBin, ...args], {
  stdio: 'inherit',
  env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
