import React from 'react';
import { useAuth } from '../AuthProvider';
import { LoadingState } from '../primitives/LoadingState';
import { ErrorState } from '../primitives/ErrorState';

export interface AuthGateProps {
  children: React.ReactNode;
  activeSubscriptionSpy?: { unsubscribe: () => void }; // Optional spy for testing subscription teardown
  isRlsDenied?: boolean; // Forced RLS denial simulation prop
  onRedirectToLogin?: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({
  children,
  activeSubscriptionSpy,
  isRlsDenied = false,
  onRedirectToLogin
}) => {
  const { session, isLoading, isSessionExpired } = useAuth();

  // 1. Loading Phase
  if (isLoading) {
    return <LoadingState message="Verifying authentication session..." fullPage />;
  }

  // 2. Teardown Handler for Active Subscriptions on Auth Loss
  const cleanupSubscriptions = () => {
    if (activeSubscriptionSpy) {
      activeSubscriptionSpy.unsubscribe();
    }
  };

  // 3. RLS Denial Error State (Query Level Auth Failure)
  if (isRlsDenied) {
    cleanupSubscriptions();
    return (
      <ErrorState
        type="AUTH_RLS_DENIED"
        title="Unauthorized Data Access (403)"
        message="Row-Level Security policy denied access to this job artifact. You do not own this resource."
        onReauth={onRedirectToLogin}
      />
    );
  }

  // 4. Session Expiry / Missing Session Phase
  if (!session || isSessionExpired) {
    cleanupSubscriptions();
    
    const message = isSessionExpired
      ? 'Your session expired mid-operation. Please re-authenticate to resume.'
      : 'You must be signed in to access the Excerpt workspace.';

    return (
      <ErrorState
        type="AUTH_RLS_DENIED"
        title={isSessionExpired ? 'Session Expired' : 'Authentication Required'}
        message={message}
        onReauth={onRedirectToLogin}
      />
    );
  }

  // 5. Authenticated & Authorized
  return <>{children}</>;
};
