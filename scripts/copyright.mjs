#!/usr/bin/env node
// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.
//
// Ensures every project source file (.ts/.tsx) starts with the
// copyright header. Run modes:
//
//   node scripts/copyright.mjs            # add missing headers in place
//   node scripts/copyright.mjs --check    # exit non-zero if any are missing
//
// Skips node_modules, .expo, dist, build, and the script itself.
// Reads/writes raw bytes to preserve UTF-8 content (e.g. Hungarian
// accents in LanguageContext.tsx) without round-tripping through a
// platform-default encoding.

import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const HEADER = '// Copyright (c) 2026 Kunetz Szabolcs. All rights reserved.\r\n';
const HEADER_BYTES = Buffer.from(HEADER, 'utf8');
const MARKER = /Copyright \(c\) 2026 Kunetz/;
const SKIP_DIRS = new Set(['node_modules', '.expo', '.git', 'dist', 'build', '.next']);
const EXTS = new Set(['.ts', '.tsx']);

const README_PATH = 'README.md';
const README_SECTION =
  '\r\n## License & Copyright\r\n\r\n' +
  'Copyright © 2026 Kunetz Szabolcs. All rights reserved.\r\n\r\n' +
  'This software is the intellectual property of Kunetz Szabolcs. See [COPYRIGHT.txt](./COPYRIGHT.txt) for details.\r\n';

const checkOnly = process.argv.includes('--check');

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else {
      const lower = entry.toLowerCase();
      const dot = lower.lastIndexOf('.');
      if (dot >= 0 && EXTS.has(lower.slice(dot))) yield full;
    }
  }
}

const missing = [];
const added = [];

for (const file of walk(ROOT)) {
  const existing = readFileSync(file);
  const peek = existing.subarray(0, Math.min(120, existing.length)).toString('utf8');
  if (MARKER.test(peek)) continue;
  if (checkOnly) {
    missing.push(relative(ROOT, file));
  } else {
    writeFileSync(file, Buffer.concat([HEADER_BYTES, existing]));
    added.push(relative(ROOT, file));
  }
}

// Also ensure README.md has a "License & Copyright" section.
try {
  const readmeBytes = readFileSync(README_PATH);
  const readmeText = readmeBytes.toString('utf8');
  if (!MARKER.test(readmeText)) {
    if (checkOnly) {
      missing.push(README_PATH);
    } else {
      writeFileSync(README_PATH, Buffer.concat([readmeBytes, Buffer.from(README_SECTION, 'utf8')]));
      added.push(README_PATH);
    }
  }
} catch (e) {
  // README.md missing entirely — not our job to create it.
}

if (checkOnly) {
  if (missing.length > 0) {
    console.error(`Missing copyright in ${missing.length} file(s):`);
    for (const f of missing) console.error(`  ${f}`);
    console.error('\nRun:  node scripts/copyright.mjs');
    process.exit(1);
  }
  console.log('All source files (and README) have the copyright.');
} else {
  if (added.length === 0) {
    console.log('Copyright already present everywhere.');
  } else {
    console.log(`Added copyright to ${added.length} file(s):`);
    for (const f of added) console.log(`  ${f}`);
  }
}
