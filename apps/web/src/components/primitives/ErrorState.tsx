import React from 'react';

export type ErrorType = 'NETWORK_ERROR' | 'AUTH_RLS_DENIED' | 'SERVER_ERROR' | 'UNKNOWN';

export interface ErrorStateProps {
  type?: ErrorType;
  title?: string;
  message?: string;
  onRetry?: () => void;
  onReauth?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  type = 'NETWORK_ERROR',
  title,
  message,
  onRetry,
  onReauth
}) => {
  const isAuthError = type === 'AUTH_RLS_DENIED';

  const defaultTitle = isAuthError 
    ? 'Access Denied (401/403)' 
    : 'Connection Failure';

  const defaultMessage = isAuthError
    ? 'Your session has expired or you lack permissions to view this resource. Please re-authenticate.'
    : 'Unable to reach the Excerpt backend server. Please check your network connection and retry.';

  return (
    <div 
      className="flex flex-col items-center justify-center p-8 m-4 rounded-xl bg-slate-900/90 border border-red-500/20 text-center max-w-md mx-auto shadow-xl"
      role="alert"
    >
      <div className="w-12 h-12 mb-4 rounded-full bg-red-500/10 flex items-center justify-center text-red-400 text-xl font-bold">
        {isAuthError ? '🔒' : '⚠️'}
      </div>
      <h3 className="text-lg font-semibold text-slate-100 mb-2">
        {title || defaultTitle}
      </h3>
      <p className="text-sm text-slate-400 mb-6 leading-relaxed">
        {message || defaultMessage}
      </p>

      {isAuthError ? (
        <button
          onClick={onReauth}
          className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-colors shadow-lg shadow-indigo-600/20"
        >
          Re-Authenticate Now
        </button>
      ) : (
        <button
          onClick={onRetry}
          className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-sm transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
};
