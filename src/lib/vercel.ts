import { VercelProject, VercelDeployment, EnvVar } from '../types';

const API_BASE = '/api/vercel';

const headers = (token: string) => ({
  Authorization: `Bearer ${token}`,
});

export async function getProjects(token: string): Promise<VercelProject[]> {
  const res = await fetch(`${API_BASE}/v9/projects`, { headers: headers(token) });
  if (!res.ok) throw new Error('Failed to fetch Vercel projects');
  const data = await res.json();
  return data.projects;
}

export async function deleteProject(token: string, projectId: string) {
  const res = await fetch(`${API_BASE}/v9/projects/${projectId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) throw new Error('Failed to delete Vercel project');
  return true;
}

export async function createProjectWithGithub(token: string, name: string, repoFullName: string): Promise<VercelProject> {
  const res = await fetch(`${API_BASE}/v9/projects`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(), // Vercel names must be kebab-case
      framework: null,
      gitRepository: {
        type: 'github',
        repo: repoFullName,
      },
    }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to create Vercel project');
  }
  return res.json();
}

export async function getDeployments(token: string, projectId: string): Promise<VercelDeployment[]> {
  const res = await fetch(`${API_BASE}/v6/deployments?projectId=${projectId}&limit=10`, { headers: headers(token) });
  if (!res.ok) throw new Error('Failed to fetch deployments');
  const data = await res.json();
  return data.deployments;
}

export async function triggerDeployment(token: string, name: string, gitRepoFullName: string) {
  // Triggering a deployment via Vercel API for a GitHub repo
  const res = await fetch(`${API_BASE}/v13/deployments`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase(),
      gitSource: {
        type: 'github',
        repo: gitRepoFullName,
        ref: 'main', // Assuming main branch
      }
    }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to trigger deployment');
  }
  return res.json();
}

export async function getEnvVars(token: string, projectId: string): Promise<EnvVar[]> {
  const res = await fetch(`${API_BASE}/v9/projects/${projectId}/env`, { headers: headers(token) });
  if (!res.ok) throw new Error('Failed to fetch environment variables');
  const data = await res.json();
  return data.envs;
}

export async function addEnvVar(
  token: string,
  projectId: string,
  key: string,
  value: string,
  targets: ('production' | 'preview' | 'development')[] = ['production', 'preview', 'development']
) {
  const res = await fetch(`${API_BASE}/v10/projects/${projectId}/env`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key,
      value,
      type: 'encrypted',
      target: targets,
    }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to add environment variable');
  }
  return res.json();
}

export async function deleteEnvVar(token: string, projectId: string, envId: string) {
  const res = await fetch(`${API_BASE}/v9/projects/${projectId}/env/${envId}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) throw new Error('Failed to delete environment variable');
  return res.json();
}

export async function resetProjectSettings(token: string, projectId: string) {
  const res = await fetch(`${API_BASE}/v9/projects/${projectId}`, {
    method: 'PATCH',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      framework: null,
      buildCommand: null,
      installCommand: null,
      outputDirectory: null
    }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error?.message || 'Failed to reset project settings');
  }
  return res.json();
}
