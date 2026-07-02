import { config } from "../config";
import { log } from "../logger";

/*
 * Railway provider client (GraphQL Public API).
 * Endpoint: https://backboard.railway.com/graphql/v2
 *
 * Mutations used in v0.1:
 *   projectCreate            → create a project
 *   serviceCreate            → create a service from a connected GitHub repo
 *   variableCollectionUpsert → set environment variables
 *   serviceDomainCreate      → mint a public *.up.railway.app URL
 *
 * Mutation names/shapes track Railway's documented schema; introspection is
 * enabled, so SETUP.md explains how to confirm against the live schema.
 */

interface DeployResult {
  projectId: string;
  serviceId: string;
  environmentId: string;
  liveUrl: string;
}

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(config.railway.graphqlUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) {
    throw new Error(`Railway API: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  if (!json.data) throw new Error("Railway API returned no data");
  return json.data;
}

export async function deployFromRepo(opts: {
  token: string;
  projectName: string;
  repoFullName: string; // owner/name
  branch: string;
  env: Record<string, string>;
  port?: number; // app's listening port, used as the domain targetPort
}): Promise<DeployResult> {
  if (config.dryRun) {
    const slug = opts.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    log.ok(`[dry-run] would create Railway project "${opts.projectName}"`);
    log.ok(`[dry-run] would deploy ${opts.repoFullName}@${opts.branch}`);
    log.ok(`[dry-run] would set ${Object.keys(opts.env).length} env var(s)`);
    return {
      projectId: "dry-project",
      serviceId: "dry-service",
      environmentId: "dry-env",
      liveUrl: `https://${slug}-production.up.railway.app`,
    };
  }

  // 0. Find the workspace to create the project in (Railway now requires a
  //    workspaceId). Use the first workspace the token can see.
  const wsData = await gql<{ me: { workspaces: { id: string; name: string }[] } }>(
    opts.token,
    `{ me { workspaces { id name } } }`,
    {}
  );
  const workspaceId = wsData.me?.workspaces?.[0]?.id;
  const workspaceName = wsData.me?.workspaces?.[0]?.name;
  if (!workspaceId) throw new Error("No Railway workspace found for this account");
  log.ok(`using workspace "${workspaceName}"`);

  // 1. Create the project IN that workspace.
  const created = await gql<{ projectCreate: { id: string; environments: { edges: { node: { id: string } }[] } } }>(
    opts.token,
    `mutation($input: ProjectCreateInput!) {
       projectCreate(input: $input) { id environments { edges { node { id } } } }
     }`,
    { input: { name: opts.projectName, workspaceId } }
  );
  const projectId = created.projectCreate.id;
  const environmentId = created.projectCreate.environments.edges[0].node.id;
  log.ok(`created Railway project ${projectId}`);

  // 2. Create a service sourced from the GitHub repo.
  const service = await gql<{ serviceCreate: { id: string } }>(
    opts.token,
    `mutation($input: ServiceCreateInput!) {
       serviceCreate(input: $input) { id }
     }`,
    {
      input: {
        projectId,
        source: { repo: opts.repoFullName },
        branch: opts.branch,
      },
    }
  );
  const serviceId = service.serviceCreate.id;
  log.ok(`created service ${serviceId} from ${opts.repoFullName}`);

  // 3. Inject environment variables (single source of truth from provisioning).
  if (Object.keys(opts.env).length > 0) {
    await gql(
      opts.token,
      `mutation($input: VariableCollectionUpsertInput!) {
         variableCollectionUpsert(input: $input)
       }`,
      {
        input: {
          projectId,
          environmentId,
          serviceId,
          variables: opts.env,
        },
      }
    );
    log.ok(`set ${Object.keys(opts.env).length} env var(s)`);
  }

  // 4. Mint a public domain.
  const domain = await gql<{ serviceDomainCreate: { domain: string } }>(
    opts.token,
    `mutation($input: ServiceDomainCreateInput!) {
       serviceDomainCreate(input: $input) { domain }
     }`,
    // targetPort tells Railway which port to route to (avoids 404s when the
    // app listens on a non-default port).
    { input: { environmentId, serviceId, ...(opts.port ? { targetPort: opts.port } : {}) } }
  );
  const liveUrl = `https://${domain.serviceDomainCreate.domain}`;
  log.ok(`live at ${liveUrl}`);

  return { projectId, serviceId, environmentId, liveUrl };
}

/*
 * Attach a custom domain to the service and return the DNS target the registrar
 * must CNAME to. Real mode uses Railway's customDomainCreate mutation, which
 * returns the required DNS record(s).
 */
export interface RailwayDnsRecord {
  type: string; // CNAME | TXT
  name: string; // fully-qualified record name
  value: string; // target / verification value
}

// Railway returns recordType as a GraphQL enum like "DNS_RECORD_TYPE_CNAME";
// Cloudflare wants plain "CNAME"/"TXT".
function normRecordType(t: string): string {
  return t.replace(/^DNS_RECORD_TYPE_/i, "").toUpperCase();
}

interface RailwayStatus {
  verificationDnsHost?: string | null;
  verificationToken?: string | null;
  dnsRecords: {
    recordType: string;
    fqdn?: string;
    hostlabel?: string;
    requiredValue: string;
  }[];
}

// Build the full record set: the traffic CNAME(s) from dnsRecords PLUS the
// ownership TXT, which Railway exposes separately as verificationDnsHost/Token.
function buildRecords(status: RailwayStatus, domain: string): RailwayDnsRecord[] {
  const records: RailwayDnsRecord[] = status.dnsRecords.map((r) => ({
    type: normRecordType(r.recordType),
    name: r.fqdn || (r.hostlabel ? `${r.hostlabel}.${domain}` : domain),
    value: r.requiredValue,
  }));
  if (status.verificationDnsHost && status.verificationToken) {
    const v = status.verificationToken;
    records.push({
      type: "TXT",
      name: status.verificationDnsHost,
      value: v.startsWith("railway-verify=") ? v : `railway-verify=${v}`,
    });
  }
  return records;
}

export async function addCustomDomain(opts: {
  token: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
  domain: string;
}): Promise<{ records: RailwayDnsRecord[] }> {
  if (config.dryRun) {
    const target = `${opts.domain.replace(/\./g, "-")}.up.railway.app`;
    log.ok(`[dry-run] would attach custom domain ${opts.domain} to service`);
    log.ok(`[dry-run] Railway requires CNAME + TXT records`);
    return {
      records: [
        { type: "CNAME", name: opts.domain, value: target },
        { type: "TXT", name: `_railway-verify.${opts.domain}`, value: "railway-verify=sim123" },
      ],
    };
  }

  // If the domain is already attached (e.g. a prior partial run left it on the
  // service), reuse its existing DNS records instead of failing on re-create.
  const existing = await findCustomDomainRecords(opts);
  if (existing && existing.length) {
    log.ok(`custom domain ${opts.domain} already attached — reusing its DNS records`);
    return { records: existing };
  }

  // Railway returns the DNS record(s) the registrar must create — typically a
  // CNAME (routing) and a TXT (ownership). Field names confirmed via the
  // GraphiQL playground; adjust here if the live schema differs.
  const res = await gql<{ customDomainCreate: { status: RailwayStatus } }>(
    opts.token,
    `mutation($input: CustomDomainCreateInput!) {
       customDomainCreate(input: $input) {
         status {
           verificationDnsHost
           verificationToken
           dnsRecords { recordType fqdn hostlabel requiredValue }
         }
       }
     }`,
    {
      input: {
        projectId: opts.projectId,
        environmentId: opts.environmentId,
        serviceId: opts.serviceId,
        domain: opts.domain,
      },
    }
  );
  const records = buildRecords(res.customDomainCreate.status, opts.domain);
  log.ok(`attached custom domain ${opts.domain} (${records.length} DNS record(s): CNAME + TXT)`);
  return { records };
}

/** Look up an already-attached custom domain's DNS records (for idempotency). */
async function findCustomDomainRecords(opts: {
  token: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
  domain: string;
}): Promise<RailwayDnsRecord[] | null> {
  try {
    const data = await gql<{
      domains: { customDomains: { domain: string; status: RailwayStatus }[] };
    }>(
      opts.token,
      `query($projectId: String!, $environmentId: String!, $serviceId: String!) {
         domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
           customDomains {
             domain
             status {
               verificationDnsHost
               verificationToken
               dnsRecords { recordType fqdn hostlabel requiredValue }
             }
           }
         }
       }`,
      {
        projectId: opts.projectId,
        environmentId: opts.environmentId,
        serviceId: opts.serviceId,
      }
    );
    const cd = data.domains?.customDomains?.find((d) => d.domain === opts.domain);
    if (!cd) return null;
    return buildRecords(cd.status, opts.domain);
  } catch {
    return null;
  }
}
