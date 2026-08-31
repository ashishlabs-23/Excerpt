import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../components/auth/AuthProvider';
import { AuthGate } from '../components/auth/AuthGate';
import { UserSession } from '../lib/supabase';

const mockSession: UserSession = {
  userId: 'usr-999',
  email: 'test@excerpt.com',
  expiresAt: Date.now() + 3600000
};

describe('Auth & Session Hardening Tests (Step 2)', () => {
  
  it('1. session expiry during active subscription tears down subscription and renders auth ErrorState', () => {
    const mockSubscription = { unsubscribe: jest.fn() };
    const mockRedirect = jest.fn();

    const TestComponent = () => {
      const { triggerSessionExpiry } = useAuth();
      return (
        <AuthGate 
          activeSubscriptionSpy={mockSubscription} 
          onRedirectToLogin={mockRedirect}
        >
          <div>Protected Content View</div>
        </AuthGate>
      );
    };

    const { rerender } = render(
      <AuthProvider initialSession={mockSession}>
        <TestComponent />
      </AuthProvider>
    );

    // Assert initial protected view rendered
    expect(screen.getByText('Protected Content View')).toBeInTheDocument();
    expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();

    // Trigger session expiry mid-operation
    const ExpireButton = () => {
      const { triggerSessionExpiry } = useAuth();
      return <button onClick={triggerSessionExpiry}>Expire</button>;
    };

    rerender(
      <AuthProvider initialSession={mockSession}>
        <ExpireButton />
        <TestComponent />
      </AuthProvider>
    );

    act(() => {
      screen.getByText('Expire').click();
    });

    // Assert active subscription was cleanly torn down
    expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(1);

    // Assert unauthorized ErrorState rendered (not blank or crash)
    expect(screen.getByText('Session Expired')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content View')).not.toBeInTheDocument();
  });

  it('2. RLS-denied query renders unauthorized ErrorState instead of crash or blank screen', () => {
    const mockSubscription = { unsubscribe: jest.fn() };

    render(
      <AuthProvider initialSession={mockSession}>
        <AuthGate isRlsDenied={true} activeSubscriptionSpy={mockSubscription}>
          <div>Protected Content View</div>
        </AuthGate>
      </AuthProvider>
    );

    // Assert RLS denial screen rendered
    expect(screen.getByText('Unauthorized Data Access (403)')).toBeInTheDocument();
    expect(screen.getByText(/Row-Level Security policy denied access/i)).toBeInTheDocument();
    expect(screen.queryByText('Protected Content View')).not.toBeInTheDocument();
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
  });

  it('3. cross-tab logout propagates to current tab without refresh', () => {
    const TestView = () => {
      const { session } = useAuth();
      return <div>{session ? `Logged in as ${session.email}` : 'Logged Out View'}</div>;
    };

    render(
      <AuthProvider initialSession={mockSession}>
        <TestView />
      </AuthProvider>
    );

    expect(screen.getByText('Logged in as test@excerpt.com')).toBeInTheDocument();

    // Simulate cross-tab logout event from another browser tab
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'excerpt_logout_event',
          newValue: Date.now().toString()
        })
      );
    });

    // Assert current tab reactively updated to Logged Out View
    expect(screen.getByText('Logged Out View')).toBeInTheDocument();
  });
});
