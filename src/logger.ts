/* Tiny structured logger. Keeps provisioning output readable in the terminal. */
const stamp = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg: string, ...rest: unknown[]) =>
    console.log(`\x1b[36m[${stamp()}]\x1b[0m ${msg}`, ...rest),
  step: (msg: string, ...rest: unknown[]) =>
    console.log(`\x1b[35m[${stamp()}] →\x1b[0m ${msg}`, ...rest),
  ok: (msg: string, ...rest: unknown[]) =>
    console.log(`\x1b[32m[${stamp()}] ✓\x1b[0m ${msg}`, ...rest),
  warn: (msg: string, ...rest: unknown[]) =>
    console.warn(`\x1b[33m[${stamp()}] !\x1b[0m ${msg}`, ...rest),
  error: (msg: string, ...rest: unknown[]) =>
    console.error(`\x1b[31m[${stamp()}] ✗\x1b[0m ${msg}`, ...rest),
};
