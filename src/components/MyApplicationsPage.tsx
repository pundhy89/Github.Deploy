import React, { useState, useEffect } from 'react';
import { AppTokens, GithubRepo, VercelProject, VercelDeployment } from '../types';
import { FolderGit2, Star, ExternalLink, Activity, Globe, Loader2 } from 'lucide-react';
import { getProjects, getDeployments } from '../lib/vercel';

export function MyApplicationsPage({ tokens, repos, onSelectRepo }: { tokens: AppTokens; repos: GithubRepo[]; onSelectRepo: (repo: string) => void }) {
  const [deployedApps, setDeployedApps] = useState<{ project: VercelProject, deployment: VercelDeployment, repo?: GithubRepo }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDeployedApps() {
      if (!tokens.vercel) {
        setLoading(false);
        return;
      }

      try {
        const projects = await getProjects(tokens.vercel);
        const appsWithDeployments = [];

        for (const proj of projects) {
          try {
            const deps = await getDeployments(tokens.vercel, proj.id);
            const readyDep = deps.find(d => d.state === 'READY');
            if (readyDep) {
              const matchedRepo = repos.find(r => proj.link?.repo && r.name === proj.link.repo);
              appsWithDeployments.push({ project: proj, deployment: readyDep, repo: matchedRepo });
            }
          } catch (e) {}
        }
        setDeployedApps(appsWithDeployments);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadDeployedApps();
  }, [tokens.vercel, repos]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Loader2 size={32} className="animate-spin mb-4 text-blue-500" />
        <p>Loading your applications...</p>
      </div>
    );
  }

  if (deployedApps.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Globe size={48} className="mb-4 text-gray-300 dark:text-gray-700" />
        <p className="text-lg font-medium text-gray-900 dark:text-white">No deployed applications found</p>
        <p className="text-sm">Connect your repositories to Vercel and deploy them to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">My Applications</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full font-medium">
          {deployedApps.length} Deployed
        </span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {deployedApps.map(app => (
          <a
            key={app.project.id}
            href={`https://${app.deployment.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group bg-white dark:bg-gray-900 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.2)] hover:shadow-[0_20px_40px_rgb(0,0,0,0.08)] dark:hover:shadow-[0_20px_40px_rgb(0,0,0,0.3)] border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-800 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col transform hover:-translate-y-1 block"
          >
            <div className="p-6 flex-1">
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl shadow-sm">
                  <Globe size={24} />
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs font-bold uppercase tracking-wider rounded-lg">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  Live
                </div>
              </div>
              
              <h3 className="font-bold text-xl text-gray-900 dark:text-white mb-2 truncate" title={app.project.name}>
                {app.project.name}
              </h3>
              
              <p className="text-gray-500 dark:text-gray-400 text-sm line-clamp-2 h-10">
                {app.repo?.description || "A deployed application on Vercel."}
              </p>
            </div>
            
            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-sm group-hover:bg-blue-50/50 dark:group-hover:bg-gray-800 transition-colors">
              <span className="flex items-center gap-2 text-gray-500 dark:text-gray-400 font-medium truncate">
                <ExternalLink size={14} className="text-gray-400 group-hover:text-blue-500 shrink-0 transition-colors" />
                <span className="truncate">{app.deployment.url}</span>
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
