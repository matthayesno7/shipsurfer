import * as fs from "fs";
import * as path from "path";

/*
 * Server-side stack detection (mirror of cli/detect.ts) so the dashboard can
 * ship by passing just a project folder path — the server reads it directly.
 */

export interface DetectedStack {
  framework: string;
  buildCommand?: string;
  startCommand?: string;
  port?: number;
}

export function detectStack(dir: string): DetectedStack {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) return { framework: "unknown" };
  let pkg: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    return { framework: "unknown" };
  }
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
  const port = framework === "nextjs" ? 3000 : undefined;

  return { framework, buildCommand, startCommand, port };
}

export function suggestAppName(dir: string): string {
  return (
    path
      .basename(path.resolve(dir))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "my-app"
  );
}

export function sanitizeAppName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "my-app"
  );
}
