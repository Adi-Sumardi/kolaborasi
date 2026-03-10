import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';

// Mock sonner
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock socket-client
const mockSocketInstance = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connected: true,
};
jest.mock('@/lib/socket-client', () => ({
  getSocket: jest.fn(() => mockSocketInstance),
  initSocket: jest.fn(() => mockSocketInstance),
}));

import ActivityTracker from '@/components/ActivityTracker';

describe('ActivityTracker', () => {
  const karyawanUser = { id: 'user1', name: 'Karyawan', role: 'karyawan' };
  const sdmUser = { id: 'user2', name: 'SDM Staff', role: 'sdm' };
  const adminUser = { id: 'admin1', name: 'Admin', role: 'super_admin' };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing for non-karyawan/sdm roles', () => {
    const { container } = render(
      <ActivityTracker
        user={adminUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={true}
        workStartTime={Date.now()}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when not working', () => {
    const { container } = render(
      <ActivityTracker
        user={karyawanUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={false}
        workStartTime={null}
      />
    );

    expect(container.innerHTML).toBe('');
  });

  it('renders working indicator when karyawan is working', () => {
    render(
      <ActivityTracker
        user={karyawanUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={true}
        workStartTime={Date.now()}
      />
    );

    expect(screen.getByText('Sedang Bekerja')).toBeInTheDocument();
  });

  it('renders working indicator for sdm role when working', () => {
    render(
      <ActivityTracker
        user={sdmUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={true}
        workStartTime={Date.now()}
      />
    );

    expect(screen.getByText('Sedang Bekerja')).toBeInTheDocument();
  });

  it('sets up socket listeners for karyawan role', () => {
    render(
      <ActivityTracker
        user={karyawanUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={false}
        workStartTime={null}
      />
    );

    // Should register monitor:offer listener
    expect(mockSocketInstance.on).toHaveBeenCalledWith('monitor:offer', expect.any(Function));
  });

  it('emits activity:page-change when page changes', () => {
    const { rerender } = render(
      <ActivityTracker
        user={karyawanUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={false}
        workStartTime={null}
      />
    );

    // Change page
    rerender(
      <ActivityTracker
        user={karyawanUser}
        currentPage="jobdesk"
        pageLabel="Jobdesk"
        isWorking={false}
        workStartTime={null}
      />
    );

    expect(mockSocketInstance.emit).toHaveBeenCalledWith('activity:page-change', {
      userId: 'user1',
      page: 'jobdesk',
      pageLabel: 'Jobdesk',
    });
  });

  it('sets up idle detection event listeners', () => {
    const addEventListenerSpy = jest.spyOn(document, 'addEventListener');

    render(
      <ActivityTracker
        user={karyawanUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={false}
        workStartTime={null}
      />
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(addEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));

    addEventListenerSpy.mockRestore();
  });

  it('cleans up event listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');

    const { unmount } = render(
      <ActivityTracker
        user={karyawanUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={false}
        workStartTime={null}
      />
    );

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
    expect(removeEventListenerSpy).toHaveBeenCalledWith('click', expect.any(Function));

    removeEventListenerSpy.mockRestore();
  });

  it('shows elapsed time when working', () => {
    const startTime = Date.now() - 3661000; // 1 hour, 1 minute, 1 second ago

    render(
      <ActivityTracker
        user={karyawanUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={true}
        workStartTime={startTime}
      />
    );

    // Advance timer to trigger the interval
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Format: "${h}j ${m}m ${s}d" when h>0, else "${m}m ${s}d"
    // For 1h 1m 1s: "1j 1m 1d"
    expect(screen.getByText(/\d+j \d+m \d+d/)).toBeInTheDocument();
  });

  it('emits activity:idle after timeout period', () => {
    render(
      <ActivityTracker
        user={karyawanUser}
        currentPage="home"
        pageLabel="Dashboard"
        isWorking={false}
        workStartTime={null}
      />
    );

    // Advance past idle timeout (2 minutes)
    act(() => {
      jest.advanceTimersByTime(2 * 60 * 1000 + 100);
    });

    expect(mockSocketInstance.emit).toHaveBeenCalledWith('activity:idle', { userId: 'user1' });
  });
});
