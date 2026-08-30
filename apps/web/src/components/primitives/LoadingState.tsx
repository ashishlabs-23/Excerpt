import React from 'react';

export interface LoadingStateProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading Excerpt data...',
  size = 'md',
  fullPage = false
}) => {
  const sizeClasses = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4'
  };

  const content = (
    <div className="flex flex-col items-center justify-center p-6 space-y-3 text-center" role="status" aria-live="polite">
      <div
        className={`${sizeClasses[size]} border-indigo-500 border-t-transparent rounded-full animate-spin`}
        aria-hidden="true"
      />
      <span className="text-sm font-medium text-slate-300">{message}</span>
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] w-full bg-slate-950">
        {content}
      </div>
    );
  }

  return content;
};
