import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
  initSocket: jest.fn(() => mockSocketInstance),
}));

// Mock API (getToken)
jest.mock('@/lib/api', () => ({
  getToken: jest.fn(() => 'mock-token'),
}));

// Mock fetch for loading employees
const mockEmployees = [
  { id: 'emp1', name: 'Karyawan A', email: 'a@test.com', role: 'karyawan', monitorCode: 'MON001' },
  { id: 'emp2', name: 'Karyawan B', email: 'b@test.com', role: 'karyawan', monitorCode: 'MON002' },
  { id: 'emp3', name: 'SDM User', email: 'sdm@test.com', role: 'sdm', monitorCode: 'MON003' },
];

import ScreenMonitorPage from '@/components/pages/ScreenMonitorPage';

const superAdmin = { id: 'admin1', name: 'Super Admin', email: 'admin@test.com', role: 'super_admin' };

describe('ScreenMonitorPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock fetch to return employees
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ users: mockEmployees }),
    });

    // Reset socket mock handlers
    mockSocketInstance.on.mockImplementation((event, callback) => {
      if (event === 'connect') {
        // Simulate immediate connect
        callback();
      }
      if (event === 'activity:all-data') {
        // Simulate activity data
        callback({
          emp1: { status: 'online', page: 'home', pageLabel: 'Dashboard', onlineSince: new Date().toISOString(), agentConnected: true },
          emp2: { status: 'offline', page: null, pageLabel: null },
        });
      }
    });
  });

  it('renders page header', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    expect(screen.getByText('Monitor Karyawan')).toBeInTheDocument();
    // Source: "Pantau aktivitas karyawan secara real-time"
    expect(screen.getByText(/Pantau aktivitas karyawan/i)).toBeInTheDocument();
  });

  it('renders employee list after loading', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Karyawan A')).toBeInTheDocument();
    });
    expect(screen.getByText('Karyawan B')).toBeInTheDocument();
    expect(screen.getByText('SDM User')).toBeInTheDocument();
  });

  it('shows employee count in card title', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    await waitFor(() => {
      // Source: "Daftar Karyawan ({count})"
      expect(screen.getByText(/Daftar Karyawan/)).toBeInTheDocument();
    });
  });

  it('shows online/offline status badges', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Karyawan A')).toBeInTheDocument();
    });

    // Status badges - "Online" and "Offline" labels
    const onlineElements = screen.getAllByText('Online');
    expect(onlineElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows placeholder when no employee is selected', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    await waitFor(() => {
      // Source: "Pilih karyawan untuk melihat detail"
      expect(screen.getByText(/pilih karyawan untuk melihat detail/i)).toBeInTheDocument();
    });
  });

  it('shows employee detail when employee is clicked', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Karyawan A')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Karyawan A'));

    await waitFor(() => {
      // Should show the "Lihat Layar" button
      expect(screen.getByText(/Lihat Layar/i)).toBeInTheDocument();
    });
  });

  it('shows desktop agent status for connected employees', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Karyawan A')).toBeInTheDocument();
    });

    // Karyawan A has agentConnected: true -> shows "Desktop Agent aktif"
    expect(screen.getAllByText(/Desktop Agent/i).length).toBeGreaterThanOrEqual(1);
  });

  it('emits agent:watch when watch button is clicked for agent-connected employee', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Karyawan A')).toBeInTheDocument();
    });

    // Select employee
    fireEvent.click(screen.getByText('Karyawan A'));

    await waitFor(() => {
      expect(screen.getByText(/Lihat Layar/i)).toBeInTheDocument();
    });

    // Click watch button
    fireEvent.click(screen.getByText(/Lihat Layar/i));

    // Should emit agent:watch since employee has agentConnected
    expect(mockSocketInstance.emit).toHaveBeenCalledWith('agent:watch', expect.objectContaining({
      targetUserId: 'emp1',
    }));
  });

  it('joins monitor room on socket connect', () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    expect(mockSocketInstance.emit).toHaveBeenCalledWith('activity:join-monitor');
    expect(mockSocketInstance.emit).toHaveBeenCalledWith('activity:request-all');
  });

  it('shows status summary badges', async () => {
    render(<ScreenMonitorPage user={superAdmin} />);

    await waitFor(() => {
      // The header has Online count badge (e.g., "1 Online") and Idle count badge (e.g., "0 Idle")
      expect(screen.getByText(/\d+ Online/)).toBeInTheDocument();
      expect(screen.getByText(/\d+ Idle/)).toBeInTheDocument();
    });
  });
});
