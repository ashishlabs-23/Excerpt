import { renderHook } from '@testing-library/react';
import { useRealtimeSync } from '../lib/useRealtimeSync';

describe('Realtime Subscription Hook Unmount Cleanup', () => {
  it('unsubscribes and cleans up channel on unmount', () => {
    const mockChannelSpy = {
      unsubscribe: jest.fn()
    };

    const { unmount } = renderHook(() => 
      useRealtimeSync({ jobId: 'job-777', mockChannelSpy })
    );

    expect(mockChannelSpy.unsubscribe).not.toHaveBeenCalled();

    // Unmount component
    unmount();

    // Assert cleanup occurred
    expect(mockChannelSpy.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
