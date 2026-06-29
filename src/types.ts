export interface AppTokens {
  github: string;
  vercel: string;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  default_branch: string;
}

export interface GithubFile {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework: string | null;
  link?: {
    type: string;
    repoId: number;
    repo: string;
    org?: string;
  };
}

export interface VercelDeployment {
  uid: string;
  url: string;
  name: string;
  state: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
  createdAt: number;
}

export interface EnvVar {
  key: string;
  value: string;
  target: ('production' | 'preview' | 'development')[];
  type: 'encrypted' | 'plain';
}
