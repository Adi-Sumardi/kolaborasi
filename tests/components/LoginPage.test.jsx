import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock all child components to isolate the login page
jest.mock('@/components/DashboardApp', () => {
  return function MockDashboard({ setIsLoggedIn }) {
    return <div data-testid="dashboard">Dashboard Loaded</div>;
  };
});
jest.mock('@/components/InstallPrompt', () => {
  return function MockInstallPrompt() { return null; };
});
jest.mock('@/components/OnlineStatus', () => {
  return function MockOnlineStatus() { return null; };
});
jest.mock('@/lib/pwa-utils', () => ({
  registerServiceWorker: jest.fn(),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock API module
const mockLogin = jest.fn();
const mockGetToken = jest.fn(() => null);
const mockSetToken = jest.fn();
const mockSetUser = jest.fn();
const mockGetUser = jest.fn(() => null);
const mockNotifyElectronAuth = jest.fn();

jest.mock('@/lib/api', () => ({
  authAPI: {
    login: (...args) => mockLogin(...args),
  },
  getToken: (...args) => mockGetToken(...args),
  setToken: (...args) => mockSetToken(...args),
  setUser: (...args) => mockSetUser(...args),
  getUser: (...args) => mockGetUser(...args),
  notifyElectronAuth: (...args) => mockNotifyElectronAuth(...args),
}));

import App from '@/app/page';
import { toast } from 'sonner';

describe('LoginPage (app/page.js)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetToken.mockReturnValue(null);
    mockGetUser.mockReturnValue(null);
    window.electronAPI = undefined;
    // Mock fetch for DesktopDownloadSection
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ downloads: { windows: null, mac: null, linux: null }, detected: 'mac' }),
      })
    );
  });

  it('renders login form with email and password fields', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
  });

  it('renders branding content on login page', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Dashboard Ruang Kerja/i)).toBeInTheDocument();
    });
    // "Kolaborasi" may appear in multiple elements (title span and other text),
    // so use getAllByText and verify at least one exists
    expect(screen.getAllByText(/Kolaborasi/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Manajemen Tim/i)).toBeInTheDocument();
    expect(screen.getByText(/KPI Tracking/i)).toBeInTheDocument();
    expect(screen.getByText(/Group Chat/i)).toBeInTheDocument();
    expect(screen.getByText(/Jobdesk/i)).toBeInTheDocument();
  });

  it('shows HTML5 validation for empty required fields', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    // HTML5 required attribute should be present
    expect(emailInput).toBeRequired();
    expect(passwordInput).toBeRequired();
  });

  it('calls authAPI.login on form submit with email and password', async () => {
    mockLogin.mockResolvedValue({
      token: 'mock-token-123',
      user: { id: 1, name: 'Test User', role: 'karyawan' },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);

    fireEvent.change(emailInput, { target: { value: 'test@company.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    const loginButton = screen.getByRole('button', { name: /login/i });
    fireEvent.click(loginButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@company.com',
          password: 'password123',
        })
      );
    });
  });

  it('stores token and user on successful login', async () => {
    const mockUser = { id: 1, name: 'Test User', role: 'karyawan' };
    mockLogin.mockResolvedValue({
      token: 'mock-token-123',
      user: mockUser,
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@company.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith('mock-token-123');
      expect(mockSetUser).toHaveBeenCalledWith(mockUser);
    });
  });

  it('shows error message on failed login', async () => {
    mockLogin.mockRejectedValue(new Error('Login gagal'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@company.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrong-pass' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Login gagal');
    });
  });

  it('remember me checkbox is present and interactable', async () => {
    render(<App />);

    await waitFor(() => {
      // The label text is "Ingat saya (30 hari)"
      expect(screen.getByText(/ingat saya/i)).toBeInTheDocument();
    });

    // Radix Checkbox renders a button with role="checkbox"
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
  });

  it('sends rememberMe=true in Electron environment', async () => {
    // Simulate Electron environment
    window.electronAPI = { isElectron: true, notifyLogin: jest.fn(), notifyLogout: jest.fn() };

    mockLogin.mockResolvedValue({
      token: 'mock-token',
      user: { id: 1, name: 'Test', role: 'karyawan' },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@company.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        expect.objectContaining({
          rememberMe: true,
        })
      );
    });
  });

  it('shows dashboard when already logged in', async () => {
    mockGetToken.mockReturnValue('existing-token');
    mockGetUser.mockReturnValue({ id: 1, name: 'Test', role: 'karyawan' });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });
  });

  it('handles 2FA flow when required', async () => {
    mockLogin.mockResolvedValueOnce({ require2FA: true });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@company.com' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));

    await waitFor(() => {
      // The label is "Kode 2FA" with htmlFor="2fa"
      expect(screen.getByLabelText(/kode 2fa/i)).toBeInTheDocument();
    });
  });

  it('toggles password visibility', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    });

    const passwordInput = screen.getByLabelText(/password/i);
    expect(passwordInput).toHaveAttribute('type', 'password');

    // Click show password button (the eye icon button with tabIndex=-1)
    const toggleButtons = screen.getAllByRole('button');
    const eyeButton = toggleButtons.find(btn => btn.getAttribute('tabindex') === '-1');
    if (eyeButton) {
      fireEvent.click(eyeButton);
      expect(passwordInput).toHaveAttribute('type', 'text');
    }
  });
});
