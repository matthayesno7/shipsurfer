import { execFileSync } from "child_process";
import { Octokit } from "@octokit/rest";
import { config } from "../config";
import { log } from "../logger";

/*
 * GitHub provider client.
 *
 * Repo creation on a PERSONAL account requires a user OAuth token (the App
 * installation token alone cannot create personal repos — verified in research).
 * So we authenticate with the user's OAuth token captured during connect.
 */

export interface CreatedRepo {
  fullName: string; // owner/name
  htmlUrl: string;
  /** Remote URL with the access token embedded, used for `git push`. */
  pushUrl: string;
  defaultBranch: string;
}

export async function createRepo(
  accessToken: string,
  name: string,
  isPrivate = true
): Promise<CreatedRepo> {
  if (config.dryRun) {
    log.ok(`[dry-run] would create GitHub repo "${name}"`);
    return {
      fullName: `dry-run-user/${name}`,
      htmlUrl: `https://github.com/dry-run-user/${name}`,
      pushUrl: `https://github.com/dry-run-user/${name}.git`,
      defaultBranch: "main",
    };
  }

  const octokit = new Octokit({ auth: accessToken });

  // Create on the user's personal account. If it already exists (e.g. from a
  // previous run), reuse it so re-ships are idempotent.
  let repo;
  try {
    repo = (
      await octokit.repos.createForAuthenticatedUser({
        name,
        private: isPrivate,
        auto_init: false,
      })
    ).data;
    log.ok(`created repo ${repo.full_name}`);
  } catch (e) {
    // Create failed — maybe the repo already exists from a previous run.
    try {
      const me = (await octokit.users.getAuthenticated()).data;
      repo = (await octokit.repos.get({ owner: me.login, repo: name })).data;
      log.ok(`reusing existing repo ${repo.full_name}`);
    } catch (e2) {
      const msg = (err: unknown) => (err as Error)?.message || String(err);
      throw new Error(
        `GitHub couldn't create or find the repo "${name}". ` +
          `Create failed (${msg(e)}); lookup failed (${msg(e2)}). ` +
          `This usually means the GitHub connection lost repository access — ` +
          `go to Connect accounts and reconnect GitHub, approving repository access when asked ` +
          `(check github.com/settings/installations shows ShipSurfer with access to your repos).`
      );
    }
  }

  const pushUrl = repo.clone_url.replace(
    "https://",
    `https://x-access-token:${accessToken}@`
  );

  return {
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    pushUrl,
    defaultBranch: repo.default_branch || "main",
  };
}

/** Initialise (if needed), commit, and push the local project to the remote. */
export function pushLocalRepo(localPath: string, repo: CreatedRepo) {
  if (config.dryRun) {
    log.ok(`[dry-run] would push ${localPath} → ${repo.fullName}`);
    return;
  }
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: localPath,
      stdio: "pipe",
      // GIT_TERMINAL_PROMPT=0 makes git fail fast instead of hanging on a
      // credential prompt (which would freeze the server's event loop).
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

  // ALWAYS init a repo scoped to this folder. Critical: if the project sits
  // inside another git repo (e.g. the user's home dir is a repo), git would
  // otherwise walk up and `git add -A` the entire parent tree. `git init` here
  // creates a local .git so all operations stay inside the project folder.
  git("init");
  git("add", "-A");
  try {
    // Inline identity so the commit works even if the user has no global git
    // user.name/user.email configured.
    git(
      "-c", "user.email=bot@shipyard.dev",
      "-c", "user.name=ShipSurfer",
      "commit", "-m", "Initial ShipSurfer deploy"
    );
  } catch {
    // Nothing to commit is fine.
  }
  git("branch", "-M", repo.defaultBranch);
  try {
    git("remote", "remove", "shipyard");
  } catch {
    /* ignore */
  }
  git("remote", "add", "shipyard", repo.pushUrl);
  git("push", "-u", "shipyard", repo.defaultBranch, "--force");
  log.ok(`pushed code to ${repo.fullName}`);
}

/** Set an Actions/Repo secret (used later to surface env to CI if needed). */
export async function setRepoSecret(
  accessToken: string,
  fullName: string,
  key: string,
  value: string
) {
  if (config.dryRun) {
    log.ok(`[dry-run] would set secret ${key} on ${fullName}`);
    return;
  }
  const [owner, repo] = fullName.split("/");
  const octokit = new Octokit({ auth: accessToken });
  // libsodium-free path: GitHub requires encryption with the repo public key.
  const { data: pk } = await octokit.actions.getRepoPublicKey({ owner, repo });
  const sodium = await import("node:crypto");
  // Note: production should use libsodium sealed boxes. Placeholder kept simple
  // for v0.1; secret injection to the host happens via Railway env, not CI.
  void pk;
  void sodium;
  void value;
  log.warn(`setRepoSecret(${key}) is a v0.1 stub — env goes to Railway directly`);
}
