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
const mockAttachments = [
  {
    id: 'att1',
    type: 'file',
    fileName: 'laporan.pdf',
    fileType: 'application/pdf',
    fileSize: 1048576,
    url: 'https://example.com/laporan.pdf',
    userId: 'user1',
    uploaderName: 'Karyawan Satu',
    createdAt: '2026-03-09T10:00:00Z',
  },
  {
    id: 'att2',
    type: 'file',
    fileName: 'foto.jpg',
    fileType: 'image/jpeg',
    fileSize: 512000,
    url: 'https://example.com/foto.jpg',
    userId: 'user1',
    uploaderName: 'Karyawan Satu',
    createdAt: '2026-03-09T11:00:00Z',
  },
  {
    id: 'att3',
    type: 'link',
    url: 'https://drive.google.com/file/12345',
    userId: 'user2',
    uploaderName: 'Admin',
    createdAt: '2026-03-09T12:00:00Z',
  },
  {
    id: 'att4',
    type: 'file',
    fileName: 'data.xlsx',
    fileType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileSize: 204800,
    url: 'https://example.com/data.xlsx',
    userId: 'user1',
    uploaderName: 'Karyawan Satu',
    createdAt: '2026-03-09T13:00:00Z',
  },
];

jest.mock('@/lib/api', () => ({
  attachmentAPI: {
    getAll: jest.fn().mockResolvedValue({ attachments: [] }),
    createFile: jest.fn().mockResolvedValue({}),
    createLink: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
}));

import AttachmentSection from '@/components/AttachmentSection';
import { attachmentAPI } from '@/lib/api';
import { toast } from 'sonner';

const jobdesk = { id: 'job1', assignedTo: ['user1'] };
const assignedUser = { id: 'user1', name: 'Karyawan Satu', role: 'karyawan' };
const adminUser = { id: 'admin1', name: 'Super Admin', role: 'super_admin' };
const unassignedUser = { id: 'user3', name: 'Other User', role: 'karyawan' };

describe('AttachmentSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    attachmentAPI.getAll.mockResolvedValue({ attachments: mockAttachments });
  });

  it('renders attachment list with file names', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText('laporan.pdf')).toBeInTheDocument();
    });
    expect(screen.getByText('foto.jpg')).toBeInTheDocument();
    expect(screen.getByText('data.xlsx')).toBeInTheDocument();
  });

  it('renders attachment count badge', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('renders header with "Lampiran" title', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText('Lampiran')).toBeInTheDocument();
    });
  });

  it('shows upload file button for assigned users', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText(/Upload File/i)).toBeInTheDocument();
    });
  });

  it('shows add link button for assigned users', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText(/Tambah Link/i)).toBeInTheDocument();
    });
  });

  it('does not show upload buttons for unassigned users', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={unassignedUser} />);

    await waitFor(() => {
      expect(screen.getByText('Lampiran')).toBeInTheDocument();
    });

    expect(screen.queryByText(/Upload File/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tambah Link/i)).not.toBeInTheDocument();
  });

  it('shows delete button for own attachments', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText('laporan.pdf')).toBeInTheDocument();
    });

    // Attachments owned by user1 (att1, att2, att4) should have delete buttons
    // Source uses title="Hapus" on the delete Button
    const deleteButtons = screen.getAllByTitle('Hapus');
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it('super_admin can delete any attachment', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={adminUser} />);

    await waitFor(() => {
      expect(screen.getByText('laporan.pdf')).toBeInTheDocument();
    });

    // Admin should see delete buttons for all attachments
    const deleteButtons = screen.getAllByTitle('Hapus');
    expect(deleteButtons.length).toBe(4);
  });

  it('shows link preview for link attachments', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText('laporan.pdf')).toBeInTheDocument();
    });

    // Link attachment with drive.google.com shows "Google Drive" in link preview
    // The full text is "💾 Google Drive"
    expect(screen.getByText(/Google Drive/)).toBeInTheDocument();
  });

  it('displays file sizes correctly', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      // 1048576 bytes = 1 MB
      expect(screen.getByText('1 MB')).toBeInTheDocument();
    });
  });

  it('shows empty state when no attachments', async () => {
    attachmentAPI.getAll.mockResolvedValue({ attachments: [] });

    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText(/belum ada lampiran/i)).toBeInTheDocument();
    });
  });

  it('calls attachmentAPI.delete when confirming deletion', async () => {
    attachmentAPI.delete.mockResolvedValue({});

    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText('laporan.pdf')).toBeInTheDocument();
    });

    // Click first delete button
    const deleteButtons = screen.getAllByTitle('Hapus');
    fireEvent.click(deleteButtons[0]);

    // Should show confirmation dialog
    await waitFor(() => {
      expect(screen.getByText('Hapus Lampiran?')).toBeInTheDocument();
    });

    // Confirm deletion - AlertDialogAction has text "Hapus"
    // Find buttons that contain the text "Hapus" within the dialog
    const allHapusButtons = screen.getAllByRole('button', { name: /hapus/i });
    // The dialog action button is the one inside the AlertDialog, not the icon-only delete buttons
    // The AlertDialogAction text content is "Hapus", the delete buttons have title="Hapus" but are icon-only
    const confirmButton = allHapusButtons.find(btn => btn.textContent.trim() === 'Hapus');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(attachmentAPI.delete).toHaveBeenCalled();
    });
  });

  it('shows loading state initially', () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);
    // Source: "Memuat lampiran..."
    expect(screen.getByText(/memuat lampiran/i)).toBeInTheDocument();
  });

  it('shows view button for each attachment', async () => {
    render(<AttachmentSection jobdesk={jobdesk} user={assignedUser} />);

    await waitFor(() => {
      expect(screen.getByText('laporan.pdf')).toBeInTheDocument();
    });

    // Source uses title="Lihat" on view buttons
    const viewButtons = screen.getAllByTitle('Lihat');
    expect(viewButtons.length).toBe(4);
  });
});
