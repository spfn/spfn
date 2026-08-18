/**
 * What each provider can be asked, in the CLI's own words.
 *
 * Three services with nothing in common — a Git host, a Postgres host and a
 * build platform — reduced to the handful of questions a Kit deployment
 * actually asks. Every method here is either a *read* of what already exists or
 * a *create* of one named thing, because that pairing is what makes a resume
 * safe: the read runs first, and the create only happens when the read came
 * back empty.
 *
 * The seam is an interface rather than an HTTP client on purpose. This round
 * ships no real transport at all — every adapter is exercised against a fake
 * that holds real state, so "it did not create the repository twice" is a fact
 * about the provider's state rather than about what the CLI believes it did.
 * The HTTP implementations land with the run that is allowed to call a real
 * provider.
 *
 * Nothing here returns a secret, and the two methods that *accept* one take it
 * as a value in memory: it goes to the provider and nowhere else — not into an
 * envelope, not into the journal, not into evidence.
 */

export interface GithubRepository
{
    id: string;
    owner: string;
    name: string;
    defaultBranch: string;
    /** The commit the default branch points at, or null for an empty repo. */
    headCommit: string | null;
}

export interface GithubApi
{
    /** The repository, or null when the owner has no such name. */
    findRepository(request: { owner: string; name: string }): Promise<GithubRepository | null>;
    createRepository(request: { owner: string; name: string; private: boolean }): Promise<GithubRepository>;
    /** Push a commit that already exists locally. Reports what HEAD became. */
    pushBranch(request: { repositoryId: string; branch: string; commit: string }): Promise<GithubRepository>;
    /** Names only ever come back; values only ever go in. */
    listSecretNames(request: { repositoryId: string }): Promise<string[]>;
    setSecret(request: { repositoryId: string; name: string; value: string }): Promise<void>;
}

export interface SupabaseProject
{
    ref: string;
    organizationId: string;
    name: string;
    region: string;
    status: 'provisioning' | 'active';
}

export interface SupabaseApi
{
    findProject(request: { organizationId: string; name: string }): Promise<SupabaseProject | null>;
    createProject(request: {
        organizationId: string;
        name: string;
        region: string;
        plan: string;
    }): Promise<SupabaseProject>;
    /** Taken before a migration, so a failed one has something to go back to. */
    createBackup(request: { projectRef: string }): Promise<{ backupId: string }>;
    /** Which migrations this project has already had applied. */
    appliedMigrations(request: { projectRef: string }): Promise<string[]>;
    applyMigrations(request: { projectRef: string; migrations: string[] }): Promise<{ applied: string[] }>;
}

export interface VercelDeployment
{
    id: string;
    projectId: string;
    commit: string;
    /** `staged` is built and reachable; `production` is what visitors get. */
    target: 'staged' | 'production';
    state: 'building' | 'ready' | 'error';
    url: string;
}

export interface VercelProject
{
    id: string;
    teamId: string;
    name: string;
    region: string;
}

export interface VercelApi
{
    findProject(request: { teamId: string; name: string }): Promise<VercelProject | null>;
    createProject(request: { teamId: string; name: string; region: string }): Promise<VercelProject>;
    listEnvironmentNames(request: { projectId: string }): Promise<string[]>;
    setEnvironment(request: {
        projectId: string;
        variables: { key: string; value: string }[];
    }): Promise<void>;
    /** A build that is reachable but is not yet what visitors get. */
    createStagedDeployment(request: { projectId: string; commit: string }): Promise<VercelDeployment>;
    findDeploymentForCommit(request: { projectId: string; commit: string }): Promise<VercelDeployment | null>;
    readDeployment(request: { deploymentId: string }): Promise<VercelDeployment | null>;
    /** What visitors get right now, or null before the first promotion. */
    currentProduction(request: { projectId: string }): Promise<VercelDeployment | null>;
    promote(request: { projectId: string; deploymentId: string }): Promise<VercelDeployment>;
}

/** A health probe of a deployed URL. Injected so no test reaches a network. */
export interface HealthProbe
{
    check(request: { url: string }): Promise<{ ok: boolean; status: number; body: string }>;
}

export interface CloudProviderApis
{
    github: GithubApi;
    supabase: SupabaseApi;
    vercel: VercelApi;
    health: HealthProbe;
}
