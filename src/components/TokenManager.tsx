import React, { useState, useEffect } from 'react';
import { Github, Play, KeyRound, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { AppTokens } from '../types';
import { auth, db } from '../lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

interface TokenManagerProps {
  tokens: AppTokens;
  setTokens: (t: AppTokens) => void;
  onClose: () => void;
}

export function TokenManager({ tokens, setTokens, onClose }: TokenManagerProps) {
  const [localTokens, setLocalTokens] = useState<AppTokens>(tokens);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setTokens(localTokens);
    
    if (auth.currentUser) {
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'secrets', 'tokens'), {
          userId: auth.currentUser.uid,
          githubToken: localTokens.github,
          vercelToken: localTokens.vercel,
          updatedAt: Date.now()
        });
      } catch (error) {
        console.error("Failed to save tokens to Firestore:", error);
      }
    } else {
      localStorage.setItem('gitdeploy_tokens', JSON.stringify(localTokens));
    }

    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-colors">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800 transition-colors">
        <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center gap-3">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
            <KeyRound size={20} />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">API Tokens</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">Configure your access tokens</p>
          </div>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2">
                <Github size={16} /> GitHub Personal Access Token
              </label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="ghp_..."
                value={localTokens.github}
                onChange={(e) => setLocalTokens(t => ({ ...t, github: e.target.value }))}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Requires `repo` and `delete_repo` scopes.</p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 flex items-center gap-2">
                <Play size={16} className="rotate-90" /> Vercel Access Token
              </label>
              <input
                type="password"
                className="w-full px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                placeholder="..."
                value={localTokens.vercel}
                onChange={(e) => setLocalTokens(t => ({ ...t, vercel: e.target.value }))}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create in Vercel Account Settings &gt; Tokens.</p>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg flex items-start gap-3 text-yellow-800 dark:text-yellow-200 text-sm border border-yellow-100 dark:border-yellow-900/50">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <p>{auth.currentUser ? 'Your tokens are stored securely in your Firebase account.' : 'Your tokens are stored locally in your browser\'s localStorage. Sign in to sync them across devices.'}</p>
          </div>
        </div>

        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500 rounded-lg transition-colors flex items-center gap-2"
          >
            {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
            {saved ? 'Saved!' : 'Save Tokens'}
          </button>
        </div>
      </div>
    </div>
  );
}
