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
const mockJobdesks = [
  {
    id: '1',
    title: 'PPh 21 - PT ABC',
    description: 'Lapor pajak PPh 21',
    status: 'pending',
    assignedTo: ['user1'],
    dueDate: '2026-04-05',
    progress: null,
    taskTypes: ['pph_21'],
    clientName: 'PT ABC',
  },
  {
    id: '2',
    title: 'PPN - CV XYZ',
    description: 'Lapor PPN bulanan',
    status: 'in_progress',
    assignedTo: ['user1', 'user2'],
    dueDate: '2026-04-05',
    progress: null,
    taskTypes: ['ppn'],
    clientName: 'CV XYZ',
  },
  {
    id: '3',
    title: 'PPh Badan - PT DEF',
    description: 'SPT Tahunan Badan',
    status: 'completed',
    assignedTo: ['user2'],
    dueDate: '2026-03-31',
    progress: null,
    taskTypes: ['pph_badan'],
    clientName: 'PT DEF',
  },
];

const mockUsers = [
  { id: 'user1', name: 'Karyawan Satu', email: 'k1@test.com', role: 'karyawan', isActive: true },
  { id: 'user2', name: 'Karyawan Dua', email: 'k2@test.com', role: 'karyawan', isActive: true },
];

jest.mock('@/lib/api', () => ({
  jobdeskAPI: {
    getAll: jest.fn().mockResolvedValue({ jobdesks: [] }),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    updateStatus: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
    getById: jest.fn().mockResolvedValue({ jobdesk: {} }),
    getSubmissions: jest.fn().mockResolvedValue({ submissions: [] }),
    createSubmission: jest.fn().mockResolvedValue({}),
    deleteSubmission: jest.fn().mockResolvedValue({}),
    uploadSubmissionFile: jest.fn().mockResolvedValue({}),
  },
  userAPI: {
    getList: jest.fn().mockResolvedValue({ users: [] }),
  },
  dailyLogAPI: {
    create: jest.fn().mockResolvedValue({}),
  },
  divisionAPI: {
    getAll: jest.fn().mockResolvedValue({ divisions: [] }),
  },
  clientAPI: {
    getAll: jest.fn().mockResolvedValue({ clients: [] }),
  },
}));

import JobdeskPage from '@/components/pages/JobdeskPage';
import { jobdeskAPI, userAPI, clientAPI } from '@/lib/api';

describe('JobdeskPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jobdeskAPI.getAll.mockResolvedValue({ jobdesks: mockJobdesks });
    userAPI.getList.mockResolvedValue({ users: mockUsers });
    clientAPI.getAll.mockResolvedValue({ clients: [] });
  });

  const superAdmin = { id: 'admin1', name: 'Super Admin', email: 'admin@test.com', role: 'super_admin' };
  const karyawan = { id: 'user1', name: 'Karyawan Satu', email: 'k1@test.com', role: 'karyawan' };

  it('renders jobdesk page header', async () => {
    render(<JobdeskPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('Jobdesk')).toBeInTheDocument();
    });
    // Source: "Kelola tugas dan pekerjaan"
    expect(screen.getByText(/Kelola tugas dan pekerjaan/i)).toBeInTheDocument();
  });

  it('renders jobdesk list after loading', async () => {
    render(<JobdeskPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('PPh 21 - PT ABC')).toBeInTheDocument();
    });
    expect(screen.getByText('PPN - CV XYZ')).toBeInTheDocument();
    expect(screen.getByText('PPh Badan - PT DEF')).toBeInTheDocument();
  });

  it('shows create jobdesk button for admin', async () => {
    render(<JobdeskPage user={superAdmin} />);

    await waitFor(() => {
      // Admin sees "Tambah Jobdesk"
      expect(screen.getByText(/Tambah Jobdesk/i)).toBeInTheDocument();
    });
  });

  it('shows "Tambah Jobdesk Saya" for karyawan role', async () => {
    render(<JobdeskPage user={karyawan} />);

    await waitFor(() => {
      expect(screen.getByText(/Tambah Jobdesk Saya/i)).toBeInTheDocument();
    });
  });

  it('displays status badges correctly for different statuses', async () => {
    render(<JobdeskPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText('PPh 21 - PT ABC')).toBeInTheDocument();
    });

    // Status badges rendered as spans:
    // pending -> "Pending", in_progress -> "Dalam Proses", completed -> "Selesai"
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Dalam Proses')).toBeInTheDocument();
    expect(screen.getByText('Selesai')).toBeInTheDocument();
  });

  it('shows loading state initially', () => {
    render(<JobdeskPage user={superAdmin} />);
    expect(screen.getByText('Memuat data...')).toBeInTheDocument();
  });

  it('opens create modal when clicking create button', async () => {
    render(<JobdeskPage user={superAdmin} />);

    await waitFor(() => {
      expect(screen.getByText(/Tambah Jobdesk/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Tambah Jobdesk/i));

    await waitFor(() => {
      // The dialog title is "Tambah Jobdesk Baru"
      expect(screen.getByText(/Tambah Jobdesk Baru/i)).toBeInTheDocument();
    });
  });

  it('calls jobdeskAPI.getAll on mount', async () => {
    render(<JobdeskPage user={superAdmin} />);

    await waitFor(() => {
      expect(jobdeskAPI.getAll).toHaveBeenCalled();
    });
  });
});
