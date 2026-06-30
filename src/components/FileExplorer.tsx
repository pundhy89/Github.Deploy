import React, { useState, useEffect } from 'react';
import { Upload, Folder, File, Trash2, Plus, FileArchive, Loader2, RefreshCw } from 'lucide-react';
import { GithubFile, AppTokens } from '../types';
import { getRepoTree, uploadZipToGithub, deleteFile } from '../lib/github';
import { formatBytes } from '../lib/utils';

export function FileExplorer({ tokens, repoFullName }: { tokens: AppTokens; repoFullName: string }) {
  const [files, setFiles] = useState<GithubFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  
  const loadFiles = async () => {
    if (!repoFullName || !tokens.github) return;
    setLoading(true);
    setSelectedFiles(new Set());
    try {
      const tree = await getRepoTree(tokens.github, repoFullName);
      setFiles(tree);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [repoFullName, tokens.github]);

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Check if user wants to clear existing files (to prevent duplicates/leftovers)
    const overwriteAll = confirm('Do you want to clear all existing files in this repository before extracting the ZIP? \n\nClick "OK" to replace everything with the ZIP contents (clean overwrite).\nClick "Cancel" to just add/update files and keep existing ones.');
    
    setUploading(true);
    try {
      await uploadZipToGithub(tokens.github, repoFullName, 'main', file, setProgressMsg, overwriteAll);
      await loadFiles();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setProgressMsg('');
      if (e.target) e.target.value = '';
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    
    setUploading(true);
    try {
      const { uploadRawFilesToGithub } = await import('../lib/github');
      const filesArray = Array.from(fileList);
      
      const parsedFiles: { path: string; content: string; isBinary: boolean }[] = [];
      
      setProgressMsg('Reading files...');
      for (const file of filesArray) {
        const isBinary = /\.(png|jpg|jpeg|gif|ico|zip|apk|pdf|woff|woff2|ttf|eot)$/i.test(file.name);
        
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            // FileReader returns base64 prefixed with data URL for binary files
            if (isBinary) {
              const base64 = result.split(',')[1];
              resolve(base64);
            } else {
              resolve(result);
            }
          };
          reader.onerror = reject;
          if (isBinary) {
            reader.readAsDataURL(file);
          } else {
            reader.readAsText(file);
          }
        });
        
        // Use standard webkitRelativePath if folder upload is supported, else file.name
        const path = file.webkitRelativePath || file.name;
        parsedFiles.push({ path, content, isBinary });
      }
      
      await uploadRawFilesToGithub(tokens.github, repoFullName, 'main', parsedFiles, 'Upload files via Github Deploy', setProgressMsg);
      await loadFiles();
    } catch (err: any) {
      alert(`File upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setProgressMsg('');
      if (e.target) e.target.value = '';
    }
  };

  const handleToggleSelect = (path: string) => {
    const newSelected = new Set(selectedFiles);
    if (newSelected.has(path)) {
      newSelected.delete(path);
    } else {
      newSelected.add(path);
    }
    setSelectedFiles(newSelected);
  };

  const handleToggleAll = () => {
    if (selectedFiles.size === files.filter(f => f.type === 'blob').length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(files.filter(f => f.type === 'blob').map(f => f.path)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedFiles.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedFiles.size} selected file(s)?`)) return;
    
    setUploading(true);
    let successCount = 0;
    try {
      for (const path of selectedFiles) {
        setProgressMsg(`Deleting ${path}...`);
        const file = files.find(f => f.path === path);
        if (file) {
          try {
            await deleteFile(tokens.github, repoFullName, file.path, file.sha);
            successCount++;
          } catch (e) {
            console.error(`Failed to delete ${path}`, e);
          }
        }
      }
      if (successCount < selectedFiles.size) {
        alert(`Deleted ${successCount} out of ${selectedFiles.size} files. Some failed.`);
      }
      await loadFiles();
    } catch (err: any) {
      alert(`Bulk delete failed: ${err.message}`);
    } finally {
      setUploading(false);
      setProgressMsg('');
    }
  };

  const handleDelete = async (file: GithubFile) => {
    if (!confirm(`Are you sure you want to delete ${file.path}?`)) return;
    try {
      await deleteFile(tokens.github, repoFullName, file.path, file.sha);
      await loadFiles();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col h-[600px] transition-colors">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
        <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Folder size={18} className="text-blue-500" /> Repository Files
        </h3>
        <div className="flex items-center gap-2">
          <button onClick={loadFiles} className="p-2 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md" title="Refresh">
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          
          {selectedFiles.size > 0 && (
            <button 
              onClick={handleDeleteSelected}
              className="bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Trash2 size={16} /> Delete ({selectedFiles.size})
            </button>
          )}
          
          <label className="cursor-pointer bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors">
            <Upload size={16} />
            <span>Upload File</span>
            <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={uploading} />
          </label>
          <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors">
            <FileArchive size={16} />
            <span>Extract ZIP</span>
            <input type="file" accept=".zip" className="hidden" onChange={handleZipUpload} disabled={uploading} />
          </label>
        </div>
      </div>
      
      {uploading && (
        <div className="bg-blue-50 dark:bg-blue-900/30 p-3 text-sm text-blue-700 dark:text-blue-400 flex items-center justify-center gap-2 border-b border-blue-100 dark:border-blue-900/50">
          <Loader2 size={16} className="animate-spin" />
          {progressMsg}
        </div>
      )}

      <div className="flex-1 overflow-auto p-2">
        {files.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 p-8 text-center">
            <Folder size={48} className="mb-4 text-gray-300 dark:text-gray-600" />
            <p className="text-gray-900 dark:text-white font-medium mb-1">Repository is empty</p>
            <p className="text-sm">Upload files or extract a ZIP to commit them here.</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="px-4 py-2 w-10">
                  <input 
                    type="checkbox" 
                    onChange={handleToggleAll}
                    checked={files.filter(f => f.type === 'blob').length > 0 && selectedFiles.size === files.filter(f => f.type === 'blob').length}
                    className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                  />
                </th>
                <th className="px-2 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-24 text-right">Size</th>
                <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-16"></th>
              </tr>
            </thead>
            <tbody>
              {files.map(file => (
                <tr key={file.sha} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 group border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2">
                    {file.type === 'blob' && (
                      <input 
                        type="checkbox" 
                        checked={selectedFiles.has(file.path)}
                        onChange={() => handleToggleSelect(file.path)}
                        className="rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      {file.type === 'tree' ? (
                        <Folder size={16} className="text-blue-400" />
                      ) : (
                        <File size={16} className="text-gray-400 dark:text-gray-500" />
                      )}
                      {file.path}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 text-right">
                    {file.size !== undefined ? formatBytes(file.size, 0) : '-'}
                  </td>
                  <td className="px-4 py-2">
                    {file.type === 'blob' && (
                      <button 
                        onClick={() => handleDelete(file)}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete file"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

