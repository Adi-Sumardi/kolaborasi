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
const mockRooms = [
  {
    id: 'room1',
    name: 'Tim Marketing',
    members: ['user1', 'user2', 'user3'],
    lastMessage: { content: 'Hello!', createdAt: '2026-03-09T10:00:00Z' },
    createdAt: '2026-03-01T00:00:00Z',
  },
  {
    id: 'room2',
    name: 'Diskusi Project A',
    members: ['user1', 'user2'],
    lastMessage: null,
    createdAt: '2026-03-05T00:00:00Z',
  },
];

const mockMessages = [
  {
    id: 'msg1',
    roomId: 'room1',
    userId: 'user2',
    userEmail: 'other@test.com',
    content: 'Halo semua!',
    createdAt: '2026-03-09T10:00:00Z',
  },
  {
    id: 'msg2',
    roomId: 'room1',
    userId: 'user1',
    userEmail: 'test@test.com',
    content: 'Halo juga!',
    createdAt: '2026-03-09T10:01:00Z',
  },
];

const mockUsers = [
  { id: 'user1', name: 'Current User', email: 'test@test.com' },
  { id: 'user2', name: 'Other User', email: 'other@test.com' },
  { id: 'user3', name: 'Third User', email: 'third@test.com' },
];

jest.mock('@/lib/api', () => ({
  chatAPI: {
    getRooms: jest.fn().mockResolvedValue({ rooms: [] }),
    getMessages: jest.fn().mockResolvedValue({ messages: [] }),
    createRoom: jest.fn().mockResolvedValue({}),
    updateRoom: jest.fn().mockResolvedValue({}),
    sendMessage: jest.fn().mockResolvedValue({ data: { id: 'new-msg' } }),
  },
  userAPI: {
    getList: jest.fn().mockResolvedValue({ users: [] }),
  },
}));

// Mock scrollIntoView which jsdom doesn't support
Element.prototype.scrollIntoView = jest.fn();

import ChatPage from '@/components/pages/ChatPage';
import { chatAPI, userAPI } from '@/lib/api';

const mockSocket = {
  on: jest.fn(),
  off: jest.fn(),
  emit: jest.fn(),
  connected: true,
};

const currentUser = { id: 'user1', name: 'Current User', email: 'test@test.com', role: 'super_admin' };

describe('ChatPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatAPI.getRooms.mockResolvedValue({ rooms: mockRooms });
    chatAPI.getMessages.mockResolvedValue({ messages: mockMessages });
    userAPI.getList.mockResolvedValue({ users: mockUsers });
  });

  it('renders chat page header', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      expect(screen.getByText('Group Chat')).toBeInTheDocument();
    });
    // Source subtitle: "Komunikasi dengan tim Anda secara real-time"
    expect(screen.getByText(/komunikasi dengan tim/i)).toBeInTheDocument();
  });

  it('renders chat rooms list', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      expect(screen.getByText('Tim Marketing')).toBeInTheDocument();
    });
    expect(screen.getByText('Diskusi Project A')).toBeInTheDocument();
  });

  it('shows room list card with title', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      expect(screen.getByText('Ruang Chat')).toBeInTheDocument();
    });
  });

  it('shows placeholder when no room selected', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      // Source: "Pilih ruang chat untuk mulai berkomunikasi"
      expect(screen.getByText(/pilih ruang chat untuk mulai/i)).toBeInTheDocument();
    });
  });

  it('shows messages when a room is selected', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      expect(screen.getByText('Tim Marketing')).toBeInTheDocument();
    });

    // Click on room
    fireEvent.click(screen.getByText('Tim Marketing'));

    await waitFor(() => {
      expect(screen.getByText('Halo semua!')).toBeInTheDocument();
      expect(screen.getByText('Halo juga!')).toBeInTheDocument();
    });
  });

  it('renders send message input when room is selected', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      expect(screen.getByText('Tim Marketing')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tim Marketing'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ketik pesan...')).toBeInTheDocument();
    });
  });

  it('sends message via API when form is submitted', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      expect(screen.getByText('Tim Marketing')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tim Marketing'));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ketik pesan...')).toBeInTheDocument();
    });

    const messageInput = screen.getByPlaceholderText('Ketik pesan...');
    fireEvent.change(messageInput, { target: { value: 'Test message' } });

    // Submit form
    const form = messageInput.closest('form');
    fireEvent.submit(form);

    await waitFor(() => {
      expect(chatAPI.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 'room1',
          content: 'Test message',
        })
      );
    });
  });

  it('shows create room button', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      // Source: "Buat Ruang Chat"
      expect(screen.getByText(/Buat Ruang Chat/i)).toBeInTheDocument();
    });
  });

  it('shows empty state when no rooms', async () => {
    chatAPI.getRooms.mockResolvedValue({ rooms: [] });

    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      // Source: "Belum ada ruang chat"
      expect(screen.getByText(/belum ada ruang chat/i)).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);
    expect(screen.getByText('Memuat data...')).toBeInTheDocument();
  });

  it('joins room via socket when room is selected', async () => {
    render(<ChatPage user={currentUser} socket={mockSocket} />);

    await waitFor(() => {
      expect(screen.getByText('Tim Marketing')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tim Marketing'));

    await waitFor(() => {
      expect(mockSocket.emit).toHaveBeenCalledWith('join_room', 'room1');
    });
  });
});
