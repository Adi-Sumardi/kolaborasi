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
  disconnectSocket: jest.fn(),
}));

// Mock API
const mockGetUser = jest.fn();
const mockRemoveToken = jest.fn();
const mockRemoveUser = jest.fn();
const mockGetMe = jest.fn();
jest.mock('@/lib/api', () => ({
  getUser: (...args) => mockGetUser(...args),
  removeToken: (...args) => mockRemoveToken(...args),
  removeUser: (...args) => mockRemoveUser(...args),
  authAPI: {
    getMe: (...args) => mockGetMe(...args),
  },
  jobdeskAPI: {
    getAll: jest.fn().mockResolvedValue({ jobdesks: [{ id: 1 }] }),
  },
  notificationAPI: {
    getAll: jest.fn().mockResolvedValue({ notifications: [] }),
    markAsRead: jest.fn().mockResolvedValue({}),
  },
}));

// Mock all page components
jest.mock('@/components/pages/DashboardHome', () => {
  return function MockDashboardHome() { return <div data-testid="page-home">Home</div>; };
});
jest.mock('@/components/pages/KaryawanDashboard', () => {
  return function MockKaryawanDashboard() { return <div data-testid="page-karyawan-home">Karyawan Home</div>; };
});
jest.mock('@/components/pages/JobdeskPage', () => {
  return function MockJobdeskPage() { return <div data-testid="page-jobdesk">Jobdesk</div>; };
});
jest.mock('@/components/pages/DivisionPage', () => {
  return function MockDivisionPage() { return <div data-testid="page-divisions">Divisions</div>; };
});
jest.mock('@/components/pages/ChatPage', () => {
  return function MockChatPage() { return <div data-testid="page-chat">Chat</div>; };
});
jest.mock('@/components/pages/TodoPageKanban', () => {
  return function MockTodoPage() { return <div data-testid="page-todo">Todo</div>; };
});
jest.mock('@/components/pages/SettingsPage', () => {
  return function MockSettingsPage() { return <div data-testid="page-settings">Settings</div>; };
});
jest.mock('@/components/pages/UserManagementPage', () => {
  return function MockUserPage() { return <div data-testid="page-users">Users</div>; };
});
jest.mock('@/components/pages/EmployeeWarningPage', () => {
  return function MockWarningPage() { return <div data-testid="page-warnings">Warnings</div>; };
});
jest.mock('@/components/pages/KPIPageV2', () => {
  return function MockKPIPage() { return <div data-testid="page-kpi">KPI</div>; };
});
jest.mock('@/components/pages/WarningLettersPage', () => {
  return function MockWarningLettersPage() { return <div data-testid="page-warning-letters">Warning Letters</div>; };
});
jest.mock('@/components/pages/SP2DKPage', () => {
  return function MockSP2DKPage() { return <div data-testid="page-sp2dk">SP2DK</div>; };
});
jest.mock('@/components/pages/ScreenMonitorPage', () => {
  return function MockScreenMonitorPage() { return <div data-testid="page-monitor">Monitor</div>; };
});
jest.mock('@/components/ActivityTracker', () => {
  return function MockActivityTracker() { return null; };
});
jest.mock('@/components/WelcomeWorkModal', () => {
  return function MockWelcomeWorkModal() { return null; };
});

// Mock Radix DropdownMenu so content renders directly in the DOM
jest.mock('@/components/ui/dropdown-menu', () => {
  const React = require('react');
  return {
    DropdownMenu: ({ children, ...props }) => React.createElement('div', { 'data-testid': 'dropdown-menu', ...props }, children),
    DropdownMenuTrigger: ({ children, asChild, ...props }) => {
      if (asChild) return children;
      return React.createElement('div', props, children);
    },
    DropdownMenuContent: ({ children, ...props }) => React.createElement('div', { 'data-testid': 'dropdown-content', ...props }, children),
    DropdownMenuItem: ({ children, onClick, ...props }) => React.createElement('div', { onClick, role: 'menuitem', ...props }, children),
    DropdownMenuLabel: ({ children, ...props }) => React.createElement('div', props, children),
    DropdownMenuSeparator: () => React.createElement('hr'),
  };
});

import DashboardApp from '@/components/DashboardApp';
import { toast } from 'sonner';

const renderDashboard = (userOverride = {}) => {
  const defaultUser = { id: 1, name: 'Test Admin', email: 'admin@test.com', role: 'super_admin' };
  const user = { ...defaultUser, ...userOverride };
  mockGetUser.mockReturnValue(user);
  // Make getMe return the same user so it doesn't override the role
  mockGetMe.mockResolvedValue(user);

  const setIsLoggedIn = jest.fn();
  const result = render(<DashboardApp setIsLoggedIn={setIsLoggedIn} />);
  return { ...result, setIsLoggedIn, user };
};

describe('DashboardApp', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the workspace header', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });
  });

  it('renders navigation menu items for super_admin', async () => {
    renderDashboard({ role: 'super_admin' });

    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });

    // super_admin should see Monitor and User menu items
    // Nav items render label text in spans (some hidden with CSS but still in DOM)
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jobdesk').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Monitor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
  });

  it('does not show Monitor menu for karyawan role', async () => {
    renderDashboard({ role: 'karyawan' });

    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });

    // Monitor should not be visible for karyawan
    const monitorElements = screen.queryAllByText('Monitor');
    const monitorButtons = monitorElements.filter(el => {
      const button = el.closest('button');
      return button !== null;
    });
    expect(monitorButtons.length).toBe(0);
  });

  it('does not show User menu for karyawan role', async () => {
    renderDashboard({ role: 'karyawan' });

    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });

    // User management button should not exist for karyawan
    const userButtons = screen.queryAllByText('User').filter(el => {
      const button = el.closest('button');
      return button !== null;
    });
    expect(userButtons.length).toBe(0);
  });

  it('renders home page by default', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('page-home')).toBeInTheDocument();
    });
  });

  it('renders karyawan dashboard for karyawan role', async () => {
    renderDashboard({ role: 'karyawan' });

    await waitFor(() => {
      expect(screen.getByTestId('page-karyawan-home')).toBeInTheDocument();
    });
  });

  it('logout button calls removeToken and removeUser', async () => {
    const { setIsLoggedIn } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });

    // With mocked DropdownMenu, content is always rendered
    // Find the Logout menu item directly
    const logoutEl = screen.getByText('Logout');
    fireEvent.click(logoutEl);

    expect(mockRemoveToken).toHaveBeenCalled();
    expect(mockRemoveUser).toHaveBeenCalled();
    expect(setIsLoggedIn).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith('Logout berhasil');
  });

  it('displays user name and role in sidebar', async () => {
    renderDashboard({ name: 'John Doe', role: 'super_admin' });

    await waitFor(() => {
      // User name may appear multiple times (in trigger button and dropdown content)
      expect(screen.getAllByText('John Doe').length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText('Super Admin').length).toBeGreaterThan(0);
  });

  it('shows mobile menu button on small screens', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });

    // The mobile menu button has the md:hidden class
    const buttons = screen.getAllByRole('button');
    const mobileMenuBtn = buttons.find(btn => btn.className.includes('md:hidden'));
    expect(mobileMenuBtn).toBeDefined();
  });

  it('navigates to jobdesk page when clicking Jobdesk menu', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('page-home')).toBeInTheDocument();
    });

    // Find the Jobdesk navigation button in the desktop nav
    const jobdeskButtons = screen.getAllByText('Jobdesk');
    // Click the first one (desktop nav)
    const navButton = jobdeskButtons.find(el => el.closest('button'));
    if (navButton) {
      fireEvent.click(navButton.closest('button'));
    }

    await waitFor(() => {
      expect(screen.getByTestId('page-jobdesk')).toBeInTheDocument();
    });
  });

  it('shows user email in user dropdown menu', async () => {
    renderDashboard({ email: 'admin@test.com' });

    await waitFor(() => {
      expect(screen.getByText('Workspace')).toBeInTheDocument();
    });

    // With mocked DropdownMenu, content is always rendered
    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    });
  });
});
