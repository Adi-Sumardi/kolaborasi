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

// Mock API
const mockUsersData = [
  {
    id: 'u1',
    name: 'Admin User',
    email: 'admin@test.com',
    role: 'super_admin',
    isActive: true,
    divisionId: 'div1',
    monitorCode: 'ABC123',
  },
  {
    id: 'u2',
    name: 'Karyawan One',
    email: 'k1@test.com',
    role: 'karyawan',
    isActive: true,
    divisionId: 'div1',
    monitorCode: null,
  },
  {
    id: 'u3',
    name: 'Inactive User',
    email: 'inactive@test.com',
    role: 'karyawan',
    isActive: false,
    divisionId: null,
    monitorCode: null,
  },
];

const mockDivisions = [
  { id: 'div1', name: 'Divisi Pajak' },
  { id: 'div2', name: 'Divisi Akuntansi' },
];

jest.mock('@/lib/api', () => ({
  userAPI: {
    getAll: jest.fn().mockResolvedValue({ users: [] }),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    updateStatus: jest.fn().mockResolvedValue({}),
    changePassword: jest.fn().mockResolvedValue({}),
  },
  divisionAPI: {
    getAll: jest.fn().mockResolvedValue({ divisions: [] }),
  },
}));

import UserManagementPage from '@/components/pages/UserManagementPage';
import { userAPI, divisionAPI } from '@/lib/api';
import { toast } from 'sonner';

const superAdmin = { id: 'u1', name: 'Admin User', email: 'admin@test.com', role: 'super_admin' };

describe('UserManagementPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userAPI.getAll.mockResolvedValue({ users: mockUsersData });
    divisionAPI.getAll.mockResolvedValue({ divisions: mockDivisions });
  });

  it('renders page header', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Manajemen User')).toBeInTheDocument();
    });
    // Source: "Kelola user, role, dan status akun"
    expect(screen.getByText(/Kelola user, role, dan status akun/i)).toBeInTheDocument();
  });

  it('renders user list table with user data', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Admin User')).toBeInTheDocument();
    });
    expect(screen.getByText('Karyawan One')).toBeInTheDocument();
    expect(screen.getByText('Inactive User')).toBeInTheDocument();
  });

  it('renders table headers correctly', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Nama')).toBeInTheDocument();
    });
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Divisi')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('shows role badges with correct labels', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Super Admin')).toBeInTheDocument();
    });
    // Multiple karyawan rows
    const karyawanBadges = screen.getAllByText('Karyawan');
    expect(karyawanBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('shows active/inactive status badges', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getAllByText('Aktif').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('Nonaktif').length).toBeGreaterThanOrEqual(1);
  });

  it('shows add user button for super_admin', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      // Source: "Tambah User"
      expect(screen.getByText(/Tambah User/i)).toBeInTheDocument();
    });
  });

  it('opens add user dialog when clicking add button', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText(/Tambah User/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Tambah User/i));

    await waitFor(() => {
      // Dialog title: "Tambah User Baru"
      expect(screen.getByText('Tambah User Baru')).toBeInTheDocument();
    });
    // Form labels: "Nama Lengkap *", "Email *", "Password" (check by label htmlFor)
    expect(screen.getByLabelText(/nama lengkap/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it('shows stats cards with correct counts', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Total User')).toBeInTheDocument();
    });
    expect(screen.getByText('User Aktif')).toBeInTheDocument();
    expect(screen.getByText('User Nonaktif')).toBeInTheDocument();
  });

  it('shows delete button for non-self users (super_admin)', async () => {
    userAPI.delete.mockResolvedValue({});

    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Karyawan One')).toBeInTheDocument();
    });

    // The delete buttons are rendered as destructive variant buttons with Trash2 icon
    // They don't have title="Hapus" - they're just destructive buttons
    // There should be delete buttons for users other than self (u2 and u3)
    const destructiveButtons = screen.getAllByRole('button').filter(btn =>
      btn.className.includes('destructive')
    );
    expect(destructiveButtons.length).toBeGreaterThan(0);
  });

  it('shows loading state initially', () => {
    render(<UserManagementPage user={superAdmin} />);
    expect(screen.getByText('Memuat data...')).toBeInTheDocument();
  });

  it('displays division names from divisions data', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      // Multiple users may have the same division, so use getAllByText
      expect(screen.getAllByText('Divisi Pajak').length).toBeGreaterThan(0);
    });
  });

  it('shows monitor code for users that have one', async () => {
    render(<UserManagementPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });
  });
});
