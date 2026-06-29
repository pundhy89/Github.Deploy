import React, { useState } from 'react';
import { Download, UploadCloud, Tag, Loader2 } from 'lucide-react';
import { AppTokens } from '../types';
import { createRelease, uploadReleaseAsset } from '../lib/github';

export function ReleaseManager({ tokens, repoFullName }: { tokens: AppTokens; repoFullName: string }) {
  const [version, setVersion] = useState('v1.0.0');
  const [releaseName, setReleaseName] = useState('Initial Release');
  const [changelog, setChangelog] = useState('Added APK download');
  const [apkFile, setApkFile] = useState<File | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const handleCreateRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apkFile || !repoFullName || !tokens.github) return;

    setLoading(true);
    setStatus('Creating release...');
    try {
      const release = await createRelease(tokens.github, repoFullName, version, releaseName, changelog);
      
      setStatus('Uploading APK...');
      await uploadReleaseAsset(tokens.github, release.upload_url, apkFile, setStatus);
      
      setStatus('Release created successfully!');
      alert('APK uploaded and release published!');
      
      // Reset form
      setVersion('');
      setReleaseName('');
      setChangelog('');
      setApkFile(null);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  if (!tokens.github) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Download size={18} className="text-emerald-500" /> APK Distribution (Releases)
        </h3>
      </div>
      
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Create a GitHub Release and attach an APK file so others can download your application easily.</p>
        
        <form onSubmit={handleCreateRelease} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Tag Version</label>
              <input 
                type="text" 
                required
                value={version}
                onChange={e => setVersion(e.target.value)}
                placeholder="v1.0.0"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Release Name</label>
              <input 
                type="text" 
                required
                value={releaseName}
                onChange={e => setReleaseName(e.target.value)}
                placeholder="Initial Release"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Changelog / Notes</label>
            <textarea 
              rows={3}
              value={changelog}
              onChange={e => setChangelog(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md outline-none focus:ring-2 focus:ring-emerald-500 text-sm resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">APK File</label>
            <input 
              type="file" 
              accept=".apk"
              required
              onChange={e => setApkFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-emerald-50 dark:file:bg-emerald-900/30 file:text-emerald-700 dark:file:text-emerald-400 hover:file:bg-emerald-100 dark:hover:file:bg-emerald-900/50 cursor-pointer border border-gray-300 dark:border-gray-700 rounded-md p-1 bg-white dark:bg-gray-800"
            />
          </div>

          <button 
            type="submit" 
            disabled={loading || !apkFile}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            {loading ? status : 'Publish Release'}
          </button>
        </form>
      </div>
    </div>
  );
}
