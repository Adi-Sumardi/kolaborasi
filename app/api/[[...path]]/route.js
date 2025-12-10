import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { sendNotification } from '@/lib/socket-server';

// Helper function to verify JWT token
const verifyToken = (request) => {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
};

// Helper function to check role permission
const hasPermission = (userRole, allowedRoles) => {
  return allowedRoles.includes(userRole);
};

// ============================================
// AUTH ENDPOINTS
// ============================================

// Register new user
async function handleRegister(request) {
  try {
    const body = await request.json();
    const { email, password, name, role, divisionId } = body;

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    // Check if user already exists
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate 2FA secret
    const secret = speakeasy.generateSecret({
      name: `Workspace (${email})`,
      length: 32
    });

    const user = {
      id: uuidv4(),
      email,
      password: hashedPassword,
      name,
      role,
      divisionId: divisionId || null,
      twoFactorSecret: secret.base32,
      twoFactorEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('users').insertOne(user);

    return NextResponse.json({
      message: 'User registered successfully',
      userId: user.id
    });
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { error: 'Registration failed' },
      { status: 500 }
    );
  }
}

// Login
async function handleLogin(request) {
  try {
    const body = await request.json();
    const { email, password, twoFactorCode, rememberMe } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // If 2FA is enabled, verify code
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return NextResponse.json(
          { require2FA: true },
          { status: 200 }
        );
      }

      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: twoFactorCode,
        window: 2
      });

      if (!verified) {
        return NextResponse.json(
          { error: 'Invalid 2FA code' },
          { status: 401 }
        );
      }
    }

    // Generate JWT token
    const expiresIn = rememberMe ? '30d' : '1d';
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    // Update last login
    await db.collection('users').updateOne(
      { id: user.id },
      { $set: { lastLogin: new Date() } }
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        divisionId: user.divisionId,
        twoFactorEnabled: user.twoFactorEnabled
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}

// Get 2FA QR Code
async function handleGet2FAQRCode(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    const userDoc = await db.collection('users').findOne({ id: user.userId });
    if (!userDoc) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const otpauthUrl = speakeasy.otpauthURL({
      secret: userDoc.twoFactorSecret,
      label: userDoc.email,
      issuer: 'Workspace Collaboration'
    });

    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return NextResponse.json({
      qrCode: qrCodeUrl,
      secret: userDoc.twoFactorSecret
    });
  } catch (error) {
    console.error('Get 2FA QR Code error:', error);
    return NextResponse.json(
      { error: 'Failed to generate QR code' },
      { status: 500 }
    );
  }
}

// Enable 2FA
async function handleEnable2FA(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { error: 'Verification code required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const userDoc = await db.collection('users').findOne({ id: user.userId });
    if (!userDoc) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify the code
    const verified = speakeasy.totp.verify({
      secret: userDoc.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Enable 2FA
    await db.collection('users').updateOne(
      { id: user.userId },
      { $set: { twoFactorEnabled: true, updatedAt: new Date() } }
    );

    return NextResponse.json({ message: '2FA enabled successfully' });
  } catch (error) {
    console.error('Enable 2FA error:', error);
    return NextResponse.json(
      { error: 'Failed to enable 2FA' },
      { status: 500 }
    );
  }
}

// Get current user
async function handleGetMe(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    const userDoc = await db.collection('users').findOne({ id: user.userId });
    if (!userDoc) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get division info if exists
    let division = null;
    if (userDoc.divisionId) {
      division = await db.collection('divisions').findOne({ id: userDoc.divisionId });
    }

    return NextResponse.json({
      id: userDoc.id,
      email: userDoc.email,
      name: userDoc.name,
      role: userDoc.role,
      divisionId: userDoc.divisionId,
      division: division ? { id: division.id, name: division.name } : null,
      twoFactorEnabled: userDoc.twoFactorEnabled
    });
  } catch (error) {
    console.error('Get me error:', error);
    return NextResponse.json(
      { error: 'Failed to get user info' },
      { status: 500 }
    );
  }
}

// ============================================
// DIVISION ENDPOINTS
// ============================================

// Get all divisions
async function handleGetDivisions(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    const divisions = await db.collection('divisions')
      .find({})
      .sort({ name: 1 })
      .toArray();

    // Get member count for each division
    const divisionsWithCount = await Promise.all(
      divisions.map(async (div) => {
        const memberCount = await db.collection('users').countDocuments({
          divisionId: div.id
        });
        return {
          ...div,
          memberCount
        };
      })
    );

    return NextResponse.json({ divisions: divisionsWithCount });
  } catch (error) {
    console.error('Get divisions error:', error);
    return NextResponse.json(
      { error: 'Failed to get divisions' },
      { status: 500 }
    );
  }
}

// Create division
async function handleCreateDivision(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Division name required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const division = {
      id: uuidv4(),
      name,
      description: description || '',
      createdBy: user.userId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('divisions').insertOne(division);

    return NextResponse.json({
      message: 'Division created successfully',
      division
    });
  } catch (error) {
    console.error('Create division error:', error);
    return NextResponse.json(
      { error: 'Failed to create division' },
      { status: 500 }
    );
  }
}

// Update division
async function handleUpdateDivision(request, divisionId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Division name required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    await db.collection('divisions').updateOne(
      { id: divisionId },
      {
        $set: {
          name,
          description: description || '',
          updatedAt: new Date()
        }
      }
    );

    return NextResponse.json({ message: 'Division updated successfully' });
  } catch (error) {
    console.error('Update division error:', error);
    return NextResponse.json(
      { error: 'Failed to update division' },
      { status: 500 }
    );
  }
}

// Delete division
async function handleDeleteDivision(request, divisionId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Remove division from all users
    await db.collection('users').updateMany(
      { divisionId },
      { $set: { divisionId: null, updatedAt: new Date() } }
    );

    // Delete the division
    await db.collection('divisions').deleteOne({ id: divisionId });

    return NextResponse.json({ message: 'Division deleted successfully' });
  } catch (error) {
    console.error('Delete division error:', error);
    return NextResponse.json(
      { error: 'Failed to delete division' },
      { status: 500 }
    );
  }
}

// ============================================
// JOBDESK ENDPOINTS
// ============================================

// Get jobdesks
async function handleGetJobdesks(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    let query = {};
    
    // Karyawan only see their own jobdesks
    if (user.role === 'karyawan') {
      query = { assignedTo: { $in: [user.userId] } };
    }

    const jobdesks = await db.collection('jobdesks')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ jobdesks });
  } catch (error) {
    console.error('Get jobdesks error:', error);
    return NextResponse.json(
      { error: 'Failed to get jobdesks' },
      { status: 500 }
    );
  }
}

// Create jobdesk
async function handleCreateJobdesk(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, description, assignedTo, dueDate } = body;

    if (!title || !assignedTo || assignedTo.length === 0) {
      return NextResponse.json(
        { error: 'Title and at least one assignee required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const jobdesk = {
      id: uuidv4(),
      title,
      description: description || '',
      assignedTo,
      createdBy: user.userId,
      status: 'pending',
      dueDate: dueDate ? new Date(dueDate) : null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('jobdesks').insertOne(jobdesk);

    // Send notifications to assigned users
    for (const userId of assignedTo) {
      const notification = {
        id: uuidv4(),
        userId,
        type: 'jobdesk_assigned',
        title: 'Jobdesk Baru',
        message: `Anda mendapat jobdesk baru: ${title}`,
        read: false,
        createdAt: new Date()
      };
      
      await db.collection('notifications').insertOne(notification);
      
      // Send real-time notification via Socket.io
      try {
        sendNotification(userId, notification);
      } catch (err) {
        console.error('Socket notification error:', err);
      }
    }

    return NextResponse.json({
      message: 'Jobdesk created successfully',
      jobdesk
    });
  } catch (error) {
    console.error('Create jobdesk error:', error);
    return NextResponse.json(
      { error: 'Failed to create jobdesk' },
      { status: 500 }
    );
  }
}

// Update jobdesk status
async function handleUpdateJobdeskStatus(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { status } = body;

    if (!['pending', 'in_progress', 'completed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    await db.collection('jobdesks').updateOne(
      { id: jobdeskId },
      {
        $set: {
          status,
          completedAt: status === 'completed' ? new Date() : null,
          updatedAt: new Date()
        }
      }
    );

    return NextResponse.json({ message: 'Jobdesk status updated' });
  } catch (error) {
    console.error('Update jobdesk status error:', error);
    return NextResponse.json(
      { error: 'Failed to update jobdesk status' },
      { status: 500 }
    );
  }
}

// ============================================
// DAILY LOG ENDPOINTS
// ============================================

// Get daily logs
async function handleGetDailyLogs(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const client = await clientPromise;
    const db = client.db();

    let query = {};
    
    // If karyawan, only show own logs
    if (user.role === 'karyawan') {
      query.userId = user.userId;
    } else if (userId) {
      query.userId = userId;
    }

    if (startDate && endDate) {
      query.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const logs = await db.collection('daily_logs')
      .find(query)
      .sort({ date: -1 })
      .toArray();

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Get daily logs error:', error);
    return NextResponse.json(
      { error: 'Failed to get daily logs' },
      { status: 500 }
    );
  }
}

// Create daily log
async function handleCreateDailyLog(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { jobdeskId, notes, hoursSpent, date } = body;

    if (!jobdeskId || !notes) {
      return NextResponse.json(
        { error: 'Jobdesk and notes required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const log = {
      id: uuidv4(),
      userId: user.userId,
      jobdeskId,
      notes,
      hoursSpent: hoursSpent || 0,
      date: date ? new Date(date) : new Date(),
      createdAt: new Date()
    };

    await db.collection('daily_logs').insertOne(log);

    return NextResponse.json({
      message: 'Daily log created successfully',
      log
    });
  } catch (error) {
    console.error('Create daily log error:', error);
    return NextResponse.json(
      { error: 'Failed to create daily log' },
      { status: 500 }
    );
  }
}

// ============================================
// KPI ENDPOINTS
// ============================================

// Get KPI data
async function handleGetKPI(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId') || user.userId;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Only SDM, Pengurus, and Super Admin can see other users' KPI
    if (userId !== user.userId && !hasPermission(user.role, ['super_admin', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const client = await clientPromise;
    const db = client.db();

    let dateQuery = {};
    if (startDate && endDate) {
      dateQuery = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Default to current month
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      dateQuery = { $gte: firstDay, $lte: lastDay };
    }

    // Get completed jobdesks
    const completedJobdesks = await db.collection('jobdesks')
      .countDocuments({
        assignedTo: { $in: [userId] },
        status: 'completed',
        completedAt: dateQuery
      });

    // Get total jobdesks
    const totalJobdesks = await db.collection('jobdesks')
      .countDocuments({
        assignedTo: { $in: [userId] }
      });

    // Get daily logs
    const dailyLogs = await db.collection('daily_logs')
      .find({
        userId,
        date: dateQuery
      })
      .toArray();

    const totalHours = dailyLogs.reduce((sum, log) => sum + (log.hoursSpent || 0), 0);
    const totalLogs = dailyLogs.length;

    // Calculate KPI score (custom formula)
    // Formula: (completed/total * 50) + (totalLogs * 2) + (totalHours * 0.5)
    const completionRate = totalJobdesks > 0 ? (completedJobdesks / totalJobdesks) * 50 : 0;
    const activityScore = totalLogs * 2;
    const hoursScore = totalHours * 0.5;
    const kpiScore = Math.min(100, completionRate + activityScore + hoursScore);

    return NextResponse.json({
      kpi: {
        score: Math.round(kpiScore * 10) / 10,
        completedJobdesks,
        totalJobdesks,
        completionRate: totalJobdesks > 0 ? Math.round((completedJobdesks / totalJobdesks) * 100) : 0,
        totalLogs,
        totalHours,
        period: {
          startDate: dateQuery.$gte,
          endDate: dateQuery.$lte
        }
      }
    });
  } catch (error) {
    console.error('Get KPI error:', error);
    return NextResponse.json(
      { error: 'Failed to get KPI data' },
      { status: 500 }
    );
  }
}

// Get all users (for KPI selection)
async function handleGetUsers(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const client = await clientPromise;
    const db = client.db();

    const users = await db.collection('users')
      .find(
        {},
        { projection: { password: 0, twoFactorSecret: 0 } }
      )
      .sort({ name: 1 })
      .toArray();

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Failed to get users' },
      { status: 500 }
    );
  }
}

// ============================================
// TODO ENDPOINTS
// ============================================

// Get todos
async function handleGetTodos(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    const todos = await db.collection('todos')
      .find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ todos });
  } catch (error) {
    console.error('Get todos error:', error);
    return NextResponse.json(
      { error: 'Failed to get todos' },
      { status: 500 }
    );
  }
}

// Create todo
async function handleCreateTodo(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, priority, dueDate } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Title required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const todo = {
      id: uuidv4(),
      userId: user.userId,
      title,
      status: 'pending',
      priority: priority || 'medium',
      dueDate: dueDate ? new Date(dueDate) : null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('todos').insertOne(todo);

    return NextResponse.json({
      message: 'Todo created successfully',
      todo
    });
  } catch (error) {
    console.error('Create todo error:', error);
    return NextResponse.json(
      { error: 'Failed to create todo' },
      { status: 500 }
    );
  }
}

// Update todo
async function handleUpdateTodo(request, todoId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { title, status, priority, dueDate } = body;

    const client = await clientPromise;
    const db = client.db();

    const updateData = { updatedAt: new Date() };
    if (title) updateData.title = title;
    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    await db.collection('todos').updateOne(
      { id: todoId, userId: user.userId },
      { $set: updateData }
    );

    return NextResponse.json({ message: 'Todo updated successfully' });
  } catch (error) {
    console.error('Update todo error:', error);
    return NextResponse.json(
      { error: 'Failed to update todo' },
      { status: 500 }
    );
  }
}

// ============================================
// CHAT ENDPOINTS
// ============================================

// Get chat rooms
async function handleGetChatRooms(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    const rooms = await db.collection('chat_rooms')
      .find({
        members: { $in: [user.userId] }
      })
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error('Get chat rooms error:', error);
    return NextResponse.json(
      { error: 'Failed to get chat rooms' },
      { status: 500 }
    );
  }
}

// Create chat room
async function handleCreateChatRoom(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, members, type } = body;

    if (!name || !members || members.length === 0) {
      return NextResponse.json(
        { error: 'Name and members required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    const room = {
      id: uuidv4(),
      name,
      type: type || 'group',
      members: [...new Set([...members, user.userId])],
      createdBy: user.userId,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('chat_rooms').insertOne(room);

    return NextResponse.json({
      message: 'Chat room created successfully',
      room
    });
  } catch (error) {
    console.error('Create chat room error:', error);
    return NextResponse.json(
      { error: 'Failed to create chat room' },
      { status: 500 }
    );
  }
}

// Get messages
async function handleGetMessages(request, roomId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Check if user is member of the room
    const room = await db.collection('chat_rooms').findOne({ id: roomId });
    if (!room || !room.members.includes(user.userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const messages = await db.collection('messages')
      .find({ roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    messages.reverse();

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    return NextResponse.json(
      { error: 'Failed to get messages' },
      { status: 500 }
    );
  }
}

// Send message
async function handleSendMessage(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { roomId, content } = body;

    if (!roomId || !content) {
      return NextResponse.json(
        { error: 'Room ID and content required' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();

    // Check if user is member of the room
    const room = await db.collection('chat_rooms').findOne({ id: roomId });
    if (!room || !room.members.includes(user.userId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const message = {
      id: uuidv4(),
      roomId,
      userId: user.userId,
      userEmail: user.email,
      content,
      createdAt: new Date()
    };

    await db.collection('messages').insertOne(message);

    // Update room's last activity
    await db.collection('chat_rooms').updateOne(
      { id: roomId },
      { $set: { updatedAt: new Date() } }
    );

    return NextResponse.json({
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Send message error:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}

// ============================================
// NOTIFICATION ENDPOINTS
// ============================================

// Get notifications
async function handleGetNotifications(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    const notifications = await db.collection('notifications')
      .find({ userId: user.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    return NextResponse.json(
      { error: 'Failed to get notifications' },
      { status: 500 }
    );
  }
}

// Mark notification as read
async function handleMarkNotificationRead(request, notificationId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    await db.collection('notifications').updateOne(
      { id: notificationId, userId: user.userId },
      { $set: { read: true } }
    );

    return NextResponse.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return NextResponse.json(
      { error: 'Failed to mark notification as read' },
      { status: 500 }
    );
  }
}

// ============================================
// ATTACHMENT ENDPOINTS
// ============================================

// Get attachments for a jobdesk
async function handleGetAttachments(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Check if user has access to this jobdesk
    const jobdesk = await db.collection('jobdesks').findOne({ id: jobdeskId });
    if (!jobdesk) {
      return NextResponse.json({ error: 'Jobdesk not found' }, { status: 404 });
    }

    // Check permission: assigned karyawan, pengurus, or super_admin
    const hasAccess = 
      jobdesk.assignedTo?.includes(user.userId) ||
      hasPermission(user.role, ['super_admin', 'pengurus']);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const attachments = await db.collection('attachments')
      .find({ jobdeskId })
      .sort({ createdAt: -1 })
      .toArray();

    // Get user info for each attachment
    const attachmentsWithUser = await Promise.all(
      attachments.map(async (att) => {
        const uploader = await db.collection('users').findOne(
          { id: att.userId },
          { projection: { name: 1, email: 1 } }
        );
        return {
          ...att,
          uploaderName: uploader?.name || 'Unknown',
          uploaderEmail: uploader?.email || ''
        };
      })
    );

    return NextResponse.json({ attachments: attachmentsWithUser });
  } catch (error) {
    console.error('Get attachments error:', error);
    return NextResponse.json(
      { error: 'Failed to get attachments' },
      { status: 500 }
    );
  }
}

// Create attachment (file or link)
async function handleCreateAttachment(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Check if user has access to this jobdesk
    const jobdesk = await db.collection('jobdesks').findOne({ id: jobdeskId });
    if (!jobdesk) {
      return NextResponse.json({ error: 'Jobdesk not found' }, { status: 404 });
    }

    // Check permission: only assigned karyawan can upload
    if (!jobdesk.assignedTo?.includes(user.userId)) {
      return NextResponse.json({ 
        error: 'Only assigned karyawan can upload attachments' 
      }, { status: 403 });
    }

    const body = await request.json();
    const { type, url, fileName, fileSize, fileType } = body;

    if (!type || (type === 'link' && !url) || (type === 'file' && !fileName)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const attachment = {
      id: uuidv4(),
      jobdeskId,
      userId: user.userId,
      type, // 'file' or 'link'
      url: url || null,
      fileName: fileName || null,
      fileSize: fileSize || null,
      fileType: fileType || null,
      createdAt: new Date()
    };

    await db.collection('attachments').insertOne(attachment);

    // Send notification to pengurus
    const pengurusUsers = await db.collection('users').find({
      role: { $in: ['pengurus', 'super_admin'] }
    }).toArray();

    for (const pengurus of pengurusUsers) {
      const notification = {
        id: uuidv4(),
        userId: pengurus.id,
        type: 'attachment_added',
        title: 'Lampiran Baru',
        message: `${user.email} menambahkan lampiran di jobdesk: ${jobdesk.title}`,
        read: false,
        createdAt: new Date()
      };
      
      await db.collection('notifications').insertOne(notification);
      
      try {
        sendNotification(pengurus.id, notification);
      } catch (err) {
        console.error('Socket notification error:', err);
      }
    }

    return NextResponse.json({
      message: 'Attachment added successfully',
      attachment
    });
  } catch (error) {
    console.error('Create attachment error:', error);
    return NextResponse.json(
      { error: 'Failed to create attachment' },
      { status: 500 }
    );
  }
}

// Delete attachment
async function handleDeleteAttachment(request, attachmentId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = await clientPromise;
    const db = client.db();

    const attachment = await db.collection('attachments').findOne({ id: attachmentId });
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    // Check permission: owner, pengurus, or super_admin
    const canDelete = 
      attachment.userId === user.userId ||
      hasPermission(user.role, ['super_admin', 'pengurus']);

    if (!canDelete) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await db.collection('attachments').deleteOne({ id: attachmentId });

    return NextResponse.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Delete attachment error:', error);
    return NextResponse.json(
      { error: 'Failed to delete attachment' },
      { status: 500 }
    );
  }
}

// ============================================
// USER MANAGEMENT ENDPOINTS
// ============================================

// Update user
async function handleUpdateUser(request, userId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, role, divisionId } = body;

    const client = await clientPromise;
    const db = client.db();

    // Check if email already exists (excluding current user)
    if (email) {
      const existingUser = await db.collection('users').findOne({ 
        email, 
        id: { $ne: userId } 
      });
      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
    }

    const updateData = { updatedAt: new Date() };
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (divisionId !== undefined) updateData.divisionId = divisionId;

    await db.collection('users').updateOne(
      { id: userId },
      { $set: updateData }
    );

    return NextResponse.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// Update user status (enable/disable)
async function handleUpdateUserStatus(request, userId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { isActive } = body;

    const client = await clientPromise;
    const db = client.db();

    await db.collection('users').updateOne(
      { id: userId },
      { $set: { isActive, updatedAt: new Date() } }
    );

    return NextResponse.json({ 
      message: `User ${isActive ? 'enabled' : 'disabled'} successfully` 
    });
  } catch (error) {
    console.error('Update user status error:', error);
    return NextResponse.json(
      { error: 'Failed to update user status' },
      { status: 500 }
    );
  }
}

// Delete user
async function handleDeleteUser(request, userId) {
  try {
    const user = verifyToken(request);
    if (!user || user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Soft delete - just set isActive to false
    await db.collection('users').updateOne(
      { id: userId },
      { $set: { isActive: false, deletedAt: new Date() } }
    );

    return NextResponse.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}

// Update user division
async function handleUpdateUserDivision(request, userId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { divisionId } = body;

    const client = await clientPromise;
    const db = client.db();

    await db.collection('users').updateOne(
      { id: userId },
      { $set: { divisionId, updatedAt: new Date() } }
    );

    return NextResponse.json({ message: 'User division updated successfully' });
  } catch (error) {
    console.error('Update user division error:', error);
    return NextResponse.json(
      { error: 'Failed to update user division' },
      { status: 500 }
    );
  }
}

// ============================================
// ROUTER
// ============================================

export async function GET(request, { params }) {
  const path = params?.path?.join('/') || '';

  try {
    // Auth
    if (path === 'auth/me') return handleGetMe(request);
    if (path === 'auth/2fa/qrcode') return handleGet2FAQRCode(request);
    
    // Divisions
    if (path === 'divisions') return handleGetDivisions(request);
    
    // Jobdesks
    if (path === 'jobdesks') return handleGetJobdesks(request);
    
    // Daily logs
    if (path === 'daily-logs') return handleGetDailyLogs(request);
    
    // KPI
    if (path === 'kpi') return handleGetKPI(request);
    if (path === 'users') return handleGetUsers(request);
    
    // Todos
    if (path === 'todos') return handleGetTodos(request);
    
    // Chat
    if (path === 'chat/rooms') return handleGetChatRooms(request);
    if (path.startsWith('chat/rooms/') && path.endsWith('/messages')) {
      const roomId = path.split('/')[2];
      return handleGetMessages(request, roomId);
    }
    
    // Notifications
    if (path === 'notifications') return handleGetNotifications(request);
    
    // Attachments
    if (path.startsWith('jobdesks/') && path.endsWith('/attachments')) {
      const jobdeskId = path.split('/')[1];
      return handleGetAttachments(request, jobdeskId);
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  const path = params?.path?.join('/') || '';

  try {
    // Auth
    if (path === 'auth/register') return handleRegister(request);
    if (path === 'auth/login') return handleLogin(request);
    if (path === 'auth/2fa/enable') return handleEnable2FA(request);
    
    // Divisions
    if (path === 'divisions') return handleCreateDivision(request);
    
    // Jobdesks
    if (path === 'jobdesks') return handleCreateJobdesk(request);
    
    // Daily logs
    if (path === 'daily-logs') return handleCreateDailyLog(request);
    
    // Todos
    if (path === 'todos') return handleCreateTodo(request);
    
    // Chat
    if (path === 'chat/rooms') return handleCreateChatRoom(request);
    if (path === 'chat/messages') return handleSendMessage(request);
    
    // Attachments
    if (path.startsWith('jobdesks/') && path.endsWith('/attachments')) {
      const jobdeskId = path.split('/')[1];
      return handleCreateAttachment(request, jobdeskId);
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  const path = params?.path?.join('/') || '';

  try {
    // Divisions
    if (path.match(/^divisions\/[^/]+$/)) {
      const divisionId = path.split('/')[1];
      return handleUpdateDivision(request, divisionId);
    }
    
    // Users
    if (path.match(/^users\/[^/]+\/status$/)) {
      const userId = path.split('/')[1];
      return handleUpdateUserStatus(request, userId);
    }
    if (path.match(/^users\/[^/]+\/division$/)) {
      const userId = path.split('/')[1];
      return handleUpdateUserDivision(request, userId);
    }
    if (path.match(/^users\/[^/]+$/)) {
      const userId = path.split('/')[1];
      return handleUpdateUser(request, userId);
    }
    
    // Jobdesks
    if (path.match(/^jobdesks\/[^/]+\/status$/)) {
      const jobdeskId = path.split('/')[1];
      return handleUpdateJobdeskStatus(request, jobdeskId);
    }
    
    // Todos
    if (path.match(/^todos\/[^/]+$/)) {
      const todoId = path.split('/')[1];
      return handleUpdateTodo(request, todoId);
    }
    
    // Notifications
    if (path.match(/^notifications\/[^/]+\/read$/)) {
      const notificationId = path.split('/')[1];
      return handleMarkNotificationRead(request, notificationId);
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const path = params?.path?.join('/') || '';

  try {
    // Divisions
    if (path.match(/^divisions\/[^/]+$/)) {
      const divisionId = path.split('/')[1];
      return handleDeleteDivision(request, divisionId);
    }
    
    // Users
    if (path.match(/^users\/[^/]+$/)) {
      const userId = path.split('/')[1];
      return handleDeleteUser(request, userId);
    }
    
    // Attachments
    if (path.match(/^attachments\/[^/]+$/)) {
      const attachmentId = path.split('/')[1];
      return handleDeleteAttachment(request, attachmentId);
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

