import JSZip from 'jszip';
import { GithubRepo, GithubFile } from '../types';

const API_BASE = 'https://api.github.com';

const headers = (token: string) => ({
  Accept: 'application/vnd.github.v3+json',
  Authorization: `Bearer ${token}`,
});

export async function getUserRepos(token: string): Promise<GithubRepo[]> {
  const res = await fetch(`${API_BASE}/user/repos?sort=updated&per_page=100`, { headers: headers(token) });
  if (!res.ok) throw new Error('Failed to fetch repositories');
  return res.json();
}

export async function deleteRepo(token: string, fullName: string) {
  const res = await fetch(`${API_BASE}/repos/${fullName}`, {
    method: 'DELETE',
    headers: headers(token),
  });
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error('Missing "delete_repo" scope. Please update your GitHub personal access token with "delete_repo" permissions to delete repositories.');
    }
    throw new Error('Failed to delete repository');
  }
  return true;
}

export async function createRepo(token: string, name: string): Promise<GithubRepo> {
  const res = await fetch(`${API_BASE}/user/repos`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, auto_init: true }),
  });
  if (!res.ok) throw new Error('Failed to create repository');
  return res.json();
}

export async function getRepoTree(token: string, fullName: string, branch = 'main'): Promise<GithubFile[]> {
  const res = await fetch(`${API_BASE}/repos/${fullName}/git/trees/${branch}?recursive=1`, { headers: headers(token) });
  if (!res.ok) {
    if (res.status === 409 || res.status === 404) return []; // Empty repo or branch not found
    throw new Error('Failed to fetch file tree');
  }
  const data = await res.json();
  return data.tree || [];
}

export async function getFileContent(token: string, fullName: string, path: string): Promise<string> {
  const res = await fetch(`${API_BASE}/repos/${fullName}/contents/${path}`, { headers: headers(token) });
  if (!res.ok) throw new Error('Failed to fetch file content');
  const data = await res.json();
  return decodeURIComponent(escape(atob(data.content)));
}

// Upload a single file (like README update)
export async function createOrUpdateFile(
  token: string,
  fullName: string,
  path: string,
  content: string,
  message: string,
  sha?: string
) {
  const res = await fetch(`${API_BASE}/repos/${fullName}/contents/${path}`, {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: btoa(unescape(encodeURIComponent(content))),
      sha,
    }),
  });
  if (!res.ok) throw new Error(`Failed to update ${path}`);
  return res.json();
}

export async function deleteFile(token: string, fullName: string, path: string, sha: string, message = 'Delete file') {
  const res = await fetch(`${API_BASE}/repos/${fullName}/contents/${path}`, {
    method: 'DELETE',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha }),
  });
  if (!res.ok) throw new Error(`Failed to delete ${path}`);
  return res.json();
}

export async function uploadRawFilesToGithub(
  token: string,
  fullName: string,
  branch: string,
  files: { path: string; content: string; isBinary: boolean }[],
  commitMessage: string,
  onProgress?: (msg: string) => void
) {
  if (files.length === 0) throw new Error('No files to upload');

  // 1. Get latest commit SHA
  onProgress?.('Fetching latest commit...');
  let latestCommitSha;
  let baseTreeSha;
  
  const refRes = await fetch(`${API_BASE}/repos/${fullName}/git/refs/heads/${branch}`, { headers: headers(token) });
  if (!refRes.ok) {
    latestCommitSha = null;
  } else {
    const refData = await refRes.json();
    latestCommitSha = refData.object.sha;
    const commitRes = await fetch(`${API_BASE}/repos/${fullName}/git/commits/${latestCommitSha}`, { headers: headers(token) });
    const commitData = await commitRes.json();
    baseTreeSha = commitData.tree.sha;
  }

  // 2. Create blobs
  onProgress?.(`Uploading ${files.length} files...`);
  const treeEntries: any[] = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(`Uploading file ${i + 1}/${files.length}: ${file.path}`);
    
    const blobRes = await fetch(`${API_BASE}/repos/${fullName}/git/blobs`, {
      method: 'POST',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: file.isBinary ? file.content : btoa(unescape(encodeURIComponent(file.content))),
        encoding: 'base64',
      }),
    });
    
    if (!blobRes.ok) throw new Error(`Failed to upload ${file.path}`);
    const blobData = await blobRes.json();
    treeEntries.push({
      path: file.path,
      mode: '100644',
      type: 'blob',
      sha: blobData.sha,
    });
  }

  // 3. Create Tree
  onProgress?.('Creating Git tree...');
  const treeBody: any = { tree: treeEntries };
  if (baseTreeSha) treeBody.base_tree = baseTreeSha;
  
  const treeRes = await fetch(`${API_BASE}/repos/${fullName}/git/trees`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(treeBody),
  });
  if (!treeRes.ok) throw new Error('Failed to create tree');
  const treeData = await treeRes.json();

  // 4. Create Commit
  onProgress?.('Creating commit...');
  const commitBody: any = {
    message: commitMessage,
    tree: treeData.sha,
  };
  if (latestCommitSha) commitBody.parents = [latestCommitSha];

  const commitRes = await fetch(`${API_BASE}/repos/${fullName}/git/commits`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(commitBody),
  });
  if (!commitRes.ok) throw new Error('Failed to create commit');
  const commitData = await commitRes.json();

  // 5. Update Ref
  onProgress?.('Updating branch reference...');
  if (latestCommitSha) {
    const updateRefRes = await fetch(`${API_BASE}/repos/${fullName}/git/refs/heads/${branch}`, {
      method: 'PATCH',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitData.sha }),
    });
    if (!updateRefRes.ok) throw new Error('Failed to update ref');
  } else {
    const createRefRes = await fetch(`${API_BASE}/repos/${fullName}/git/refs`, {
      method: 'POST',
      headers: { ...headers(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitData.sha }),
    });
    if (!createRefRes.ok) throw new Error('Failed to create branch');
  }
}

// Complex Zip Upload using Git Database API for bulk commits
export async function uploadZipToGithub(
  token: string,
  fullName: string,
  branch: string,
  zipBlob: File | Blob,
  onProgress?: (msg: string) => void
) {
  const zip = new JSZip();
  const unzipped = await zip.loadAsync(zipBlob);
  const files: { path: string; content: string; isBinary: boolean }[] = [];

  onProgress?.('Extracting ZIP...');
  for (const [path, file] of Object.entries(unzipped.files)) {
    if (file.dir) continue;
    
    // Ignore common macOS hidden files / folders
    if (path.includes('__MACOSX') || path.includes('.DS_Store')) continue;

    // Check if it's binary or text
    const isBinary = /\.(png|jpg|jpeg|gif|ico|zip|apk|pdf|woff|woff2|ttf|eot)$/i.test(path);
    const content = isBinary ? await file.async('base64') : await file.async('text');
    files.push({ path, content, isBinary });
  }

  await uploadRawFilesToGithub(token, fullName, branch, files, 'Upload files from ZIP via Github Deploy', onProgress);
  onProgress?.('Upload complete!');
  return true;
}

// GitHub Releases API (for APK downloads)
export async function createRelease(
  token: string,
  fullName: string,
  tagName: string,
  name: string,
  body: string
) {
  const res = await fetch(`${API_BASE}/repos/${fullName}/releases`, {
    method: 'POST',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: tagName, name, body }),
  });
  if (!res.ok) throw new Error('Failed to create release');
  return res.json();
}

export async function uploadReleaseAsset(
  token: string,
  uploadUrl: string, // Comes from createRelease response
  file: File,
  onProgress?: (msg: string) => void
) {
  const cleanUrl = uploadUrl.split('{')[0] + `?name=${encodeURIComponent(file.name)}`;
  onProgress?.(`Uploading ${file.name}...`);
  
  const res = await fetch(cleanUrl, {
    method: 'POST',
    headers: {
      ...headers(token),
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });
  if (!res.ok) throw new Error('Failed to upload asset');
  return res.json();
}

// Helper to append Vercel deploy link to README
export async function appendDeployLinkToReadme(token: string, fullName: string, deployUrl: string) {
  try {
    let sha;
    let content = '';
    try {
      const res = await fetch(`${API_BASE}/repos/${fullName}/contents/README.md`, { headers: headers(token) });
      if (res.ok) {
        const data = await res.json();
        sha = data.sha;
        content = decodeURIComponent(escape(atob(data.content)));
      }
    } catch (e) {
      // README doesn't exist yet, we'll create it
    }

    if (content.includes(deployUrl)) {
      console.log('README already contains this Vercel URL');
      return;
    }

    const newContent = `${content}\n\n## Deploy Status\n\n🚀 Successfully deployed to Vercel: [${deployUrl}](https://${deployUrl})`;
    await createOrUpdateFile(token, fullName, 'README.md', newContent.trim(), 'Update README with Vercel URL', sha);
  } catch (err) {
    console.error('Failed to update README:', err);
    throw err;
  }
}
