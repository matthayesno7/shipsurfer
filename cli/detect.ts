import * as fs from "fs";
import * as path from "path";

export interface DetectedStack {
  framework: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
}

/*
 * Best-effort local stack detection. v0.1 targets Node / Next.js apps (the most
 * common Claude Code output). Falls back to a generic Node service.
 */
export function detectStack(dir: string): DetectedStack {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return { framework: "unknown" };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const scripts = pkg.scripts || {};

  let framework = "node";
  if (deps.next) framework = "nextjs";
  else if (deps.express) framework = "express";
  else if (deps.fastify) framework = "fastify";

  const buildCommand = scripts.build ? "npm run build" : undefined;
  const startCommand = scripts.start
    ? "npm start"
    : framework === "nextjs"
    ? "npm run start"
    : undefined;

  // Next.js defaults to 3000; many node servers honour process.env.PORT.
  const port = framework === "nextjs" ? 3000 : undefined;

  return { framework, buildCommand, startCommand, port };
}

export function suggestAppName(dir: string): string {
  return path
    .basename(path.resolve(dir))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "my-app";
}
