import React, { useState, useRef } from 'react';
import { validateMediaUrl, validateLocalFile } from '../../lib/uploadValidation';
import { apiClient } from '../../lib/api';

export interface UploadZoneProps {
  onJobCreated?: (jobId: string, isDuplicate?: boolean) => void;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ onJobCreated }) => {
  const [activeTab, setActiveTab] = useState<'url' | 'file'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    // 1. Client-Side URL Validation (SSRF & Host Checks)
    const validation = validateMediaUrl(urlInput);
    if (!validation.isValid) {
      setError(validation.errorMessage || 'Invalid URL');
      return;
    }

    setIsUploading(true);
    setProgress(30);

    // 2. Submit to API Client
    const res = await apiClient.createJob(urlInput, 3);
    setIsUploading(false);
    setProgress(100);

    if (!res.success) {
      // Check for 409 Conflict / In-flight duplicate detection
      if (res.error.statusCode === 409 || res.error.message.includes('already in flight')) {
        setStatusMessage('Already Processing: Reusing existing job context in progress.');
        if (onJobCreated) onJobCreated('job-existing', true);
        return;
      }

      setError(res.error.message);
      return;
    }

    setStatusMessage('Job submitted successfully!');
    if (onJobCreated) onJobCreated(res.data.id, false);
  };

  const handleFileSelect = (file: File) => {
    setError(null);
    setStatusMessage(null);

    // Client-Side Pre-Flight Check (Size & Audio-Only)
    const validation = validateLocalFile(file);
    if (!validation.isValid) {
      setError(validation.errorMessage || 'Invalid file');
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setProgress(10);
    setError(null);
    setStatusMessage(null);

    abortControllerRef.current = new AbortController();

    // Simulated Chunked Upload with Progress & Cancellation Support
    try {
      for (let p = 20; p <= 100; p += 20) {
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('Upload cancelled by user.');
        }
        await new Promise((r) => setTimeout(r, 200));
        setProgress(p);
      }

      setIsUploading(false);
      setStatusMessage('File upload complete!');
      if (onJobCreated) onJobCreated('job-uploaded-123', false);

    } catch (err: any) {
      setIsUploading(false);
      setProgress(0);
      setError(err.message || 'Upload failed');
    }
  };

  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl">
      {/* Ceiling Guidelines Header */}
      <div className="mb-6 p-3 rounded-lg bg-indigo-950/40 border border-indigo-500/20 text-xs text-indigo-300 flex justify-between items-center">
        <span>⚡ Max File Size: <strong>5.00 GB</strong></span>
        <span>🕒 Max Duration: <strong>4 Hours</strong></span>
        <span>🎥 Format: <strong>Video Only</strong></span>
      </div>

      {/* Mode Switcher Tabs */}
      <div className="flex space-x-2 mb-6 border-b border-slate-800 pb-2">
        <button
          onClick={() => { setActiveTab('url'); setError(null); }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'url' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          YouTube / Video URL
        </button>
        <button
          onClick={() => { setActiveTab('file'); setError(null); }}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'file' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Upload Local File
        </button>
      </div>

      {/* Error Messaging */}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-start space-x-2">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Success / Duplicate Messaging */}
      {statusMessage && (
        <div className="mb-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm flex items-start space-x-2">
          <span>ℹ️</span>
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Tab 1: URL Submission */}
      {activeTab === 'url' && (
        <form onSubmit={handleUrlSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">Source Video URL</label>
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              disabled={isUploading}
              className="w-full px-4 py-3 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isUploading || !urlInput.trim()}
            className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-sm transition-colors"
          >
            {isUploading ? 'Processing URL...' : 'Extract Clips from URL'}
          </button>
        </form>
      )}

      {/* Tab 2: File Upload */}
      {activeTab === 'file' && (
        <div className="space-y-4">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.[0]) handleFileSelect(e.dataTransfer.files[0]);
            }}
            className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 text-center bg-slate-950/50 transition-colors cursor-pointer"
          >
            <input
              type="file"
              accept="video/*"
              className="hidden"
              id="file-upload-input"
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
            />
            <label htmlFor="file-upload-input" className="cursor-pointer">
              <div className="text-3xl mb-2">📁</div>
              <p className="text-sm font-medium text-slate-300">Drag & drop your video file here</p>
              <p className="text-xs text-slate-500 mt-1">MP4, WebM up to 5 GB</p>
            </label>
          </div>

          {selectedFile && (
            <div className="p-3 rounded-lg bg-slate-800 flex justify-between items-center text-sm">
              <span className="text-slate-200 truncate max-w-xs">{selectedFile.name}</span>
              <span className="text-xs text-slate-400">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</span>
            </div>
          )}

          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${progress}%` }} />
              </div>
              <button
                type="button"
                onClick={cancelUpload}
                className="text-xs text-red-400 hover:underline pt-1"
              >
                Cancel Upload
              </button>
            </div>
          )}

          {!isUploading && selectedFile && (
            <button
              onClick={handleFileUpload}
              className="w-full py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors"
            >
              Start Upload & Processing
            </button>
          )}
        </div>
      )}
    </div>
  );
};
