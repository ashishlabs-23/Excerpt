import React from 'react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No Jobs Found',
  description = 'You have not submitted any video processing jobs yet. Submit a URL to get started.',
  actionLabel = 'Create New Job',
  onAction,
  icon
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl bg-slate-900/40 border border-slate-800 max-w-lg mx-auto my-8">
      <div className="w-16 h-16 mb-4 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 text-2xl">
        {icon || '🎬'}
      </div>
      <h3 className="text-xl font-bold text-slate-200 mb-2">{title}</h3>
      <p className="text-sm text-slate-400 mb-6 max-w-sm leading-relaxed">{description}</p>
      {onAction && (
        <button
          onClick={onAction}
          className="px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-colors shadow-lg shadow-indigo-600/25"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
