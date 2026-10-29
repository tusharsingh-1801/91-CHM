import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

// External process values win, followed by .env.local, then .env.
export function loadEnvironment(cwd = process.cwd(), target = process.env) {
  const external = { ...target };
  const fileValues = {};
  for (const name of ['.env', '.env.local']) {
    const path = resolve(cwd, name);
    if (existsSync(path)) Object.assign(fileValues, dotenv.parse(readFileSync(path)));
  }
  Object.assign(target, fileValues, external);
  return target;
}
