import React, { useState, useEffect } from 'react';
import { Play, ExternalLink, RefreshCw, Plus, Rocket, Loader2 } from 'lucide-react';
import { AppTokens, VercelDeployment, VercelProject, EnvVar } from '../types';
import { getDeployments, getProjects, createProjectWithGithub, triggerDeployment, getEnvVars, addEnvVar, resetProjectSettings } from '../lib/vercel';
import { appendDeployLinkToReadme, getRepoTree, deleteFile, getFileContent, createOrUpdateFile } from '../lib/github';

export function DeployManager({ tokens, repoFullName }: { tokens: AppTokens; repoFullName: string }) {
  const [project, setProject] = useState<VercelProject | null>(null);
  const [deployments, setDeployments] = useState<VercelDeployment[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [loading, setLoading] = useState(false);
  
  const [newEnvKey, setNewEnvKey] = useState('');
  const [newEnvVal, setNewEnvVal] = useState('');

  const loadData = async () => {
    if (!tokens.vercel || !repoFullName) return;
    setLoading(true);
    try {
      const projects = await getProjects(tokens.vercel);
      // Try to find if one is already linked to this repo
      let currentProject = projects.find(p => p.link?.type === 'github' && p.link?.repo === repoFullName);
      
      if (!currentProject) {
        // Option to create
        setProject(null);
        setDeployments([]);
      } else {
        setProject(currentProject);
        const deps = await getDeployments(tokens.vercel, currentProject.id);
        setDeployments(deps);
        
        // Automatically sync the latest Vercel deployment URL to GitHub README
        if (deps.length > 0 && deps[0].url) {
          try {
            await appendDeployLinkToReadme(tokens.github, repoFullName, deps[0].url);
          } catch (e) {
            console.warn('Silent README sync failed', e);
          }
        }
        
        const envs = await getEnvVars(tokens.vercel, currentProject.id);
        setEnvVars(envs);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [repoFullName, tokens.vercel]);

  const handleCreateProject = async () => {
    try {
      const pName = repoFullName.split('/')[1];
      const newProj = await createProjectWithGithub(tokens.vercel, pName, repoFullName);
      setProject(newProj);
      
      try {
        // Automatically trigger initial deployment
        const dep = await triggerDeployment(tokens.vercel, newProj.name, repoFullName);
        if (dep.url) {
          await appendDeployLinkToReadme(tokens.github, repoFullName, dep.url);
        }
        alert('Vercel project created and initial deployment triggered!');
      } catch (triggerErr) {
        alert('Vercel project created successfully! Pushing to GitHub will now trigger a deployment.');
      }
      
      loadData();
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    }
  };

  const handleManualDeploy = async () => {
    if (!project) return;
    try {
      const dep = await triggerDeployment(tokens.vercel, project.name, repoFullName);
      alert('Deployment triggered!');
      loadData();
      
      // Update README with the URL if it exists
      if (dep.url) {
        await appendDeployLinkToReadme(tokens.github, repoFullName, dep.url);
      }
    } catch (err: any) {
      alert(`Deploy failed: ${err.message}`);
    }
  };

  const handleSyncToReadme = async (dep: VercelDeployment) => {
    try {
      await appendDeployLinkToReadme(tokens.github, repoFullName, dep.url);
      alert('Successfully synced this deployment URL to README.md!');
    } catch (err: any) {
      alert(`Failed to sync to README: ${err.message}`);
    }
  };

  const handleAddEnv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || !newEnvKey || !newEnvVal) return;
    try {
      await addEnvVar(tokens.vercel, project.id, newEnvKey, newEnvVal);
      setNewEnvKey('');
      setNewEnvVal('');
      loadData();
    } catch (err: any) {
      alert(`Failed to add env var: ${err.message}`);
    }
  };

  if (!tokens.vercel) {
    return <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-xl transition-colors">Please set Vercel token in settings to manage deployments.</div>;
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Play size={18} className="text-black dark:text-white rotate-90" /> Vercel Deployments
        </h3>
        <button onClick={loadData} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-6">
        {!project ? (
          <div className="text-center py-8">
            <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Not linked to Vercel</h4>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Create a Vercel project linked to this repository to start deploying.</p>
            <button 
              onClick={handleCreateProject}
              className="bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Create & Link Vercel Project
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-medium text-gray-900 dark:text-white">Recent Deployments</h4>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={handleManualDeploy}
                    className="bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 text-white dark:text-black px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <Rocket size={16} /> Deploy Now
                  </button>
                </div>
              </div>
              
              {deployments.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center border border-dashed dark:border-gray-700 rounded-lg">No deployments yet</div>
              ) : (
                <div className="space-y-3">
                  {deployments.map(dep => (
                    <div key={dep.uid} className="flex items-center justify-between p-3 border border-gray-100 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <div>
                        <a href={`https://${dep.url}`} target="_blank" rel="noreferrer" className="font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
                          {dep.url} <ExternalLink size={14} />
                        </a>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            dep.state === 'READY' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                            dep.state === 'ERROR' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                            'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                          }`}>
                            {dep.state}
                          </span>
                          • {new Date(dep.createdAt).toLocaleString()}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleSyncToReadme(dep)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md text-xs font-medium transition-colors"
                          title="Sync URL to README.md"
                        >
                          Sync to README
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
              <h4 className="font-medium text-gray-900 dark:text-white mb-4">Environment Variables</h4>
              
              <form onSubmit={handleAddEnv} className="flex gap-2 mb-4">
                <input 
                  type="text" 
                  placeholder="KEY" 
                  value={newEnvKey}
                  onChange={e => setNewEnvKey(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-md outline-none focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <input 
                  type="text" 
                  placeholder="Value" 
                  value={newEnvVal}
                  onChange={e => setNewEnvVal(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-700 rounded-md outline-none focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
                <button type="submit" className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium rounded-md flex items-center gap-1 transition-colors">
                  <Plus size={16} /> Add
                </button>
              </form>

              <div className="space-y-2">
                {envVars.map(env => (
                  <div key={env.key} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800 rounded-md text-sm">
                    <span className="font-mono text-gray-700 dark:text-gray-300">{env.key}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-mono tracking-widest">••••••••</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
