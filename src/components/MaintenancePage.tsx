import React, { useState, useEffect } from 'react';
import { Github, TriangleAlert, Trash2, CheckCircle2, Loader2, RefreshCw, Server, AlertCircle, Wrench, RotateCcw } from 'lucide-react';
import { AppTokens, GithubRepo, VercelProject } from '../types';
import { getProjects, getDeployments, deleteProject, resetProjectSettings, triggerDeployment } from '../lib/vercel';
import { deleteRepo, getRepoTree, getFileContent, createOrUpdateFile, deleteFile, createRepo } from '../lib/github';

export function MaintenancePage({ tokens, repos, onRepoDeleted }: { tokens: AppTokens; repos: GithubRepo[]; onRepoDeleted: () => void }) {
  const [vercelProjects, setVercelProjects] = useState<VercelProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  
  const [repoStatus, setRepoStatus] = useState<Record<string, 'checking' | 'active' | 'empty' | 'error'>>({});
  const [projectStatus, setProjectStatus] = useState<Record<string, 'checking' | 'active' | 'error'>>({});
  
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [deletedRepos, setDeletedRepos] = useState<{name: string, fullName: string}[]>([]);

  const loadVercelProjects = async () => {
    if (!tokens.vercel) return;
    try {
      const projs = await getProjects(tokens.vercel);
      setVercelProjects(projs);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadVercelProjects().then(() => {
      runAnalysis();
    });
  }, [tokens.vercel, tokens.github]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    
    const newRepoStatus: Record<string, 'checking' | 'active' | 'empty' | 'error'> = {};
    const newProjectStatus: Record<string, 'checking' | 'active' | 'error'> = {};
    
    try {
      if (tokens.github) {
        for (const repo of repos) {
          newRepoStatus[repo.id] = 'checking';
          setRepoStatus({...newRepoStatus});
          try {
            const tree = await getRepoTree(tokens.github, repo.full_name);
            if (tree.length === 0) {
              newRepoStatus[repo.id] = 'empty';
            } else {
              newRepoStatus[repo.id] = 'active';
            }
          } catch (e) {
            newRepoStatus[repo.id] = 'empty';
          }
          setRepoStatus({...newRepoStatus});
        }
      }
      
      if (tokens.vercel) {
        const projs = await getProjects(tokens.vercel);
        setVercelProjects(projs);
        for (const proj of projs) {
          newProjectStatus[proj.id] = 'checking';
          setProjectStatus({...newProjectStatus});
          try {
            const deps = await getDeployments(tokens.vercel, proj.id);
            if (deps.length === 0 || deps[0].state === 'ERROR' || deps[0].state === 'CANCELED') {
              newProjectStatus[proj.id] = 'error';
            } else {
              newProjectStatus[proj.id] = 'active';
            }
          } catch (e) {
            newProjectStatus[proj.id] = 'error';
          }
          setProjectStatus({...newProjectStatus});
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDeleteRepo = async (repo: GithubRepo) => {
    if (!confirm(`Are you sure you want to delete ${repo.full_name} from GitHub? This action is irreversible.`)) return;
    setProcessingId(repo.id);
    try {
      await deleteRepo(tokens.github, repo.full_name);
      setRepoStatus(prev => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
      setDeletedRepos(prev => [...prev, { name: repo.name, fullName: repo.full_name }]);
      onRepoDeleted();
      alert(`Deleted ${repo.full_name}`);
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleRestoreRepo = async (deletedRepo: {name: string, fullName: string}) => {
    if (!confirm(`Restore ${deletedRepo.fullName}? This will create a new empty repository with the same name.`)) return;
    setProcessingId(`restore_${deletedRepo.fullName}`);
    try {
      await createRepo(tokens.github, deletedRepo.name);
      setDeletedRepos(prev => prev.filter(r => r.fullName !== deletedRepo.fullName));
      onRepoDeleted(); // Trigger a refresh
      alert(`Restored ${deletedRepo.fullName}`);
    } catch (err: any) {
      alert(`Failed to restore: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeleteProject = async (proj: VercelProject) => {
    if (!confirm(`Are you sure you want to delete ${proj.name} from Vercel? This action is irreversible.`)) return;
    setProcessingId(proj.id);
    try {
      await deleteProject(tokens.vercel, proj.id);
      setProjectStatus(prev => {
        const next = { ...prev };
        delete next[proj.id];
        return next;
      });
      setVercelProjects(prev => prev.filter(p => p.id !== proj.id));
      alert(`Deleted ${proj.name}`);
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAutoRepair = async (proj: VercelProject) => {
    if (!confirm(`Attempt to auto-repair Vercel project ${proj.name}? This will reset build settings, add vercel.json, and clear lockfiles from its associated repo.`)) return;
    setProcessingId(`repair_${proj.id}`);
    setProcessStatus('Resetting Vercel framework & build settings...');
    
    try {
      await resetProjectSettings(tokens.vercel, proj.id);
      
      const repoFullName = proj.link?.repo 
        ? (proj.link.org ? `${proj.link.org}/${proj.link.repo}` : proj.link.repo)
        : null;
      if (repoFullName && tokens.github) {
        setProcessStatus('Configuring vercel.json...');
        let vercelJsonSha;
        let vercelJsonContent: any = {};
        
        const tree = await getRepoTree(tokens.github, repoFullName);
        
        try {
          const vercelJsonFile = tree.find(f => f.path === 'vercel.json');
          if (vercelJsonFile) {
            vercelJsonSha = vercelJsonFile.sha;
            const fileContent = await getFileContent(tokens.github, repoFullName, 'vercel.json');
            vercelJsonContent = JSON.parse(fileContent);
          }
        } catch (e) {
          console.warn('Could not parse existing vercel.json, creating a new one.');
        }
        
        vercelJsonContent = {
          ...vercelJsonContent,
          buildCommand: "npm run build || yarn build || pnpm build || echo 'No build step'",
          outputDirectory: "dist",
          framework: "vite"
        };
        
        await createOrUpdateFile(
          tokens.github, 
          repoFullName, 
          'vercel.json', 
          JSON.stringify(vercelJsonContent, null, 2), 
          'Auto-repair: Add/Update vercel.json configuration', 
          vercelJsonSha
        );

        setProcessStatus('Cleaning corrupted lockfiles from GitHub...');
        const lockfiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
        for (const file of tree) {
          if (lockfiles.includes(file.path)) {
            await deleteFile(tokens.github, repoFullName, file.path, file.sha);
          }
        }
        
        setProcessStatus('Triggering new deployment...');
        await triggerDeployment(tokens.vercel, proj.name, repoFullName);
        alert('Auto-repair completed! A new deployment has been triggered.');
        runAnalysis();
      } else {
        alert('Repaired Vercel settings, but could not link to a GitHub repository to clean files.');
      }
    } catch (err: any) {
      alert(`Repair failed: ${err.message}`);
    } finally {
      setProcessingId(null);
      setProcessStatus('');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 transition-colors">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <TriangleAlert className="text-orange-500" /> Maintenance & Repair
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">Manage all your repositories and projects. Detect issues and repair them.</p>
          </div>
          <button
            onClick={runAnalysis}
            disabled={analyzing || (!tokens.github && !tokens.vercel)}
            className="bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white dark:text-black px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            {analyzing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {analyzing ? 'Scanning...' : 'Auto Detect Issues'}
          </button>
        </div>

        <div className="space-y-8">
          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Github size={18} /> GitHub Repositories ({repos.length})
            </h3>
            
            {repos.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 text-center">
                No repositories found.
              </div>
            ) : (
              <div className="space-y-2">
                {repos.map(repo => {
                  const status = repoStatus[repo.id];
                  const isBroken = status === 'empty' || status === 'error';
                  const isChecking = status === 'checking';
                  const isActive = status === 'active';
                  
                  return (
                    <div key={repo.id} className={`flex items-center justify-between border p-3 rounded-lg ${isBroken ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30' : isActive ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                      <div className="flex items-center gap-3">
                        {isBroken ? <AlertCircle className="text-red-500" size={18} /> : isActive ? <CheckCircle2 className="text-green-500" size={18} /> : <Github className="text-gray-400" size={18} />}
                        <div>
                          <p className={`font-medium text-sm ${isBroken ? 'text-red-900 dark:text-red-400' : 'text-gray-900 dark:text-gray-200'}`}>{repo.full_name}</p>
                          <p className={`text-xs flex items-center gap-1 ${isBroken ? 'text-red-700 dark:text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                            {isChecking && <><Loader2 size={12} className="animate-spin" /> Checking...</>}
                            {isActive && 'Repository is active and contains files.'}
                            {isBroken && 'Repository appears to be empty or missing files.'}
                            {!status && 'Status unknown. Click Auto Detect to check.'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteRepo(repo)}
                        disabled={processingId === repo.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${isBroken ? 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
                      >
                        {processingId === repo.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Delete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {deletedRepos.length > 0 && (
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Trash2 size={18} className="text-gray-500" /> Deleted Repositories ({deletedRepos.length})
              </h3>
              <div className="space-y-2">
                {deletedRepos.map((deletedRepo, i) => (
                  <div key={i} className="flex items-center justify-between border border-gray-200 dark:border-gray-700 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center gap-3">
                      <Trash2 className="text-gray-400" size={18} />
                      <div>
                        <p className="font-medium text-sm text-gray-600 dark:text-gray-300 line-through">{deletedRepo.fullName}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Soft deleted from workspace. Can be recreated.</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRestoreRepo(deletedRepo)}
                      disabled={!!processingId}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      {processingId === `restore_${deletedRepo.fullName}` ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-medium text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Server size={18} /> Vercel Projects ({vercelProjects.length})
            </h3>
            
            {vercelProjects.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 text-center">
                No Vercel projects found.
              </div>
            ) : (
              <div className="space-y-2">
                {vercelProjects.map(proj => {
                  const status = projectStatus[proj.id];
                  const isBroken = status === 'error';
                  const isChecking = status === 'checking';
                  const isActive = status === 'active';
                  const isRepairing = processingId === `repair_${proj.id}`;

                  return (
                    <div key={proj.id} className={`flex items-center justify-between border p-3 rounded-lg ${isBroken ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-100 dark:border-orange-900/30' : isActive ? 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                      <div className="flex items-center gap-3">
                        {isBroken ? <TriangleAlert className="text-orange-500" size={18} /> : isActive ? <CheckCircle2 className="text-green-500" size={18} /> : <Server className="text-gray-400" size={18} />}
                        <div>
                          <p className={`font-medium text-sm ${isBroken ? 'text-orange-900 dark:text-orange-400' : 'text-gray-900 dark:text-gray-200'}`}>{proj.name}</p>
                          <p className={`text-xs flex items-center gap-1 ${isBroken ? 'text-orange-700 dark:text-orange-500' : 'text-gray-500 dark:text-gray-400'}`}>
                            {isChecking && <><Loader2 size={12} className="animate-spin" /> Checking...</>}
                            {isRepairing && <><Loader2 size={12} className="animate-spin" /> {processStatus}</>}
                            {isActive && !isRepairing && 'Project has successful deployments.'}
                            {isBroken && !isRepairing && 'Project has failed deployments or no deployments.'}
                            {!status && !isRepairing && 'Status unknown. Click Auto Detect to check.'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isBroken && (
                          <button
                            onClick={() => handleAutoRepair(proj)}
                            disabled={!!processingId}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-900/30 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                          >
                            {isRepairing ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                            Auto Repair
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteProject(proj)}
                          disabled={!!processingId}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 ${isBroken ? 'bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'}`}
                        >
                          {processingId === proj.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
