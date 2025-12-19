import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { sendNotification } from '@/lib/socket-server';
import { sanitizeUserInput, sanitizeEmail, sanitizeString, validators, validatePasswordStrength } from '@/lib/sanitize';
import { rateLimitMiddleware, getClientIP } from '@/lib/rateLimit';
import { getVapidPublicKey, sendPushNotification, sendBulkPushNotifications } from '@/lib/push-notifications';
import fs from 'fs/promises';
import path from 'path';

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
async function handleCreateUser(request) {
  try {
    // Auth check - only super_admin and pengurus can create users
    const authUser = verifyToken(request);
    if (!authUser || !hasPermission(authUser.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, name, role, divisionId } = body;

    if (!email || !password || !name || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existingUser.rows.length > 0) {
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

    const result = await query(
      `INSERT INTO users (email, password, name, role, division_id, two_factor_secret)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, name, role, division_id, is_active`,
      [email, hashedPassword, name, role, divisionId || null, secret.base32]
    );

    const user = result.rows[0];

    return NextResponse.json({
      message: 'User created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        divisionId: user.division_id,
        isActive: user.is_active
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

async function handleRegister(request) {
  try {
    const body = await request.json();
    let { email, password, name, role, divisionId } = body;

    // Sanitize inputs
    email = sanitizeEmail(email);
    name = sanitizeString(name);
    role = sanitizeString(role);

    // Basic field validation
    if (!email || !password || !name || !role || !validators.email(email)) {
      return NextResponse.json(
        { error: 'Missing or invalid required fields' },
        { status: 400 }
      );
    }

    // Strong password validation with detailed feedback
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      return NextResponse.json(
        {
          error: 'Password tidak memenuhi kriteria keamanan',
          details: passwordValidation.errors
        },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existingUser.rows.length > 0) {
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

    const result = await query(
      `INSERT INTO users (email, password, name, role, division_id, two_factor_secret)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [email, hashedPassword, name, role, divisionId || null, secret.base32]
    );

    return NextResponse.json({
      message: 'User registered successfully',
      userId: result.rows[0].id
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
    // Rate limiting for login attempts
    const rateLimit = rateLimitMiddleware(request, 'login');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Too many login attempts. Please try again later.',
          retryAfter: rateLimit.retryAfter
        },
        {
          status: 429,
          headers: {
            'Retry-After': rateLimit.retryAfter.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(rateLimit.resetTime).toISOString()
          }
        }
      );
    }

    const body = await request.json();
    let { email, password, twoFactorCode, rememberMe } = body;

    // Sanitize inputs
    email = sanitizeEmail(email);

    if (!email || !password || !validators.email(email)) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // If 2FA is enabled, verify code
    if (user.two_factor_enabled) {
      if (!twoFactorCode) {
        return NextResponse.json(
          { require2FA: true },
          { status: 200 }
        );
      }

      const verified = speakeasy.totp.verify({
        secret: user.two_factor_secret,
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
    await query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [user.id]
    );

    return NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        divisionId: user.division_id,
        twoFactorEnabled: user.two_factor_enabled
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

    const result = await query(
      'SELECT email, two_factor_secret FROM users WHERE id = $1',
      [user.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = result.rows[0];

    const otpauthUrl = speakeasy.otpauthURL({
      secret: userDoc.two_factor_secret,
      label: userDoc.email,
      issuer: 'Workspace Collaboration'
    });

    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return NextResponse.json({
      qrCode: qrCodeUrl
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

    const result = await query(
      'SELECT two_factor_secret FROM users WHERE id = $1',
      [user.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = result.rows[0];

    // Verify the code
    const verified = speakeasy.totp.verify({
      secret: userDoc.two_factor_secret,
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
    await query(
      'UPDATE users SET two_factor_enabled = TRUE WHERE id = $1',
      [user.userId]
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

    const result = await query(
      `SELECT u.id, u.email, u.name, u.role, u.division_id, u.two_factor_enabled, u.profile_photo,
              d.name as division_name
       FROM users u
       LEFT JOIN divisions d ON u.division_id = d.id
       WHERE u.id = $1`,
      [user.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = result.rows[0];

    return NextResponse.json({
      id: userDoc.id,
      email: userDoc.email,
      name: userDoc.name,
      role: userDoc.role,
      divisionId: userDoc.division_id,
      division: userDoc.division_id ? { id: userDoc.division_id, name: userDoc.division_name } : null,
      twoFactorEnabled: userDoc.two_factor_enabled,
      profilePhoto: userDoc.profile_photo
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

    const result = await query(
      `SELECT d.*, COUNT(u.id) as member_count
       FROM divisions d
       LEFT JOIN users u ON u.division_id = d.id
       GROUP BY d.id
       ORDER BY d.name ASC`
    );

    const divisions = result.rows.map(div => ({
      id: div.id,
      name: div.name,
      description: div.description,
      createdBy: div.created_by,
      createdAt: div.created_at,
      updatedAt: div.updated_at,
      memberCount: parseInt(div.member_count)
    }));

    return NextResponse.json({ divisions });
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
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
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

    const result = await query(
      `INSERT INTO divisions (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description || '', user.userId]
    );

    const division = result.rows[0];

    return NextResponse.json({
      message: 'Division created successfully',
      division: {
        id: division.id,
        name: division.name,
        description: division.description,
        createdBy: division.created_by,
        createdAt: division.created_at,
        updatedAt: division.updated_at
      }
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
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
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

    await query(
      `UPDATE divisions SET name = $1, description = $2 WHERE id = $3`,
      [name, description || '', divisionId]
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
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Remove division from all users
    await query(
      'UPDATE users SET division_id = NULL WHERE division_id = $1',
      [divisionId]
    );

    // Delete the division
    await query('DELETE FROM divisions WHERE id = $1', [divisionId]);

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

// Get jobdesks with pagination
async function handleGetJobdesks(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse pagination parameters
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = (page - 1) * limit;

    let countQuery, dataQuery;
    let params = [];

    // Karyawan only see their own jobdesks
    if (user.role === 'karyawan') {
      countQuery = `
        SELECT COUNT(DISTINCT j.id) as total
        FROM jobdesks j
        JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
        WHERE ja.user_id = $1
      `;
      dataQuery = `
        SELECT j.*,
               c.name as client_name, c.npwp as client_npwp, c.is_pkp, c.is_umkm,
               ARRAY_AGG(DISTINCT ja.user_id) as assigned_to,
               (SELECT COUNT(*) FROM jobdesk_submissions WHERE jobdesk_id = j.id) as submission_count
        FROM jobdesks j
        LEFT JOIN clients c ON c.id = j.client_id
        JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
        WHERE j.id IN (
          SELECT jobdesk_id FROM jobdesk_assignments WHERE user_id = $1
        )
        GROUP BY j.id, c.id
        ORDER BY j.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [user.userId, limit, offset];
    } else {
      countQuery = 'SELECT COUNT(*) as total FROM jobdesks';
      dataQuery = `
        SELECT j.*,
               c.name as client_name, c.npwp as client_npwp, c.is_pkp, c.is_umkm,
               ARRAY_AGG(DISTINCT ja.user_id) as assigned_to,
               (SELECT COUNT(*) FROM jobdesk_submissions WHERE jobdesk_id = j.id) as submission_count
        FROM jobdesks j
        LEFT JOIN clients c ON c.id = j.client_id
        LEFT JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
        GROUP BY j.id, c.id
        ORDER BY j.created_at DESC
        LIMIT $1 OFFSET $2
      `;
      params = [limit, offset];
    }

    const countResult = await query(countQuery, user.role === 'karyawan' ? [user.userId] : []);
    const totalCount = parseInt(countResult.rows[0].total);

    const result = await query(dataQuery, params);

    const jobdesks = result.rows.map(j => ({
      id: j.id,
      title: j.title,
      description: j.description,
      status: j.status,
      priority: j.priority,
      dueDate: j.due_date,
      submissionLink: j.submission_link,
      createdBy: j.created_by,
      assignedTo: j.assigned_to ? j.assigned_to.filter(id => id !== null) : [],
      clientId: j.client_id,
      clientName: j.client_name,
      clientNpwp: j.client_npwp,
      isPkp: j.is_pkp,
      isUmkm: j.is_umkm,
      periodMonth: j.period_month,
      periodYear: j.period_year,
      taskTypes: j.task_types || [],
      submissionCount: parseInt(j.submission_count) || 0,
      createdAt: j.created_at,
      updatedAt: j.updated_at
    }));

    return NextResponse.json({
      jobdesks,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + jobdesks.length < totalCount
      }
    });
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
    const {
      title, description, assignedTo, dueDate, priority, submissionLink,
      // New fields for client integration
      clientId, newClient, periodMonth, periodYear, taskTypes
    } = body;

    if (!title || !assignedTo || assignedTo.length === 0) {
      return NextResponse.json(
        { error: 'Title and at least one assignee required' },
        { status: 400 }
      );
    }

    // Use transaction to create jobdesk and assignments
    const jobdesk = await transaction(async (client) => {
      let finalClientId = clientId || null;

      // Create new client if provided
      if (newClient && newClient.name) {
        const clientResult = await client.query(
          `INSERT INTO clients (name, npwp, address, contact_person, phone, email, is_pkp, is_umkm, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            sanitizeString(newClient.name),
            sanitizeString(newClient.npwp || ''),
            sanitizeString(newClient.address || ''),
            sanitizeString(newClient.contactPerson || ''),
            sanitizeString(newClient.phone || ''),
            sanitizeString(newClient.email || ''),
            newClient.isPkp || false,
            newClient.isUmkm || false,
            user.userId
          ]
        );
        finalClientId = clientResult.rows[0].id;
      }

      // Create jobdesk with new fields
      const jobdeskResult = await client.query(
        `INSERT INTO jobdesks (title, description, status, priority, due_date, submission_link, created_by, client_id, period_month, period_year, task_types)
         VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          title,
          description || '',
          priority || 'medium',
          dueDate ? new Date(dueDate) : null,
          submissionLink || null,
          user.userId,
          finalClientId,
          periodMonth || null,
          periodYear || null,
          taskTypes && taskTypes.length > 0 ? taskTypes : null
        ]
      );

      const newJobdesk = jobdeskResult.rows[0];

      // Create assignments
      for (const userId of assignedTo) {
        await client.query(
          `INSERT INTO jobdesk_assignments (jobdesk_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [newJobdesk.id, userId]
        );
      }

      // Create notifications
      for (const userId of assignedTo) {
        await client.query(
          `INSERT INTO notifications (user_id, title, message, type)
           VALUES ($1, $2, $3, $4)`,
          [userId, 'Jobdesk Baru', `Anda mendapat jobdesk baru: ${title}`, 'jobdesk_assigned']
        );

        // Send real-time notification
        try {
          sendNotification(userId, {
            type: 'jobdesk_assigned',
            title: 'Jobdesk Baru',
            message: `Anda mendapat jobdesk baru: ${title}`
          });
        } catch (err) {
          console.error('Socket notification error:', err);
        }
      }

      return {
        ...newJobdesk,
        assignedTo,
        clientId: finalClientId
      };
    });

    return NextResponse.json({
      message: 'Jobdesk created successfully',
      jobdesk: {
        id: jobdesk.id,
        title: jobdesk.title,
        description: jobdesk.description,
        status: jobdesk.status,
        priority: jobdesk.priority,
        dueDate: jobdesk.due_date,
        submissionLink: jobdesk.submission_link,
        assignedTo: jobdesk.assignedTo,
        createdBy: jobdesk.created_by,
        clientId: jobdesk.clientId,
        periodMonth: jobdesk.period_month,
        periodYear: jobdesk.period_year,
        taskTypes: jobdesk.task_types || [],
        createdAt: jobdesk.created_at
      }
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

    // Check if user is assigned to this jobdesk
    const assignmentResult = await query(
      'SELECT * FROM jobdesk_assignments WHERE jobdesk_id = $1 AND user_id = $2',
      [jobdeskId, user.userId]
    );

    if (assignmentResult.rows.length === 0) {
      return NextResponse.json({ error: 'Not assigned to this jobdesk' }, { status: 403 });
    }

    // Update jobdesk status
    await query(
      'UPDATE jobdesks SET status = $1 WHERE id = $2',
      [status, jobdeskId]
    );

    return NextResponse.json({
      message: 'Status updated',
      status
    });
  } catch (error) {
    console.error('Update jobdesk status error:', error);
    return NextResponse.json(
      { error: 'Failed to update jobdesk status' },
      { status: 500 }
    );
  }
}

// Update jobdesk (general edit)
async function handleUpdateJobdesk(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, assignedTo, dueDate, priority, status, submissionLink } = body;

    // Check if jobdesk exists
    const existingResult = await query(
      `SELECT j.*, ARRAY_AGG(ja.user_id) as assigned_to
       FROM jobdesks j
       LEFT JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
       WHERE j.id = $1
       GROUP BY j.id`,
      [jobdeskId]
    );

    if (existingResult.rows.length === 0) {
      return NextResponse.json({ error: 'Jobdesk not found' }, { status: 404 });
    }

    const existingJobdesk = existingResult.rows[0];
    const currentAssignees = existingJobdesk.assigned_to.filter(id => id !== null);

    // Authorization check
    const isSuperAdminOrPengurus = hasPermission(user.role, ['super_admin', 'owner', 'pengurus']);
    const isAssignedKaryawan = user.role === 'karyawan' && currentAssignees.includes(user.userId);

    if (!isSuperAdminOrPengurus && !isAssignedKaryawan) {
      return NextResponse.json({ error: 'Unauthorized - You can only edit jobdesks assigned to you' }, { status: 403 });
    }

    // Karyawan cannot change assignedTo field
    if (user.role === 'karyawan' && assignedTo) {
      return NextResponse.json({
        error: 'Karyawan cannot change assignedTo field'
      }, { status: 403 });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title) {
      updates.push(`title = $${paramIndex++}`);
      values.push(sanitizeString(title));
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(sanitizeString(description));
    }
    if (dueDate !== undefined) {
      updates.push(`due_date = $${paramIndex++}`);
      values.push(dueDate ? new Date(dueDate) : null);
    }
    if (priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (status && ['pending', 'in_progress', 'completed'].includes(status)) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (submissionLink !== undefined) {
      updates.push(`submission_link = $${paramIndex++}`);
      values.push(submissionLink || null);
    }

    if (updates.length > 0) {
      values.push(jobdeskId);
      await query(
        `UPDATE jobdesks SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

    // Handle assignedTo changes (only for super_admin/pengurus)
    if (assignedTo && Array.isArray(assignedTo) && assignedTo.length > 0 && isSuperAdminOrPengurus) {
      // Find new assignees
      const newAssignees = assignedTo.filter(userId => !currentAssignees.includes(userId));

      // Remove old assignments and add new ones
      await query('DELETE FROM jobdesk_assignments WHERE jobdesk_id = $1', [jobdeskId]);

      for (const userId of assignedTo) {
        await query(
          `INSERT INTO jobdesk_assignments (jobdesk_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [jobdeskId, userId]
        );
      }

      // Notify new assignees
      for (const userId of newAssignees) {
        await query(
          `INSERT INTO notifications (user_id, title, message, type)
           VALUES ($1, $2, $3, $4)`,
          [userId, 'Jobdesk Baru', `Anda mendapat jobdesk: ${title || existingJobdesk.title}`, 'jobdesk_assigned']
        );

        try {
          sendNotification(userId, {
            type: 'jobdesk_assigned',
            title: 'Jobdesk Baru',
            message: `Anda mendapat jobdesk: ${title || existingJobdesk.title}`
          });
        } catch (err) {
          console.error('Socket notification error:', err);
        }
      }
    }

    // Get updated jobdesk
    const updatedResult = await query(
      `SELECT j.*, ARRAY_AGG(ja.user_id) as assigned_to
       FROM jobdesks j
       LEFT JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
       WHERE j.id = $1
       GROUP BY j.id`,
      [jobdeskId]
    );

    const updatedJobdesk = updatedResult.rows[0];

    return NextResponse.json({
      message: 'Jobdesk updated successfully',
      jobdesk: {
        id: updatedJobdesk.id,
        title: updatedJobdesk.title,
        description: updatedJobdesk.description,
        status: updatedJobdesk.status,
        priority: updatedJobdesk.priority,
        dueDate: updatedJobdesk.due_date,
        submissionLink: updatedJobdesk.submission_link,
        assignedTo: updatedJobdesk.assigned_to.filter(id => id !== null),
        createdBy: updatedJobdesk.created_by,
        createdAt: updatedJobdesk.created_at,
        updatedAt: updatedJobdesk.updated_at
      }
    });
  } catch (error) {
    console.error('Update jobdesk error:', error);
    return NextResponse.json(
      { error: 'Failed to update jobdesk' },
      { status: 500 }
    );
  }
}

// Delete jobdesk
async function handleDeleteJobdesk(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if jobdesk exists
    const jobdeskResult = await query('SELECT * FROM jobdesks WHERE id = $1', [jobdeskId]);
    if (jobdeskResult.rows.length === 0) {
      return NextResponse.json({ error: 'Jobdesk not found' }, { status: 404 });
    }

    // Get and delete attachment files
    const attachmentsResult = await query(
      'SELECT url FROM attachments WHERE jobdesk_id = $1',
      [jobdeskId]
    );

    for (const attachment of attachmentsResult.rows) {
      try {
        const filePath = path.join(process.cwd(), 'public', attachment.url);
        await fs.unlink(filePath);
      } catch (err) {
        console.error('Failed to delete attachment file:', err);
      }
    }

    // Delete jobdesk (cascade will delete assignments and attachments)
    await query('DELETE FROM jobdesks WHERE id = $1', [jobdeskId]);

    return NextResponse.json({
      message: 'Jobdesk deleted successfully',
      deletedJobdeskId: jobdeskId
    });
  } catch (error) {
    console.error('Delete jobdesk error:', error);
    return NextResponse.json(
      { error: 'Failed to delete jobdesk' },
      { status: 500 }
    );
  }
}

// ============================================
// JOBDESK SUBMISSIONS ENDPOINTS
// ============================================

// Get submissions for a jobdesk
async function handleGetJobdeskSubmissions(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check access - user must be assigned to jobdesk or be admin
    const isAdmin = hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm']);
    if (!isAdmin) {
      const assignmentCheck = await query(
        'SELECT 1 FROM jobdesk_assignments WHERE jobdesk_id = $1 AND user_id = $2',
        [jobdeskId, user.userId]
      );
      if (assignmentCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const result = await query(`
      SELECT js.*, u.name as submitted_by_name
      FROM jobdesk_submissions js
      LEFT JOIN users u ON u.id = js.submitted_by
      WHERE js.jobdesk_id = $1
      ORDER BY js.task_type ASC NULLS LAST, js.created_at DESC
    `, [jobdeskId]);

    const submissions = result.rows.map(s => ({
      id: s.id,
      jobdeskId: s.jobdesk_id,
      submittedBy: s.submitted_by,
      submittedByName: s.submitted_by_name,
      submissionType: s.submission_type,
      title: s.title,
      content: s.content,
      fileName: s.file_name,
      fileSize: s.file_size,
      mimeType: s.mime_type,
      taskType: s.task_type,
      notes: s.notes,
      deadline: s.deadline,
      isLate: s.is_late,
      lateDays: s.late_days,
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }));

    return NextResponse.json({ submissions });
  } catch (error) {
    console.error('Get submissions error:', error);
    return NextResponse.json(
      { error: 'Failed to get submissions' },
      { status: 500 }
    );
  }
}

// Create submission for a jobdesk
async function handleCreateJobdeskSubmission(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is assigned to this jobdesk (or admin)
    const isAdmin = hasPermission(user.role, ['super_admin', 'owner', 'pengurus']);
    if (!isAdmin && user.role === 'karyawan') {
      const assignmentCheck = await query(
        'SELECT 1 FROM jobdesk_assignments WHERE jobdesk_id = $1 AND user_id = $2',
        [jobdeskId, user.userId]
      );
      if (assignmentCheck.rows.length === 0) {
        return NextResponse.json({ error: 'You are not assigned to this jobdesk' }, { status: 403 });
      }
    }

    const body = await request.json();
    const { submissionType, title, content, fileName, fileSize, mimeType, taskType, notes } = body;

    if (!submissionType || !['link', 'file', 'note'].includes(submissionType)) {
      return NextResponse.json(
        { error: 'Invalid submission type. Must be link, file, or note.' },
        { status: 400 }
      );
    }

    // Get jobdesk period info for deadline calculation
    const jobdeskResult = await query(
      'SELECT period_month, period_year FROM jobdesks WHERE id = $1',
      [jobdeskId]
    );

    let deadline = null;
    let isLate = false;
    let lateDays = 0;

    // Calculate deadline if task type and period exist
    if (taskType && jobdeskResult.rows.length > 0) {
      const { period_month, period_year } = jobdeskResult.rows[0];

      if (period_month && period_year) {
        // Import deadline calculation logic inline
        // PPh types: deadline tgl 20 bulan berikutnya
        // PPN: deadline tgl 28 + 7 hari bulan berikutnya
        let nextMonth = period_month + 1;
        let nextYear = period_year;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear++;
        }

        if (taskType === 'ppn') {
          // PPN: Tanggal 28 + 7 hari di bulan berikutnya
          const startDate = new Date(nextYear, nextMonth - 1, 28);
          startDate.setDate(startDate.getDate() + 7);
          deadline = startDate;
        } else {
          // PPh types: Tanggal 20 bulan berikutnya
          deadline = new Date(nextYear, nextMonth - 1, 20);
        }

        // Check if submission is late
        const now = new Date();
        const deadlineEnd = new Date(deadline);
        deadlineEnd.setHours(23, 59, 59, 999);

        if (now > deadlineEnd) {
          isLate = true;
          const diffTime = now.getTime() - deadlineEnd.getTime();
          lateDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
      }
    }

    const result = await query(`
      INSERT INTO jobdesk_submissions (jobdesk_id, submitted_by, submission_type, title, content, file_name, file_size, mime_type, task_type, notes, deadline, is_late, late_days)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      jobdeskId,
      user.userId,
      submissionType,
      title || null,
      content || null,
      fileName || null,
      fileSize || null,
      mimeType || null,
      taskType || null,
      notes || null,
      deadline,
      isLate,
      lateDays
    ]);

    const s = result.rows[0];
    return NextResponse.json({
      message: 'Submission created successfully',
      submission: {
        id: s.id,
        jobdeskId: s.jobdesk_id,
        submittedBy: s.submitted_by,
        submissionType: s.submission_type,
        title: s.title,
        content: s.content,
        fileName: s.file_name,
        fileSize: s.file_size,
        mimeType: s.mime_type,
        taskType: s.task_type,
        notes: s.notes,
        deadline: s.deadline,
        isLate: s.is_late,
        lateDays: s.late_days,
        createdAt: s.created_at
      }
    });
  } catch (error) {
    console.error('Create submission error:', error);
    return NextResponse.json(
      { error: 'Failed to create submission' },
      { status: 500 }
    );
  }
}

// Delete submission
async function handleDeleteJobdeskSubmission(request, submissionId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if submission exists and user owns it (or is admin)
    const submissionResult = await query(
      'SELECT * FROM jobdesk_submissions WHERE id = $1',
      [submissionId]
    );

    if (submissionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const submission = submissionResult.rows[0];
    const isAdmin = hasPermission(user.role, ['super_admin', 'owner', 'pengurus']);
    const isOwner = submission.submitted_by === user.userId;

    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // If it's a file, delete the file from filesystem
    if (submission.submission_type === 'file' && submission.content) {
      try {
        const filePath = path.join(process.cwd(), 'public', submission.content);
        await fs.unlink(filePath);
      } catch (err) {
        console.error('Failed to delete submission file:', err);
      }
    }

    await query('DELETE FROM jobdesk_submissions WHERE id = $1', [submissionId]);

    return NextResponse.json({
      message: 'Submission deleted successfully',
      deletedSubmissionId: submissionId
    });
  } catch (error) {
    console.error('Delete submission error:', error);
    return NextResponse.json(
      { error: 'Failed to delete submission' },
      { status: 500 }
    );
  }
}

// Upload file submission for a jobdesk
async function handleUploadSubmissionFile(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is assigned to this jobdesk (or admin)
    const isAdmin = hasPermission(user.role, ['super_admin', 'owner', 'pengurus']);
    if (!isAdmin && user.role === 'karyawan') {
      const assignmentCheck = await query(
        'SELECT 1 FROM jobdesk_assignments WHERE jobdesk_id = $1 AND user_id = $2',
        [jobdeskId, user.userId]
      );
      if (assignmentCheck.rows.length === 0) {
        return NextResponse.json({ error: 'You are not assigned to this jobdesk' }, { status: 403 });
      }
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const taskType = formData.get('taskType') || null;
    const notes = formData.get('notes') || null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Create uploads directory if not exists
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'submissions');
    await fs.mkdir(uploadsDir, { recursive: true });

    // Generate unique filename
    const fileExt = path.extname(file.name);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}${fileExt}`;
    const filePath = path.join(uploadsDir, fileName);
    const publicPath = `/uploads/submissions/${fileName}`;

    // Write file to disk
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await fs.writeFile(filePath, buffer);

    // Get task type label for title
    const taskTypeLabels = {
      'pph_21': 'PPh 21',
      'pph_unifikasi': 'PPh Unifikasi',
      'pph_25': 'PPh 25 Angsuran',
      'ppn': 'PPN',
      'pph_badan': 'PPh Badan',
      'pph_05': 'PPh 0,5%'
    };
    const title = taskType ? taskTypeLabels[taskType] || taskType : 'Upload File';

    // Calculate deadline based on task type and jobdesk period
    let deadline = null;
    let isLate = false;
    let lateDays = 0;

    if (taskType) {
      // Get jobdesk period
      const jobdeskResult = await query(
        'SELECT period_month, period_year FROM jobdesks WHERE id = $1',
        [jobdeskId]
      );

      if (jobdeskResult.rows.length > 0 && jobdeskResult.rows[0].period_month && jobdeskResult.rows[0].period_year) {
        const { period_month, period_year } = jobdeskResult.rows[0];

        // Calculate next month
        let nextMonth = period_month + 1;
        let nextYear = period_year;
        if (nextMonth > 12) {
          nextMonth = 1;
          nextYear++;
        }

        // Calculate deadline based on task type
        if (taskType === 'ppn') {
          // PPN: Tanggal 28 + 7 hari di bulan berikutnya
          const startDate = new Date(nextYear, nextMonth - 1, 28);
          startDate.setDate(startDate.getDate() + 7);
          deadline = startDate;
        } else {
          // PPh types: Tanggal 20 bulan berikutnya
          deadline = new Date(nextYear, nextMonth - 1, 20);
        }

        // Check if submission is late
        const now = new Date();
        const deadlineEndOfDay = new Date(deadline);
        deadlineEndOfDay.setHours(23, 59, 59, 999);

        if (now > deadlineEndOfDay) {
          isLate = true;
          const diffTime = now.getTime() - deadlineEndOfDay.getTime();
          lateDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
      }
    }

    // Insert into database
    const result = await query(`
      INSERT INTO jobdesk_submissions (jobdesk_id, submitted_by, submission_type, title, content, file_name, file_size, mime_type, task_type, notes, deadline, is_late, late_days)
      VALUES ($1, $2, 'file', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `, [
      jobdeskId,
      user.userId,
      title,
      publicPath,
      file.name,
      file.size,
      file.type,
      taskType,
      notes,
      deadline,
      isLate,
      lateDays
    ]);

    const s = result.rows[0];
    return NextResponse.json({
      message: 'File uploaded successfully',
      submission: {
        id: s.id,
        jobdeskId: s.jobdesk_id,
        submittedBy: s.submitted_by,
        submissionType: s.submission_type,
        title: s.title,
        content: s.content,
        fileName: s.file_name,
        fileSize: s.file_size,
        mimeType: s.mime_type,
        taskType: s.task_type,
        notes: s.notes,
        deadline: s.deadline,
        isLate: s.is_late,
        lateDays: s.late_days,
        createdAt: s.created_at
      }
    });
  } catch (error) {
    console.error('Upload submission file error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}

// Get single jobdesk with full details (including submissions count)
async function handleGetJobdeskDetail(request, jobdeskId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check access
    const isAdmin = hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm']);
    if (!isAdmin) {
      const assignmentCheck = await query(
        'SELECT 1 FROM jobdesk_assignments WHERE jobdesk_id = $1 AND user_id = $2',
        [jobdeskId, user.userId]
      );
      if (assignmentCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const result = await query(`
      SELECT j.*,
             c.name as client_name, c.npwp as client_npwp, c.is_pkp, c.is_umkm,
             c.address as client_address, c.contact_person, c.phone as client_phone, c.email as client_email,
             ARRAY_AGG(DISTINCT ja.user_id) as assigned_to,
             (SELECT COUNT(*) FROM jobdesk_submissions WHERE jobdesk_id = j.id) as submission_count
      FROM jobdesks j
      LEFT JOIN clients c ON c.id = j.client_id
      LEFT JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
      WHERE j.id = $1
      GROUP BY j.id, c.id
    `, [jobdeskId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Jobdesk not found' }, { status: 404 });
    }

    const j = result.rows[0];

    // Get assigned user names
    const assignedUserIds = j.assigned_to ? j.assigned_to.filter(id => id !== null) : [];
    let assignedUsers = [];
    if (assignedUserIds.length > 0) {
      const usersResult = await query(
        'SELECT id, name, email FROM users WHERE id = ANY($1)',
        [assignedUserIds]
      );
      assignedUsers = usersResult.rows;
    }

    return NextResponse.json({
      jobdesk: {
        id: j.id,
        title: j.title,
        description: j.description,
        status: j.status,
        priority: j.priority,
        dueDate: j.due_date,
        submissionLink: j.submission_link,
        createdBy: j.created_by,
        assignedTo: assignedUserIds,
        assignedUsers: assignedUsers,
        clientId: j.client_id,
        client: j.client_id ? {
          id: j.client_id,
          name: j.client_name,
          npwp: j.client_npwp,
          isPkp: j.is_pkp,
          isUmkm: j.is_umkm,
          address: j.client_address,
          contactPerson: j.contact_person,
          phone: j.client_phone,
          email: j.client_email
        } : null,
        periodMonth: j.period_month,
        periodYear: j.period_year,
        taskTypes: j.task_types || [],
        submissionCount: parseInt(j.submission_count) || 0,
        createdAt: j.created_at,
        updatedAt: j.updated_at
      }
    });
  } catch (error) {
    console.error('Get jobdesk detail error:', error);
    return NextResponse.json(
      { error: 'Failed to get jobdesk detail' },
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

    let queryText = 'SELECT * FROM daily_logs WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // If karyawan, only show own logs
    if (user.role === 'karyawan') {
      queryText += ` AND user_id = $${paramIndex++}`;
      params.push(user.userId);
    } else if (userId) {
      queryText += ` AND user_id = $${paramIndex++}`;
      params.push(userId);
    }

    if (startDate && endDate) {
      queryText += ` AND date >= $${paramIndex++} AND date <= $${paramIndex++}`;
      params.push(startDate, endDate);
    }

    queryText += ' ORDER BY date DESC';

    const result = await query(queryText, params);

    const logs = result.rows.map(log => ({
      id: log.id,
      userId: log.user_id,
      jobdeskId: log.jobdesk_id,
      activity: log.activity,
      notes: log.activity, // alias for compatibility
      hoursSpent: parseFloat(log.hours_spent),
      date: log.date,
      createdAt: log.created_at
    }));

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

    const result = await query(
      `INSERT INTO daily_logs (user_id, jobdesk_id, activity, hours_spent, date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user.userId, jobdeskId, notes, hoursSpent || 0, date ? new Date(date) : new Date()]
    );

    const log = result.rows[0];

    return NextResponse.json({
      message: 'Daily log created successfully',
      log: {
        id: log.id,
        userId: log.user_id,
        jobdeskId: log.jobdesk_id,
        notes: log.activity,
        hoursSpent: parseFloat(log.hours_spent),
        date: log.date,
        createdAt: log.created_at
      }
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
    if (userId !== user.userId && !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Calculate date range
    let dateStart, dateEnd;
    if (startDate && endDate) {
      dateStart = new Date(startDate);
      dateEnd = new Date(endDate);
      dateEnd.setHours(23, 59, 59, 999);
    } else {
      const now = new Date();
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
      dateEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      dateEnd.setHours(23, 59, 59, 999);
    }

    // Get completed jobdesks count
    const completedResult = await query(
      `SELECT COUNT(DISTINCT j.id) as count
       FROM jobdesks j
       JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
       WHERE ja.user_id = $1 AND j.status = 'completed'
       AND j.updated_at >= $2 AND j.updated_at <= $3`,
      [userId, dateStart, dateEnd]
    );
    const completedJobdesks = parseInt(completedResult.rows[0].count);

    // Get total jobdesks count
    const totalResult = await query(
      `SELECT COUNT(DISTINCT j.id) as count
       FROM jobdesks j
       JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
       WHERE ja.user_id = $1`,
      [userId]
    );
    const totalJobdesks = parseInt(totalResult.rows[0].count);

    // Get daily logs stats
    const logsResult = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(hours_spent), 0) as total_hours
       FROM daily_logs
       WHERE user_id = $1 AND date >= $2 AND date <= $3`,
      [userId, dateStart, dateEnd]
    );
    const totalLogs = parseInt(logsResult.rows[0].count);
    const totalHours = parseFloat(logsResult.rows[0].total_hours);

    // Calculate KPI score
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
          startDate: dateStart,
          endDate: dateEnd
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
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query(
      `SELECT id, email, name, role, division_id, is_active, profile_photo, created_at, updated_at
       FROM users
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );

    const users = result.rows.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      divisionId: u.division_id,
      isActive: u.is_active,
      profilePhoto: u.profile_photo,
      createdAt: u.created_at,
      updatedAt: u.updated_at
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Failed to get users' },
      { status: 500 }
    );
  }
}

// Get users list (minimal data - accessible by all logged-in users)
async function handleGetUsersList(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await query(
      `SELECT id, name, email, role
       FROM users
       WHERE is_active = TRUE
       ORDER BY name ASC`
    );

    const users = result.rows.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role
    }));

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Get users list error:', error);
    return NextResponse.json(
      { error: 'Failed to get users list' },
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

    const result = await query(
      `SELECT * FROM todos WHERE user_id = $1 ORDER BY created_at DESC`,
      [user.userId]
    );

    const todos = result.rows.map(todo => ({
      id: todo.id,
      userId: todo.user_id,
      jobdeskId: todo.jobdesk_id,
      title: todo.title,
      description: todo.description,
      status: todo.status,
      priority: todo.priority,
      dueDate: todo.due_date,
      order: todo.order,
      createdAt: todo.created_at,
      updatedAt: todo.updated_at
    }));

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
    const { title, description, priority, dueDate, jobdeskId, status } = body;

    if (!title) {
      return NextResponse.json(
        { error: 'Title required' },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO todos (user_id, title, description, status, priority, due_date, jobdesk_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user.userId, title, description || '', status || 'pending', priority || 'medium', dueDate ? new Date(dueDate) : null, jobdeskId || null]
    );

    const todo = result.rows[0];

    return NextResponse.json({
      message: 'Todo created successfully',
      todo: {
        id: todo.id,
        userId: todo.user_id,
        title: todo.title,
        description: todo.description,
        status: todo.status,
        priority: todo.priority,
        dueDate: todo.due_date,
        jobdeskId: todo.jobdesk_id,
        createdAt: todo.created_at,
        updatedAt: todo.updated_at
      }
    });
  } catch (error) {
    console.error('Create todo error:', error);
    return NextResponse.json(
      { error: 'Failed to create todo' },
      { status: 500 }
    );
  }
}

// Convert todo to daily log
async function handleConvertTodoToLog(request, todoId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { hoursSpent } = body;

    if (!hoursSpent || hoursSpent <= 0) {
      return NextResponse.json(
        { error: 'Hours spent must be greater than 0' },
        { status: 400 }
      );
    }

    // Get todo
    const todoResult = await query(
      'SELECT * FROM todos WHERE id = $1 AND user_id = $2',
      [todoId, user.userId]
    );

    if (todoResult.rows.length === 0) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    const todo = todoResult.rows[0];

    if (!todo.jobdesk_id) {
      return NextResponse.json(
        { error: 'Todo must have a jobdesk to convert' },
        { status: 400 }
      );
    }

    if (todo.status !== 'done' && todo.status !== 'completed') {
      return NextResponse.json(
        { error: 'Todo must be in done status to convert' },
        { status: 400 }
      );
    }

    // Create daily log
    const logResult = await query(
      `INSERT INTO daily_logs (user_id, jobdesk_id, activity, hours_spent, date)
       VALUES ($1, $2, $3, $4, CURRENT_DATE)
       RETURNING *`,
      [user.userId, todo.jobdesk_id, `**[From To-Do]** ${todo.title}\n\n${todo.description || 'No description'}`, parseFloat(hoursSpent)]
    );

    const dailyLog = logResult.rows[0];

    return NextResponse.json({
      message: 'Todo converted to log successfully',
      log: {
        id: dailyLog.id,
        userId: dailyLog.user_id,
        jobdeskId: dailyLog.jobdesk_id,
        notes: dailyLog.activity,
        hoursSpent: parseFloat(dailyLog.hours_spent),
        date: dailyLog.date,
        createdAt: dailyLog.created_at
      }
    });
  } catch (error) {
    console.error('Convert todo to log error:', error);
    return NextResponse.json(
      { error: 'Failed to convert todo to log' },
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

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (title) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (priority) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(priority);
    }
    if (dueDate !== undefined) {
      updates.push(`due_date = $${paramIndex++}`);
      values.push(dueDate ? new Date(dueDate) : null);
    }

    if (updates.length > 0) {
      values.push(todoId, user.userId);
      await query(
        `UPDATE todos SET ${updates.join(', ')} WHERE id = $${paramIndex++} AND user_id = $${paramIndex}`,
        values
      );
    }

    return NextResponse.json({ message: 'Todo updated successfully' });
  } catch (error) {
    console.error('Update todo error:', error);
    return NextResponse.json(
      { error: 'Failed to update todo' },
      { status: 500 }
    );
  }
}

// Delete todo
async function handleDeleteTodo(request, todoId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if todo exists and belongs to user
    const result = await query(
      'SELECT id FROM todos WHERE id = $1 AND user_id = $2',
      [todoId, user.userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    await query('DELETE FROM todos WHERE id = $1', [todoId]);

    return NextResponse.json({
      message: 'Todo deleted successfully',
      deletedId: todoId
    });
  } catch (error) {
    console.error('Delete todo error:', error);
    return NextResponse.json(
      { error: 'Failed to delete todo' },
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

    const result = await query(
      `SELECT cr.*, ARRAY_AGG(crm.user_id) as members
       FROM chat_rooms cr
       JOIN chat_room_members crm ON crm.room_id = cr.id
       WHERE cr.id IN (
         SELECT room_id FROM chat_room_members WHERE user_id = $1
       )
       GROUP BY cr.id
       ORDER BY cr.updated_at DESC`,
      [user.userId]
    );

    const rooms = result.rows.map(room => ({
      id: room.id,
      name: room.name,
      type: room.type,
      members: room.members.filter(id => id !== null),
      createdBy: room.created_by,
      createdAt: room.created_at,
      updatedAt: room.updated_at
    }));

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

    const room = await transaction(async (client) => {
      // Create room
      const roomResult = await client.query(
        `INSERT INTO chat_rooms (name, type, created_by)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [name, type || 'group', user.userId]
      );

      const newRoom = roomResult.rows[0];

      // Add members (including creator)
      const allMembers = [...new Set([...members, user.userId])];
      for (const memberId of allMembers) {
        await client.query(
          `INSERT INTO chat_room_members (room_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [newRoom.id, memberId]
        );
      }

      return {
        ...newRoom,
        members: allMembers
      };
    });

    return NextResponse.json({
      message: 'Chat room created successfully',
      room: {
        id: room.id,
        name: room.name,
        type: room.type,
        members: room.members,
        createdBy: room.created_by,
        createdAt: room.created_at,
        updatedAt: room.updated_at
      }
    });
  } catch (error) {
    console.error('Create chat room error:', error);
    return NextResponse.json(
      { error: 'Failed to create chat room' },
      { status: 500 }
    );
  }
}

// Update chat room (Super Admin only)
async function handleUpdateChatRoom(request, roomId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, members } = body;

    if (!name || !members || members.length === 0) {
      return NextResponse.json(
        { error: 'Name and members required' },
        { status: 400 }
      );
    }

    // Check if room exists
    const roomResult = await query('SELECT * FROM chat_rooms WHERE id = $1', [roomId]);
    if (roomResult.rows.length === 0) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }

    await transaction(async (client) => {
      // Update room name
      await client.query(
        'UPDATE chat_rooms SET name = $1 WHERE id = $2',
        [name, roomId]
      );

      // Update members
      await client.query('DELETE FROM chat_room_members WHERE room_id = $1', [roomId]);

      const uniqueMembers = [...new Set(members)];
      for (const memberId of uniqueMembers) {
        await client.query(
          `INSERT INTO chat_room_members (room_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [roomId, memberId]
        );
      }
    });

    // Get updated room
    const updatedResult = await query(
      `SELECT cr.*, ARRAY_AGG(crm.user_id) as members
       FROM chat_rooms cr
       JOIN chat_room_members crm ON crm.room_id = cr.id
       WHERE cr.id = $1
       GROUP BY cr.id`,
      [roomId]
    );

    const updatedRoom = updatedResult.rows[0];

    return NextResponse.json({
      message: 'Room updated successfully',
      room: {
        id: updatedRoom.id,
        name: updatedRoom.name,
        type: updatedRoom.type,
        members: updatedRoom.members.filter(id => id !== null),
        createdBy: updatedRoom.created_by,
        createdAt: updatedRoom.created_at,
        updatedAt: updatedRoom.updated_at
      }
    });
  } catch (error) {
    console.error('Update room error:', error);
    return NextResponse.json(
      { error: 'Failed to update room' },
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

    // Check if user is member of the room
    const memberResult = await query(
      'SELECT * FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, user.userId]
    );

    if (memberResult.rows.length === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

    const result = await query(
      `SELECT cm.*, u.email as user_email, u.name as user_name
       FROM chat_messages cm
       LEFT JOIN users u ON u.id = cm.user_id
       WHERE cm.room_id = $1
       ORDER BY cm.created_at DESC
       LIMIT $2`,
      [roomId, limit]
    );

    const messages = result.rows.reverse().map(msg => ({
      id: msg.id,
      roomId: msg.room_id,
      userId: msg.user_id,
      userEmail: msg.user_email,
      userName: msg.user_name,
      content: msg.content,
      createdAt: msg.created_at
    }));

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

    // Check if user is member of the room
    const memberResult = await query(
      'SELECT * FROM chat_room_members WHERE room_id = $1 AND user_id = $2',
      [roomId, user.userId]
    );

    if (memberResult.rows.length === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query(
      `INSERT INTO chat_messages (room_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [roomId, user.userId, content]
    );

    // Update room's last activity
    await query(
      'UPDATE chat_rooms SET updated_at = NOW() WHERE id = $1',
      [roomId]
    );

    const message = result.rows[0];

    return NextResponse.json({
      message: 'Message sent successfully',
      data: {
        id: message.id,
        roomId: message.room_id,
        userId: message.user_id,
        userEmail: user.email,
        content: message.content,
        createdAt: message.created_at
      }
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

    const result = await query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [user.userId]
    );

    const notifications = result.rows.map(n => ({
      id: n.id,
      userId: n.user_id,
      title: n.title,
      message: n.message,
      type: n.type,
      read: n.read,
      data: n.data,
      createdAt: n.created_at
    }));

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

    await query(
      'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
      [notificationId, user.userId]
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

    // Check if jobdesk exists and user has access
    const jobdeskResult = await query(
      `SELECT j.*, ARRAY_AGG(ja.user_id) as assigned_to
       FROM jobdesks j
       LEFT JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
       WHERE j.id = $1
       GROUP BY j.id`,
      [jobdeskId]
    );

    if (jobdeskResult.rows.length === 0) {
      return NextResponse.json({ error: 'Jobdesk not found' }, { status: 404 });
    }

    const jobdesk = jobdeskResult.rows[0];
    const assignedTo = jobdesk.assigned_to.filter(id => id !== null);

    const hasAccess =
      assignedTo.includes(user.userId) ||
      hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm']);

    if (!hasAccess) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query(
      `SELECT a.*, u.name as uploader_name, u.email as uploader_email
       FROM attachments a
       LEFT JOIN users u ON u.id = a.uploaded_by
       WHERE a.jobdesk_id = $1
       ORDER BY a.created_at DESC`,
      [jobdeskId]
    );

    const attachments = result.rows.map(att => ({
      id: att.id,
      jobdeskId: att.jobdesk_id,
      type: att.type,
      name: att.name,
      url: att.url,
      size: att.size,
      userId: att.uploaded_by,
      uploaderName: att.uploader_name || 'Unknown',
      uploaderEmail: att.uploader_email || '',
      createdAt: att.created_at
    }));

    return NextResponse.json({ attachments });
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

    // Check if jobdesk exists and user has access
    const jobdeskResult = await query(
      `SELECT j.*, ARRAY_AGG(ja.user_id) as assigned_to
       FROM jobdesks j
       LEFT JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
       WHERE j.id = $1
       GROUP BY j.id`,
      [jobdeskId]
    );

    if (jobdeskResult.rows.length === 0) {
      return NextResponse.json({ error: 'Jobdesk not found' }, { status: 404 });
    }

    const jobdesk = jobdeskResult.rows[0];
    const assignedTo = jobdesk.assigned_to.filter(id => id !== null);

    const canUpload =
      assignedTo.includes(user.userId) ||
      hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm']);

    if (!canUpload) {
      return NextResponse.json({
        error: 'Only assigned users or managers can upload attachments'
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

    const result = await query(
      `INSERT INTO attachments (jobdesk_id, type, name, url, size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [jobdeskId, type, fileName || url, url || null, fileSize || null, user.userId]
    );

    const attachment = result.rows[0];

    // Send notification to pengurus
    const pengurusResult = await query(
      `SELECT id FROM users WHERE role IN ('pengurus', 'super_admin')`
    );

    for (const pengurus of pengurusResult.rows) {
      await query(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES ($1, $2, $3, $4)`,
        [pengurus.id, 'Lampiran Baru', `${user.email} menambahkan lampiran di jobdesk: ${jobdesk.title}`, 'attachment_added']
      );

      try {
        sendNotification(pengurus.id, {
          type: 'attachment_added',
          title: 'Lampiran Baru',
          message: `${user.email} menambahkan lampiran di jobdesk: ${jobdesk.title}`
        });
      } catch (err) {
        console.error('Socket notification error:', err);
      }
    }

    return NextResponse.json({
      message: 'Attachment added successfully',
      attachment: {
        id: attachment.id,
        jobdeskId: attachment.jobdesk_id,
        type: attachment.type,
        name: attachment.name,
        url: attachment.url,
        size: attachment.size,
        userId: attachment.uploaded_by,
        createdAt: attachment.created_at
      }
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

    const result = await query(
      'SELECT * FROM attachments WHERE id = $1',
      [attachmentId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }

    const attachment = result.rows[0];

    // Check permission
    const canDelete =
      attachment.uploaded_by === user.userId ||
      hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm']);

    if (!canDelete) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await query('DELETE FROM attachments WHERE id = $1', [attachmentId]);

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
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, role, divisionId } = body;

    // Check if email already exists (excluding current user)
    if (email) {
      const existingResult = await query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, userId]
      );
      if (existingResult.rows.length > 0) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (email) {
      updates.push(`email = $${paramIndex++}`);
      values.push(email);
    }
    if (role) {
      updates.push(`role = $${paramIndex++}`);
      values.push(role);
    }
    if (divisionId !== undefined) {
      updates.push(`division_id = $${paramIndex++}`);
      values.push(divisionId);
    }

    if (updates.length > 0) {
      values.push(userId);
      await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    }

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
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { isActive } = body;

    await query(
      'UPDATE users SET is_active = $1 WHERE id = $2',
      [isActive, userId]
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

    // Prevent deleting yourself
    if (user.userId === userId) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
    }

    // Check if user exists
    const existingUser = await query('SELECT id FROM users WHERE id = $1', [userId]);
    if (existingUser.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Hard delete with cascade handling
    // First, set NULL for tables that reference this user without ON DELETE CASCADE
    await query('UPDATE divisions SET created_by = NULL WHERE created_by = $1', [userId]);
    await query('UPDATE jobdesks SET created_by = NULL WHERE created_by = $1', [userId]);
    await query('UPDATE chat_rooms SET created_by = NULL WHERE created_by = $1', [userId]);
    await query('UPDATE attachments SET uploaded_by = NULL WHERE uploaded_by = $1', [userId]);

    // Tables with ON DELETE CASCADE will be handled automatically:
    // - jobdesk_assignments, daily_logs, todos, chat_room_members, notifications

    // Now delete the user
    await query('DELETE FROM users WHERE id = $1', [userId]);

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
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { divisionId } = body;

    await query(
      'UPDATE users SET division_id = $1 WHERE id = $2',
      [divisionId, userId]
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

// Update user password
async function handleUpdateUserPassword(request, userId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { newPassword } = body;

    if (!newPassword || newPassword.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if user exists
    const userResult = await query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );

    return NextResponse.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Update user password error:', error);
    return NextResponse.json(
      { error: 'Failed to update password' },
      { status: 500 }
    );
  }
}

// ============================================
// PWA ENDPOINTS
// ============================================

// Get VAPID public key
async function handleGetVapidKey(request) {
  try {
    const publicKey = getVapidPublicKey();
    return NextResponse.json({ publicKey });
  } catch (error) {
    console.error('Get VAPID key error:', error);
    return NextResponse.json(
      { error: 'Failed to get VAPID key' },
      { status: 500 }
    );
  }
}

// Save push subscription
async function handleSavePushSubscription(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { subscription } = body;

    if (!subscription || !subscription.endpoint) {
      return NextResponse.json(
        { error: 'Invalid subscription object' },
        { status: 400 }
      );
    }

    // Store subscription in user record
    await query(
      'UPDATE users SET push_subscription = $1 WHERE id = $2',
      [JSON.stringify(subscription), user.userId]
    );

    console.log('[PWA] Push subscription saved for user:', user.userId);

    return NextResponse.json({
      message: 'Subscription saved successfully',
      subscribed: true
    });
  } catch (error) {
    console.error('Save push subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to save subscription' },
      { status: 500 }
    );
  }
}

// Remove push subscription
async function handleRemovePushSubscription(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    await query(
      'UPDATE users SET push_subscription = NULL WHERE id = $1',
      [user.userId]
    );

    console.log('[PWA] Push subscription removed for user:', user.userId);

    return NextResponse.json({
      message: 'Subscription removed successfully',
      subscribed: false
    });
  } catch (error) {
    console.error('Remove push subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to remove subscription' },
      { status: 500 }
    );
  }
}

// Send push notification
async function handleSendPushNotification(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { userIds, title, body: notifBody, url, data } = body;

    if (!title || !notifBody) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 }
      );
    }

    let queryText = 'SELECT id, push_subscription FROM users WHERE push_subscription IS NOT NULL';
    const params = [];

    if (userIds && userIds.length > 0) {
      queryText += ' AND id = ANY($1)';
      params.push(userIds);
    }

    const result = await query(queryText, params);

    if (result.rows.length === 0) {
      return NextResponse.json({
        message: 'No subscriptions found',
        sent: 0,
        failed: 0
      });
    }

    const subscriptions = result.rows.map(row => ({
      userId: row.id,
      subscription: typeof row.push_subscription === 'string'
        ? JSON.parse(row.push_subscription)
        : row.push_subscription
    }));

    const payload = {
      title,
      body: notifBody,
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-96x96.png',
      tag: `workspace-${Date.now()}`,
      data: {
        url: url || '/',
        ...data
      },
      requireInteraction: true
    };

    const results = await sendBulkPushNotifications(subscriptions, payload);

    return NextResponse.json({
      message: 'Notifications sent',
      sent: results.succeeded,
      failed: results.failed
    });
  } catch (error) {
    console.error('Send push notification error:', error);
    return NextResponse.json(
      { error: 'Failed to send notifications' },
      { status: 500 }
    );
  }
}

// Get offline bundle
async function handleGetOfflineBundle(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Get user's jobdesks
    const jobdesksResult = await query(
      `SELECT j.*, ARRAY_AGG(ja.user_id) as assigned_to
       FROM jobdesks j
       JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
       WHERE j.id IN (
         SELECT jobdesk_id FROM jobdesk_assignments WHERE user_id = $1
       )
       GROUP BY j.id
       ORDER BY j.updated_at DESC
       LIMIT 50`,
      [user.userId]
    );

    // Get user's chat rooms and messages
    const roomsResult = await query(
      `SELECT cr.id FROM chat_rooms cr
       JOIN chat_room_members crm ON crm.room_id = cr.id
       WHERE crm.user_id = $1`,
      [user.userId]
    );

    const roomIds = roomsResult.rows.map(r => r.id);
    let chatMessages = [];

    if (roomIds.length > 0) {
      const messagesResult = await query(
        `SELECT * FROM chat_messages
         WHERE room_id = ANY($1)
         ORDER BY created_at DESC
         LIMIT 500`,
        [roomIds]
      );
      chatMessages = messagesResult.rows;
    }

    // Get attachments for user's jobdesks
    const jobdeskIds = jobdesksResult.rows.map(j => j.id);
    let attachments = [];

    if (jobdeskIds.length > 0) {
      const attachmentsResult = await query(
        'SELECT * FROM attachments WHERE jobdesk_id = ANY($1)',
        [jobdeskIds]
      );
      attachments = attachmentsResult.rows;
    }

    // Get users list
    const usersResult = await query(
      `SELECT id, email, name, role, division_id, profile_photo
       FROM users`
    );

    return NextResponse.json({
      jobdesks: jobdesksResult.rows,
      chatMessages,
      attachments,
      users: usersResult.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get offline bundle error:', error);
    return NextResponse.json(
      { error: 'Failed to get offline bundle' },
      { status: 500 }
    );
  }
}

// ============================================
// PROFILE MANAGEMENT
// ============================================

async function handleUploadProfilePhoto(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('photo');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, and WebP images are allowed' },
        { status: 400 }
      );
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'File size must be less than 5MB' },
        { status: 400 }
      );
    }

    // Get existing user to check for old photo
    const existingResult = await query(
      'SELECT profile_photo FROM users WHERE id = $1',
      [user.userId]
    );

    if (existingResult.rows.length > 0 && existingResult.rows[0].profile_photo) {
      const oldPhotoPath = path.join(process.cwd(), 'public', existingResult.rows[0].profile_photo);
      try {
        await fs.unlink(oldPhotoPath);
      } catch (err) {
        console.log('Old photo not found or already deleted');
      }
    }

    // Create uploads directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profiles');
    await fs.mkdir(uploadDir, { recursive: true });

    // Generate filename and save
    const ext = path.extname(file.name);
    const filename = `${user.userId}-${Date.now()}${ext}`;
    const filepath = path.join(uploadDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filepath, buffer);

    // Update database
    const photoUrl = `/uploads/profiles/${filename}`;
    await query(
      'UPDATE users SET profile_photo = $1 WHERE id = $2',
      [photoUrl, user.userId]
    );

    return NextResponse.json({
      message: 'Profile photo updated successfully',
      photoUrl
    });
  } catch (error) {
    console.error('Upload profile photo error:', error);
    return NextResponse.json(
      { error: 'Failed to upload photo' },
      { status: 500 }
    );
  }
}

async function handleGetUserProfile(request, userId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Users can only view their own profile, unless admin/pengurus
    if (user.userId !== userId && !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const profileResult = await query(
      `SELECT u.id, u.email, u.name, u.role, u.division_id, u.is_active, u.profile_photo,
              u.two_factor_enabled, u.created_at, u.updated_at,
              d.name as division_name
       FROM users u
       LEFT JOIN divisions d ON d.id = u.division_id
       WHERE u.id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const profile = profileResult.rows[0];

    // Get jobdesk statistics
    const statsResult = await query(
      `SELECT status, COUNT(*) as count
       FROM jobdesks j
       JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
       WHERE ja.user_id = $1
       GROUP BY status`,
      [userId]
    );

    const stats = {
      total: 0,
      pending: 0,
      in_progress: 0,
      completed: 0
    };

    statsResult.rows.forEach(stat => {
      stats[stat.status] = parseInt(stat.count);
      stats.total += parseInt(stat.count);
    });

    // Get recent attachments
    const attachmentsResult = await query(
      `SELECT * FROM attachments
       WHERE uploaded_by = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [userId]
    );

    return NextResponse.json({
      profile: {
        id: profile.id,
        email: profile.email,
        name: profile.name,
        role: profile.role,
        divisionId: profile.division_id,
        division: profile.division_id ? { id: profile.division_id, name: profile.division_name } : null,
        isActive: profile.is_active,
        profilePhoto: profile.profile_photo,
        twoFactorEnabled: profile.two_factor_enabled,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      },
      stats,
      recentAttachments: attachmentsResult.rows.map(att => ({
        id: att.id,
        jobdeskId: att.jobdesk_id,
        type: att.type,
        name: att.name,
        url: att.url,
        size: att.size,
        createdAt: att.created_at
      }))
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    return NextResponse.json(
      { error: 'Failed to get profile' },
      { status: 500 }
    );
  }
}

// ============================================
// CLIENT MANAGEMENT (Tax Consulting)
// ============================================

// Get all clients with assignments
async function handleGetClients(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(request.url);
    const isPkp = url.searchParams.get('is_pkp');
    const isUmkm = url.searchParams.get('is_umkm');
    const clientType = url.searchParams.get('client_type');
    const isActive = url.searchParams.get('is_active');
    const assignedTo = url.searchParams.get('assigned_to');

    let queryText = `
      SELECT c.*,
             u.name as created_by_name,
             COALESCE(
               json_agg(
                 json_build_object(
                   'userId', ca.user_id,
                   'userName', au.name,
                   'userEmail', au.email,
                   'isPrimary', ca.is_primary,
                   'assignedAt', ca.assigned_at
                 )
               ) FILTER (WHERE ca.user_id IS NOT NULL),
               '[]'
             ) as assignments
      FROM clients c
      LEFT JOIN users u ON u.id = c.created_by
      LEFT JOIN client_assignments ca ON ca.client_id = c.id
      LEFT JOIN users au ON au.id = ca.user_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // For karyawan, only show assigned clients
    if (user.role === 'karyawan') {
      queryText += ` AND c.id IN (SELECT client_id FROM client_assignments WHERE user_id = $${paramIndex})`;
      params.push(user.userId);
      paramIndex++;
    }

    if (isPkp !== null && isPkp !== '') {
      queryText += ` AND c.is_pkp = $${paramIndex}`;
      params.push(isPkp === 'true');
      paramIndex++;
    }

    if (isUmkm !== null && isUmkm !== '') {
      queryText += ` AND c.is_umkm = $${paramIndex}`;
      params.push(isUmkm === 'true');
      paramIndex++;
    }

    if (clientType) {
      queryText += ` AND c.client_type = $${paramIndex}`;
      params.push(clientType);
      paramIndex++;
    }

    if (isActive !== null && isActive !== '') {
      queryText += ` AND c.is_active = $${paramIndex}`;
      params.push(isActive === 'true');
      paramIndex++;
    }

    if (assignedTo) {
      queryText += ` AND c.id IN (SELECT client_id FROM client_assignments WHERE user_id = $${paramIndex})`;
      params.push(assignedTo);
      paramIndex++;
    }

    queryText += ' GROUP BY c.id, u.name ORDER BY c.name ASC';

    const result = await query(queryText, params);

    return NextResponse.json({
      clients: result.rows.map(c => ({
        id: c.id,
        name: c.name,
        npwp: c.npwp,
        address: c.address,
        contactPerson: c.contact_person,
        phone: c.phone,
        email: c.email,
        isPkp: c.is_pkp,
        isUmkm: c.is_umkm,
        clientType: c.client_type,
        isActive: c.is_active,
        createdBy: c.created_by,
        createdByName: c.created_by_name,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        assignments: c.assignments
      }))
    });
  } catch (error) {
    console.error('Get clients error:', error);
    return NextResponse.json(
      { error: 'Failed to get clients' },
      { status: 500 }
    );
  }
}

// Get single client by ID
async function handleGetClient(request, clientId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // For karyawan, check if assigned to this client
    if (user.role === 'karyawan') {
      const assignmentCheck = await query(
        'SELECT 1 FROM client_assignments WHERE client_id = $1 AND user_id = $2',
        [clientId, user.userId]
      );
      if (assignmentCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    const result = await query(
      `SELECT c.*,
              u.name as created_by_name,
              COALESCE(
                json_agg(
                  json_build_object(
                    'userId', ca.user_id,
                    'userName', au.name,
                    'userEmail', au.email,
                    'isPrimary', ca.is_primary,
                    'assignedAt', ca.assigned_at
                  )
                ) FILTER (WHERE ca.user_id IS NOT NULL),
                '[]'
              ) as assignments
       FROM clients c
       LEFT JOIN users u ON u.id = c.created_by
       LEFT JOIN client_assignments ca ON ca.client_id = c.id
       LEFT JOIN users au ON au.id = ca.user_id
       WHERE c.id = $1
       GROUP BY c.id, u.name`,
      [clientId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const c = result.rows[0];
    return NextResponse.json({
      client: {
        id: c.id,
        name: c.name,
        npwp: c.npwp,
        address: c.address,
        contactPerson: c.contact_person,
        phone: c.phone,
        email: c.email,
        isPkp: c.is_pkp,
        isUmkm: c.is_umkm,
        clientType: c.client_type,
        isActive: c.is_active,
        createdBy: c.created_by,
        createdByName: c.created_by_name,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        assignments: c.assignments
      }
    });
  } catch (error) {
    console.error('Get client error:', error);
    return NextResponse.json(
      { error: 'Failed to get client' },
      { status: 500 }
    );
  }
}

// Create new client
async function handleCreateClient(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, npwp, address, contactPerson, phone, email, isPkp, isUmkm, clientType } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Check duplicate NPWP if provided
    if (npwp) {
      const existingNpwp = await query(
        'SELECT id FROM clients WHERE npwp = $1',
        [npwp]
      );
      if (existingNpwp.rows.length > 0) {
        return NextResponse.json({ error: 'NPWP already registered' }, { status: 400 });
      }
    }

    const result = await query(
      `INSERT INTO clients (name, npwp, address, contact_person, phone, email, is_pkp, is_umkm, client_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, npwp || null, address || null, contactPerson || null, phone || null, email || null,
       isPkp || false, isUmkm || false, clientType || 'badan', user.userId]
    );

    const c = result.rows[0];
    return NextResponse.json({
      message: 'Client created successfully',
      client: {
        id: c.id,
        name: c.name,
        npwp: c.npwp,
        address: c.address,
        contactPerson: c.contact_person,
        phone: c.phone,
        email: c.email,
        isPkp: c.is_pkp,
        isUmkm: c.is_umkm,
        clientType: c.client_type,
        isActive: c.is_active,
        createdBy: c.created_by,
        createdAt: c.created_at
      }
    });
  } catch (error) {
    console.error('Create client error:', error);
    return NextResponse.json(
      { error: 'Failed to create client' },
      { status: 500 }
    );
  }
}

// Update client
async function handleUpdateClient(request, clientId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { name, npwp, address, contactPerson, phone, email, isPkp, isUmkm, clientType, isActive } = body;

    // Check if client exists
    const existingClient = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
    if (existingClient.rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Check duplicate NPWP if changed
    if (npwp) {
      const existingNpwp = await query(
        'SELECT id FROM clients WHERE npwp = $1 AND id != $2',
        [npwp, clientId]
      );
      if (existingNpwp.rows.length > 0) {
        return NextResponse.json({ error: 'NPWP already registered' }, { status: 400 });
      }
    }

    const result = await query(
      `UPDATE clients SET
        name = COALESCE($1, name),
        npwp = $2,
        address = $3,
        contact_person = $4,
        phone = $5,
        email = $6,
        is_pkp = COALESCE($7, is_pkp),
        is_umkm = COALESCE($8, is_umkm),
        client_type = COALESCE($9, client_type),
        is_active = COALESCE($10, is_active),
        updated_at = NOW()
       WHERE id = $11
       RETURNING *`,
      [name, npwp || null, address || null, contactPerson || null, phone || null, email || null,
       isPkp, isUmkm, clientType, isActive, clientId]
    );

    const c = result.rows[0];
    return NextResponse.json({
      message: 'Client updated successfully',
      client: {
        id: c.id,
        name: c.name,
        npwp: c.npwp,
        address: c.address,
        contactPerson: c.contact_person,
        phone: c.phone,
        email: c.email,
        isPkp: c.is_pkp,
        isUmkm: c.is_umkm,
        clientType: c.client_type,
        isActive: c.is_active,
        updatedAt: c.updated_at
      }
    });
  } catch (error) {
    console.error('Update client error:', error);
    return NextResponse.json(
      { error: 'Failed to update client' },
      { status: 500 }
    );
  }
}

// Delete client
async function handleDeleteClient(request, clientId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Check if client exists
    const existingClient = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
    if (existingClient.rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Delete related data first (assignments, tax_periods, etc.)
    await transaction(async (client) => {
      await client.query('DELETE FROM client_assignments WHERE client_id = $1', [clientId]);
      await client.query('DELETE FROM tax_periods WHERE client_id = $1', [clientId]);
      await client.query('DELETE FROM annual_tax_filings WHERE client_id = $1', [clientId]);
      await client.query('DELETE FROM warning_letters WHERE client_id = $1', [clientId]);
      await client.query('DELETE FROM sp2dk_notices WHERE client_id = $1', [clientId]);
      await client.query('DELETE FROM clients WHERE id = $1', [clientId]);
    });

    return NextResponse.json({ message: 'Client deleted successfully' });
  } catch (error) {
    console.error('Delete client error:', error);
    return NextResponse.json(
      { error: 'Failed to delete client' },
      { status: 500 }
    );
  }
}

// Assign employee to client
async function handleAssignClientEmployee(request, clientId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, isPrimary } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Check if client exists
    const clientExists = await query('SELECT id FROM clients WHERE id = $1', [clientId]);
    if (clientExists.rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    // Check if user exists
    const userExists = await query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userExists.rows.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already assigned
    const existing = await query(
      'SELECT 1 FROM client_assignments WHERE client_id = $1 AND user_id = $2',
      [clientId, userId]
    );
    if (existing.rows.length > 0) {
      return NextResponse.json({ error: 'User already assigned to this client' }, { status: 400 });
    }

    // If setting as primary, remove other primary assignments for this client
    if (isPrimary) {
      await query(
        'UPDATE client_assignments SET is_primary = false WHERE client_id = $1',
        [clientId]
      );
    }

    await query(
      `INSERT INTO client_assignments (client_id, user_id, assigned_by, is_primary)
       VALUES ($1, $2, $3, $4)`,
      [clientId, userId, user.userId, isPrimary || false]
    );

    return NextResponse.json({ message: 'Employee assigned successfully' });
  } catch (error) {
    console.error('Assign employee error:', error);
    return NextResponse.json(
      { error: 'Failed to assign employee' },
      { status: 500 }
    );
  }
}

// Remove employee from client
async function handleUnassignClientEmployee(request, clientId, userId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query(
      'DELETE FROM client_assignments WHERE client_id = $1 AND user_id = $2 RETURNING *',
      [clientId, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Employee removed from client successfully' });
  } catch (error) {
    console.error('Unassign employee error:', error);
    return NextResponse.json(
      { error: 'Failed to remove employee' },
      { status: 500 }
    );
  }
}

// Update client assignment (change primary status)
async function handleUpdateClientAssignment(request, clientId, userId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { isPrimary } = body;

    // If setting as primary, remove other primary assignments for this client
    if (isPrimary) {
      await query(
        'UPDATE client_assignments SET is_primary = false WHERE client_id = $1',
        [clientId]
      );
    }

    const result = await query(
      `UPDATE client_assignments SET is_primary = $1 WHERE client_id = $2 AND user_id = $3 RETURNING *`,
      [isPrimary || false, clientId, userId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Assignment updated successfully' });
  } catch (error) {
    console.error('Update assignment error:', error);
    return NextResponse.json(
      { error: 'Failed to update assignment' },
      { status: 500 }
    );
  }
}

// ============================================
// TAX PERIOD MANAGEMENT
// ============================================

// Helper function to generate tax period deadlines
function generateTaxPeriodDeadlines(month, year, isPkp = false) {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const lastDayOfNextMonth = new Date(nextYear, nextMonth, 0).getDate();

  const deadlines = {
    pph_payment_deadline: new Date(nextYear, nextMonth - 1, 15),
    pph_filing_deadline: new Date(nextYear, nextMonth - 1, 20),
    bookkeeping_employee_deadline: new Date(nextYear, nextMonth - 1, 25),
    bookkeeping_owner_deadline: new Date(nextYear, nextMonth - 1, Math.min(30, lastDayOfNextMonth))
  };

  if (isPkp) {
    const ppnDeadline = new Date(nextYear, nextMonth, 0);
    deadlines.ppn_payment_deadline = ppnDeadline;
    deadlines.ppn_filing_deadline = ppnDeadline;
  }

  return deadlines;
}

// Get all tax periods with filtering
async function handleGetTaxPeriods(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get('client_id');
    const month = url.searchParams.get('month');
    const year = url.searchParams.get('year');
    const status = url.searchParams.get('status'); // pending, in_progress, completed, overdue

    let queryText = `
      SELECT tp.*,
             c.name as client_name,
             c.npwp as client_npwp,
             c.is_pkp,
             c.is_umkm,
             hu.name as handled_by_name,
             au.name as authorized_by_name
      FROM tax_periods tp
      JOIN clients c ON c.id = tp.client_id
      LEFT JOIN users hu ON hu.id = tp.handled_by
      LEFT JOIN users au ON au.id = tp.authorized_by
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    // For karyawan, only show their assigned clients
    if (user.role === 'karyawan') {
      queryText += ` AND tp.client_id IN (SELECT client_id FROM client_assignments WHERE user_id = $${paramIndex})`;
      params.push(user.userId);
      paramIndex++;
    }

    if (clientId) {
      queryText += ` AND tp.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (month) {
      queryText += ` AND tp.period_month = $${paramIndex}`;
      params.push(parseInt(month));
      paramIndex++;
    }

    if (year) {
      queryText += ` AND tp.period_year = $${paramIndex}`;
      params.push(parseInt(year));
      paramIndex++;
    }

    queryText += ' ORDER BY tp.period_year DESC, tp.period_month DESC, c.name ASC';

    const result = await query(queryText, params);

    // Filter by status if requested (need to calculate overdue)
    let periods = result.rows.map(tp => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const isOverdue = (deadline, status) => {
        if (status === 'completed') return false;
        if (!deadline) return false;
        return new Date(deadline) < today;
      };

      return {
        id: tp.id,
        clientId: tp.client_id,
        clientName: tp.client_name,
        clientNpwp: tp.client_npwp,
        isPkp: tp.is_pkp,
        isUmkm: tp.is_umkm,
        periodMonth: tp.period_month,
        periodYear: tp.period_year,
        pphPaymentDeadline: tp.pph_payment_deadline,
        pphPaymentStatus: tp.pph_payment_status,
        pphPaymentOverdue: isOverdue(tp.pph_payment_deadline, tp.pph_payment_status),
        pphFilingDeadline: tp.pph_filing_deadline,
        pphFilingStatus: tp.pph_filing_status,
        pphFilingOverdue: isOverdue(tp.pph_filing_deadline, tp.pph_filing_status),
        ppnPaymentDeadline: tp.ppn_payment_deadline,
        ppnPaymentStatus: tp.ppn_payment_status,
        ppnPaymentOverdue: isOverdue(tp.ppn_payment_deadline, tp.ppn_payment_status),
        ppnFilingDeadline: tp.ppn_filing_deadline,
        ppnFilingStatus: tp.ppn_filing_status,
        ppnFilingOverdue: isOverdue(tp.ppn_filing_deadline, tp.ppn_filing_status),
        bookkeepingStatus: tp.bookkeeping_status,
        bookkeepingEmployeeDeadline: tp.bookkeeping_employee_deadline,
        bookkeepingEmployeeOverdue: isOverdue(tp.bookkeeping_employee_deadline, tp.bookkeeping_status),
        bookkeepingOwnerDeadline: tp.bookkeeping_owner_deadline,
        bookkeepingOwnerOverdue: isOverdue(tp.bookkeeping_owner_deadline, tp.bookkeeping_status),
        handledBy: tp.handled_by,
        handledByName: tp.handled_by_name,
        authorizedBy: tp.authorized_by,
        authorizedByName: tp.authorized_by_name,
        createdAt: tp.created_at,
        updatedAt: tp.updated_at
      };
    });

    // Filter by overall status if requested
    if (status) {
      periods = periods.filter(tp => {
        const hasOverdue = tp.pphPaymentOverdue || tp.pphFilingOverdue ||
          tp.ppnPaymentOverdue || tp.ppnFilingOverdue ||
          tp.bookkeepingEmployeeOverdue || tp.bookkeepingOwnerOverdue;

        const allCompleted = tp.pphPaymentStatus === 'completed' &&
          tp.pphFilingStatus === 'completed' &&
          (!tp.ppnPaymentDeadline || tp.ppnPaymentStatus === 'completed') &&
          (!tp.ppnFilingDeadline || tp.ppnFilingStatus === 'completed') &&
          tp.bookkeepingStatus === 'completed';

        if (status === 'overdue') return hasOverdue;
        if (status === 'completed') return allCompleted;
        if (status === 'pending') return !allCompleted && !hasOverdue;
        return true;
      });
    }

    return NextResponse.json({ taxPeriods: periods });
  } catch (error) {
    console.error('Get tax periods error:', error);
    return NextResponse.json(
      { error: 'Failed to get tax periods' },
      { status: 500 }
    );
  }
}

// Get single tax period
async function handleGetTaxPeriod(request, periodId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query(
      `SELECT tp.*,
              c.name as client_name,
              c.npwp as client_npwp,
              c.is_pkp,
              c.is_umkm,
              hu.name as handled_by_name,
              au.name as authorized_by_name
       FROM tax_periods tp
       JOIN clients c ON c.id = tp.client_id
       LEFT JOIN users hu ON hu.id = tp.handled_by
       LEFT JOIN users au ON au.id = tp.authorized_by
       WHERE tp.id = $1`,
      [periodId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Tax period not found' }, { status: 404 });
    }

    const tp = result.rows[0];

    // For karyawan, check if assigned to this client
    if (user.role === 'karyawan') {
      const assignmentCheck = await query(
        'SELECT 1 FROM client_assignments WHERE client_id = $1 AND user_id = $2',
        [tp.client_id, user.userId]
      );
      if (assignmentCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    return NextResponse.json({
      taxPeriod: {
        id: tp.id,
        clientId: tp.client_id,
        clientName: tp.client_name,
        clientNpwp: tp.client_npwp,
        isPkp: tp.is_pkp,
        isUmkm: tp.is_umkm,
        periodMonth: tp.period_month,
        periodYear: tp.period_year,
        pphPaymentDeadline: tp.pph_payment_deadline,
        pphPaymentStatus: tp.pph_payment_status,
        pphFilingDeadline: tp.pph_filing_deadline,
        pphFilingStatus: tp.pph_filing_status,
        ppnPaymentDeadline: tp.ppn_payment_deadline,
        ppnPaymentStatus: tp.ppn_payment_status,
        ppnFilingDeadline: tp.ppn_filing_deadline,
        ppnFilingStatus: tp.ppn_filing_status,
        bookkeepingStatus: tp.bookkeeping_status,
        bookkeepingEmployeeDeadline: tp.bookkeeping_employee_deadline,
        bookkeepingOwnerDeadline: tp.bookkeeping_owner_deadline,
        handledBy: tp.handled_by,
        handledByName: tp.handled_by_name,
        authorizedBy: tp.authorized_by,
        authorizedByName: tp.authorized_by_name,
        createdAt: tp.created_at,
        updatedAt: tp.updated_at
      }
    });
  } catch (error) {
    console.error('Get tax period error:', error);
    return NextResponse.json(
      { error: 'Failed to get tax period' },
      { status: 500 }
    );
  }
}

// Create tax period with auto-generated deadlines
async function handleCreateTaxPeriod(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, periodMonth, periodYear, customDeadlines } = body;

    if (!clientId || !periodMonth || !periodYear) {
      return NextResponse.json({ error: 'Client ID, month, and year are required' }, { status: 400 });
    }

    // Check if client exists and get PKP status
    const clientResult = await query('SELECT id, is_pkp FROM clients WHERE id = $1', [clientId]);
    if (clientResult.rows.length === 0) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    }

    const isPkp = clientResult.rows[0].is_pkp;

    // Check if period already exists
    const existingPeriod = await query(
      'SELECT id FROM tax_periods WHERE client_id = $1 AND period_month = $2 AND period_year = $3',
      [clientId, periodMonth, periodYear]
    );
    if (existingPeriod.rows.length > 0) {
      return NextResponse.json({ error: 'Tax period already exists for this client' }, { status: 400 });
    }

    // Generate deadlines (auto or custom)
    const deadlines = customDeadlines || generateTaxPeriodDeadlines(periodMonth, periodYear, isPkp);

    const result = await query(
      `INSERT INTO tax_periods (
        client_id, period_month, period_year,
        pph_payment_deadline, pph_filing_deadline,
        ppn_payment_deadline, ppn_filing_deadline,
        bookkeeping_employee_deadline, bookkeeping_owner_deadline
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        clientId, periodMonth, periodYear,
        deadlines.pph_payment_deadline,
        deadlines.pph_filing_deadline,
        deadlines.ppn_payment_deadline || null,
        deadlines.ppn_filing_deadline || null,
        deadlines.bookkeeping_employee_deadline,
        deadlines.bookkeeping_owner_deadline
      ]
    );

    return NextResponse.json({
      message: 'Tax period created successfully',
      taxPeriod: result.rows[0]
    });
  } catch (error) {
    console.error('Create tax period error:', error);
    return NextResponse.json(
      { error: 'Failed to create tax period' },
      { status: 500 }
    );
  }
}

// Generate tax periods for multiple clients (bulk)
async function handleGenerateTaxPeriods(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { periodMonth, periodYear, clientIds } = body;

    if (!periodMonth || !periodYear) {
      return NextResponse.json({ error: 'Month and year are required' }, { status: 400 });
    }

    // Get all active clients or specific clients
    let clientsQuery = 'SELECT id, is_pkp FROM clients WHERE is_active = true';
    const queryParams = [];

    if (clientIds && clientIds.length > 0) {
      clientsQuery += ' AND id = ANY($1)';
      queryParams.push(clientIds);
    }

    const clientsResult = await query(clientsQuery, queryParams);
    const clients = clientsResult.rows;

    let created = 0;
    let skipped = 0;

    for (const client of clients) {
      // Check if period already exists
      const existingPeriod = await query(
        'SELECT id FROM tax_periods WHERE client_id = $1 AND period_month = $2 AND period_year = $3',
        [client.id, periodMonth, periodYear]
      );

      if (existingPeriod.rows.length > 0) {
        skipped++;
        continue;
      }

      const deadlines = generateTaxPeriodDeadlines(periodMonth, periodYear, client.is_pkp);

      await query(
        `INSERT INTO tax_periods (
          client_id, period_month, period_year,
          pph_payment_deadline, pph_filing_deadline,
          ppn_payment_deadline, ppn_filing_deadline,
          bookkeeping_employee_deadline, bookkeeping_owner_deadline
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          client.id, periodMonth, periodYear,
          deadlines.pph_payment_deadline,
          deadlines.pph_filing_deadline,
          deadlines.ppn_payment_deadline || null,
          deadlines.ppn_filing_deadline || null,
          deadlines.bookkeeping_employee_deadline,
          deadlines.bookkeeping_owner_deadline
        ]
      );
      created++;
    }

    return NextResponse.json({
      message: `Generated ${created} tax periods, skipped ${skipped} (already exist)`,
      created,
      skipped
    });
  } catch (error) {
    console.error('Generate tax periods error:', error);
    return NextResponse.json(
      { error: 'Failed to generate tax periods' },
      { status: 500 }
    );
  }
}

// Update tax period status
async function handleUpdateTaxPeriodStatus(request, periodId) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { field, status } = body;

    const validFields = [
      'pph_payment_status', 'pph_filing_status',
      'ppn_payment_status', 'ppn_filing_status',
      'bookkeeping_status'
    ];

    if (!validFields.includes(field)) {
      return NextResponse.json({ error: 'Invalid field' }, { status: 400 });
    }

    const validStatuses = ['pending', 'in_progress', 'completed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Check permissions - karyawan can only update if assigned
    const periodResult = await query('SELECT client_id FROM tax_periods WHERE id = $1', [periodId]);
    if (periodResult.rows.length === 0) {
      return NextResponse.json({ error: 'Tax period not found' }, { status: 404 });
    }

    if (user.role === 'karyawan') {
      const assignmentCheck = await query(
        'SELECT 1 FROM client_assignments WHERE client_id = $1 AND user_id = $2',
        [periodResult.rows[0].client_id, user.userId]
      );
      if (assignmentCheck.rows.length === 0) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    // Update the status and set handled_by
    const result = await query(
      `UPDATE tax_periods SET ${field} = $1, handled_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
      [status, user.userId, periodId]
    );

    return NextResponse.json({
      message: 'Status updated successfully',
      taxPeriod: result.rows[0]
    });
  } catch (error) {
    console.error('Update tax period status error:', error);
    return NextResponse.json(
      { error: 'Failed to update status' },
      { status: 500 }
    );
  }
}

// Update tax period deadlines (manual override)
async function handleUpdateTaxPeriod(request, periodId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const {
      pphPaymentDeadline, pphFilingDeadline,
      ppnPaymentDeadline, ppnFilingDeadline,
      bookkeepingEmployeeDeadline, bookkeepingOwnerDeadline
    } = body;

    const result = await query(
      `UPDATE tax_periods SET
        pph_payment_deadline = COALESCE($1, pph_payment_deadline),
        pph_filing_deadline = COALESCE($2, pph_filing_deadline),
        ppn_payment_deadline = COALESCE($3, ppn_payment_deadline),
        ppn_filing_deadline = COALESCE($4, ppn_filing_deadline),
        bookkeeping_employee_deadline = COALESCE($5, bookkeeping_employee_deadline),
        bookkeeping_owner_deadline = COALESCE($6, bookkeeping_owner_deadline),
        updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        pphPaymentDeadline, pphFilingDeadline,
        ppnPaymentDeadline, ppnFilingDeadline,
        bookkeepingEmployeeDeadline, bookkeepingOwnerDeadline,
        periodId
      ]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Tax period not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Tax period updated successfully',
      taxPeriod: result.rows[0]
    });
  } catch (error) {
    console.error('Update tax period error:', error);
    return NextResponse.json(
      { error: 'Failed to update tax period' },
      { status: 500 }
    );
  }
}

// Delete tax period
async function handleDeleteTaxPeriod(request, periodId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query(
      'DELETE FROM tax_periods WHERE id = $1 RETURNING id',
      [periodId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Tax period not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Tax period deleted successfully' });
  } catch (error) {
    console.error('Delete tax period error:', error);
    return NextResponse.json(
      { error: 'Failed to delete tax period' },
      { status: 500 }
    );
  }
}

// Get tax monitoring dashboard stats
async function handleGetTaxMonitoringStats(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(request.url);
    const month = url.searchParams.get('month') || new Date().getMonth() + 1;
    const year = url.searchParams.get('year') || new Date().getFullYear();

    let baseCondition = '';
    const params = [month, year];

    if (user.role === 'karyawan') {
      baseCondition = ' AND tp.client_id IN (SELECT client_id FROM client_assignments WHERE user_id = $3)';
      params.push(user.userId);
    }

    const statsQuery = `
      SELECT
        COUNT(*) as total_periods,
        COUNT(*) FILTER (WHERE pph_payment_status = 'completed') as pph_payment_completed,
        COUNT(*) FILTER (WHERE pph_filing_status = 'completed') as pph_filing_completed,
        COUNT(*) FILTER (WHERE ppn_payment_status = 'completed' OR ppn_payment_deadline IS NULL) as ppn_payment_completed,
        COUNT(*) FILTER (WHERE ppn_filing_status = 'completed' OR ppn_filing_deadline IS NULL) as ppn_filing_completed,
        COUNT(*) FILTER (WHERE bookkeeping_status = 'completed') as bookkeeping_completed,
        COUNT(*) FILTER (WHERE pph_payment_deadline < NOW() AND pph_payment_status != 'completed') as pph_payment_overdue,
        COUNT(*) FILTER (WHERE pph_filing_deadline < NOW() AND pph_filing_status != 'completed') as pph_filing_overdue,
        COUNT(*) FILTER (WHERE ppn_payment_deadline < NOW() AND ppn_payment_status != 'completed') as ppn_payment_overdue,
        COUNT(*) FILTER (WHERE ppn_filing_deadline < NOW() AND ppn_filing_status != 'completed') as ppn_filing_overdue,
        COUNT(*) FILTER (WHERE bookkeeping_employee_deadline < NOW() AND bookkeeping_status != 'completed') as bookkeeping_overdue
      FROM tax_periods tp
      WHERE period_month = $1 AND period_year = $2 ${baseCondition}
    `;

    const result = await query(statsQuery, params);
    const stats = result.rows[0];

    return NextResponse.json({
      stats: {
        totalPeriods: parseInt(stats.total_periods),
        pphPayment: {
          completed: parseInt(stats.pph_payment_completed),
          overdue: parseInt(stats.pph_payment_overdue)
        },
        pphFiling: {
          completed: parseInt(stats.pph_filing_completed),
          overdue: parseInt(stats.pph_filing_overdue)
        },
        ppnPayment: {
          completed: parseInt(stats.ppn_payment_completed),
          overdue: parseInt(stats.ppn_payment_overdue)
        },
        ppnFiling: {
          completed: parseInt(stats.ppn_filing_completed),
          overdue: parseInt(stats.ppn_filing_overdue)
        },
        bookkeeping: {
          completed: parseInt(stats.bookkeeping_completed),
          overdue: parseInt(stats.bookkeeping_overdue)
        }
      }
    });
  } catch (error) {
    console.error('Get tax monitoring stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get stats' },
      { status: 500 }
    );
  }
}

// ============================================
// WARNING LETTERS (SURAT TEGURAN)
// ============================================

async function handleGetWarningLetters(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get('client_id');
    const year = url.searchParams.get('year');

    let queryText = `
      SELECT wl.*,
             c.name as client_name,
             c.npwp as client_npwp,
             u.name as handled_by_name,
             j.title as jobdesk_title
      FROM warning_letters wl
      JOIN clients c ON c.id = wl.client_id
      LEFT JOIN users u ON u.id = wl.handled_by
      LEFT JOIN jobdesks j ON j.id = wl.jobdesk_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (year) {
      queryText += ` AND EXTRACT(YEAR FROM wl.letter_date) = $${paramIndex}`;
      params.push(parseInt(year));
      paramIndex++;
    }

    if (user.role === 'karyawan') {
      queryText += ` AND wl.client_id IN (SELECT client_id FROM client_assignments WHERE user_id = $${paramIndex})`;
      params.push(user.userId);
      paramIndex++;
    }

    if (clientId) {
      queryText += ` AND wl.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    queryText += ' ORDER BY wl.letter_date DESC';

    const result = await query(queryText, params);

    return NextResponse.json({
      warningLetters: result.rows.map(wl => ({
        id: wl.id,
        clientId: wl.client_id,
        clientName: wl.client_name,
        clientNpwp: wl.client_npwp,
        jobdeskId: wl.jobdesk_id,
        jobdeskTitle: wl.jobdesk_title,
        letterDate: wl.letter_date,
        letterNumber: wl.letter_number,
        description: wl.description,
        fineAmount: wl.fine_amount,
        fineUpdatedAt: wl.fine_updated_at,
        fineUpdateStatus: wl.fine_update_status,
        handledBy: wl.handled_by,
        handledByName: wl.handled_by_name,
        createdAt: wl.created_at
      }))
    });
  } catch (error) {
    console.error('Get warning letters error:', error);
    return NextResponse.json({ error: 'Failed to get warning letters' }, { status: 500 });
  }
}

async function handleCreateWarningLetter(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, jobdeskId, letterDate, letterNumber, description, fineAmount } = body;

    if (!clientId || !letterDate) {
      return NextResponse.json({ error: 'Client ID and letter date are required' }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO warning_letters (client_id, jobdesk_id, letter_date, letter_number, description, fine_amount, handled_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [clientId, jobdeskId || null, letterDate, letterNumber || null, description || null, fineAmount || 0, user.userId]
    );

    return NextResponse.json({
      message: 'Warning letter created successfully',
      warningLetter: result.rows[0]
    });
  } catch (error) {
    console.error('Create warning letter error:', error);
    return NextResponse.json({ error: 'Failed to create warning letter' }, { status: 500 });
  }
}

async function handleUpdateWarningLetter(request, letterId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, jobdeskId, letterDate, letterNumber, description, fineAmount, fineUpdateStatus } = body;

    const result = await query(
      `UPDATE warning_letters SET
        client_id = COALESCE($1, client_id),
        jobdesk_id = $2,
        letter_date = COALESCE($3, letter_date),
        letter_number = COALESCE($4, letter_number),
        description = COALESCE($5, description),
        fine_amount = COALESCE($6, fine_amount),
        fine_update_status = COALESCE($7, fine_update_status),
        fine_updated_at = CASE WHEN $6 IS NOT NULL THEN NOW() ELSE fine_updated_at END
       WHERE id = $8
       RETURNING *`,
      [clientId, jobdeskId || null, letterDate, letterNumber, description, fineAmount, fineUpdateStatus, letterId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Warning letter not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Warning letter updated successfully',
      warningLetter: result.rows[0]
    });
  } catch (error) {
    console.error('Update warning letter error:', error);
    return NextResponse.json({ error: 'Failed to update warning letter' }, { status: 500 });
  }
}

async function handleDeleteWarningLetter(request, letterId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query('DELETE FROM warning_letters WHERE id = $1 RETURNING id', [letterId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Warning letter not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Warning letter deleted successfully' });
  } catch (error) {
    console.error('Delete warning letter error:', error);
    return NextResponse.json({ error: 'Failed to delete warning letter' }, { status: 500 });
  }
}

// ============================================
// SP2DK NOTICES
// ============================================

async function handleGetSp2dkNotices(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(request.url);
    const clientId = url.searchParams.get('client_id');
    const status = url.searchParams.get('status');
    const year = url.searchParams.get('year');

    let queryText = `
      SELECT sp.*,
             c.name as client_name,
             c.npwp as client_npwp,
             u.name as handled_by_name,
             j.id as jobdesk_id,
             j.title as jobdesk_title
      FROM sp2dk_notices sp
      JOIN clients c ON c.id = sp.client_id
      LEFT JOIN users u ON u.id = sp.handled_by
      LEFT JOIN jobdesks j ON j.id = sp.jobdesk_id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (user.role === 'karyawan') {
      queryText += ` AND sp.client_id IN (SELECT client_id FROM client_assignments WHERE user_id = $${paramIndex})`;
      params.push(user.userId);
      paramIndex++;
    }

    if (clientId) {
      queryText += ` AND sp.client_id = $${paramIndex}`;
      params.push(clientId);
      paramIndex++;
    }

    if (status) {
      queryText += ` AND sp.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (year) {
      queryText += ` AND EXTRACT(YEAR FROM sp.letter_date) = $${paramIndex}`;
      params.push(parseInt(year));
      paramIndex++;
    }

    queryText += ' ORDER BY sp.deadline ASC, sp.letter_date DESC';

    const result = await query(queryText, params);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return NextResponse.json({
      sp2dkNotices: result.rows.map(sp => ({
        id: sp.id,
        clientId: sp.client_id,
        clientName: sp.client_name,
        clientNpwp: sp.client_npwp,
        letterDate: sp.letter_date,
        letterNumber: sp.letter_number,
        description: sp.description,
        deadline: sp.deadline,
        isOverdue: sp.status !== 'completed' && new Date(sp.deadline) < today,
        responseDate: sp.response_date,
        status: sp.status,
        handledBy: sp.handled_by,
        handledByName: sp.handled_by_name,
        jobdeskId: sp.jobdesk_id,
        jobdeskTitle: sp.jobdesk_title,
        createdAt: sp.created_at
      }))
    });
  } catch (error) {
    console.error('Get SP2DK notices error:', error);
    return NextResponse.json({ error: 'Failed to get SP2DK notices' }, { status: 500 });
  }
}

async function handleCreateSp2dkNotice(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, letterDate, letterNumber, description, jobdeskId } = body;

    if (!clientId || !letterDate) {
      return NextResponse.json({ error: 'Client ID and letter date are required' }, { status: 400 });
    }

    // Calculate deadline (14 days from letter date)
    const deadline = new Date(letterDate);
    deadline.setDate(deadline.getDate() + 14);

    const result = await query(
      `INSERT INTO sp2dk_notices (client_id, letter_date, letter_number, description, deadline, handled_by, jobdesk_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [clientId, letterDate, letterNumber || null, description || null, deadline, user.userId, jobdeskId || null]
    );

    return NextResponse.json({
      message: 'SP2DK notice created successfully',
      sp2dkNotice: result.rows[0]
    });
  } catch (error) {
    console.error('Create SP2DK notice error:', error);
    return NextResponse.json({ error: 'Failed to create SP2DK notice' }, { status: 500 });
  }
}

async function handleUpdateSp2dkNotice(request, noticeId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { clientId, letterDate, letterNumber, description, deadline, responseDate, status, jobdeskId } = body;

    // If letterDate changes, recalculate deadline
    let newDeadline = deadline;
    if (letterDate && !deadline) {
      const dl = new Date(letterDate);
      dl.setDate(dl.getDate() + 14);
      newDeadline = dl;
    }

    const result = await query(
      `UPDATE sp2dk_notices SET
        client_id = COALESCE($1, client_id),
        letter_date = COALESCE($2, letter_date),
        letter_number = COALESCE($3, letter_number),
        description = COALESCE($4, description),
        deadline = COALESCE($5, deadline),
        response_date = $6,
        status = COALESCE($7, status),
        jobdesk_id = $8
       WHERE id = $9
       RETURNING *`,
      [clientId, letterDate, letterNumber, description, newDeadline, responseDate, status, jobdeskId, noticeId]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'SP2DK notice not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'SP2DK notice updated successfully',
      sp2dkNotice: result.rows[0]
    });
  } catch (error) {
    console.error('Update SP2DK notice error:', error);
    return NextResponse.json({ error: 'Failed to update SP2DK notice' }, { status: 500 });
  }
}

async function handleDeleteSp2dkNotice(request, noticeId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query('DELETE FROM sp2dk_notices WHERE id = $1 RETURNING id', [noticeId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'SP2DK notice not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'SP2DK notice deleted successfully' });
  } catch (error) {
    console.error('Delete SP2DK notice error:', error);
    return NextResponse.json({ error: 'Failed to delete SP2DK notice' }, { status: 500 });
  }
}

// ============================================
// KPI V2 (Enhanced Tax KPI System)
// ============================================

async function handleGetKpiV2(request) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(request.url);
    const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1;
    const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
    const userId = url.searchParams.get('userId');

    // Check permission - karyawan can only see their own KPI
    if (user.role === 'karyawan' && userId && userId !== user.userId) {
      return NextResponse.json({ error: 'Unauthorized to view other user KPI' }, { status: 403 });
    }

    // Get all users
    let userQuery = `
      SELECT u.id, u.name, u.email, u.role, u.division_id, d.name as division_name
      FROM users u
      LEFT JOIN divisions d ON u.division_id = d.id
      WHERE u.is_active = true AND u.role NOT IN ('super_admin', 'owner')
    `;
    const queryParams = [];
    let paramIndex = 1;

    if (userId) {
      userQuery += ` AND u.id = $${paramIndex}`;
      queryParams.push(userId);
      paramIndex++;
    } else if (user.role === 'karyawan') {
      userQuery += ` AND u.id = $${paramIndex}`;
      queryParams.push(user.userId);
      paramIndex++;
    }

    const usersResult = await query(userQuery, queryParams);
    const users = usersResult.rows;

    // Calculate KPI for each user based on completed jobdesks
    const kpiData = await Promise.all(users.map(async (u) => {
      // Get completed jobdesks for this user in the specified month/year
      const jobdesksResult = await query(`
        SELECT j.id, j.title, j.status, j.client_id, j.period_month, j.period_year,
               c.name as client_name,
               j.due_date, j.created_at, j.updated_at
        FROM jobdesks j
        LEFT JOIN clients c ON j.client_id = c.id
        LEFT JOIN jobdesk_assignments ja ON j.id = ja.jobdesk_id
        WHERE (j.created_by = $1 OR ja.user_id = $1)
          AND j.status = 'completed'
          AND EXTRACT(MONTH FROM j.updated_at) = $2
          AND EXTRACT(YEAR FROM j.updated_at) = $3
        GROUP BY j.id, c.name
      `, [u.id, month, year]);

      const completedJobdesks = jobdesksResult.rows;

      // Calculate points for each jobdesk
      const jobdeskPoints = await Promise.all(completedJobdesks.map(async (jd) => {
        let basePoint = 100;

        // Check if completed late (after due date)
        let isLate = false;
        let lateDeduction = 0;
        if (jd.due_date && jd.updated_at) {
          const dueDate = new Date(jd.due_date);
          dueDate.setHours(23, 59, 59, 999); // End of day
          const completedDate = new Date(jd.updated_at);
          isLate = completedDate > dueDate;
          if (isLate) {
            lateDeduction = 5; // -5 poin jika terlambat
          }
        }

        // Check for late task type submissions (deadline per task type)
        // Count distinct task types that have late submissions (-5 per task type)
        const taskTypeLatnessResult = await query(`
          SELECT COUNT(DISTINCT task_type) as late_task_count,
                 ARRAY_AGG(DISTINCT task_type) as late_task_types
          FROM jobdesk_submissions
          WHERE jobdesk_id = $1 AND is_late = true AND task_type IS NOT NULL
        `, [jd.id]);
        const lateTaskTypeCount = parseInt(taskTypeLatnessResult.rows[0].late_task_count) || 0;
        const lateTaskTypes = taskTypeLatnessResult.rows[0].late_task_types || [];
        const taskTypeDeduction = lateTaskTypeCount * 5;

        // Check for warning letters linked to this jobdesk
        // OR linked to the same client (where the user is assigned to jobdesks for that client)
        const warningResult = await query(`
          SELECT COUNT(DISTINCT wl.id) as count FROM warning_letters wl
          WHERE wl.jobdesk_id = $1
             OR (wl.client_id = $2 AND wl.client_id IS NOT NULL
                 AND EXTRACT(MONTH FROM wl.letter_date) = $3
                 AND EXTRACT(YEAR FROM wl.letter_date) = $4)
        `, [jd.id, jd.client_id, month, year]);
        const warningCount = parseInt(warningResult.rows[0].count) || 0;

        // Check for SP2DK linked to this jobdesk
        // OR linked to the same client (where the user is assigned to jobdesks for that client)
        const sp2dkResult = await query(`
          SELECT COUNT(DISTINCT sp.id) as count FROM sp2dk_notices sp
          WHERE sp.jobdesk_id = $1
             OR (sp.client_id = $2 AND sp.client_id IS NOT NULL
                 AND EXTRACT(MONTH FROM sp.letter_date) = $3
                 AND EXTRACT(YEAR FROM sp.letter_date) = $4)
        `, [jd.id, jd.client_id, month, year]);
        const sp2dkCount = parseInt(sp2dkResult.rows[0].count) || 0;

        // Calculate deductions: -5 if late, -5 per late task type, -5 per warning letter, -5 per SP2DK
        const warningDeduction = warningCount * 5;
        const sp2dkDeduction = sp2dkCount * 5;
        const totalDeduction = lateDeduction + taskTypeDeduction + warningDeduction + sp2dkDeduction;
        const finalPoint = Math.max(0, basePoint - totalDeduction);

        return {
          jobdeskId: jd.id,
          jobdeskTitle: jd.title,
          clientName: jd.client_name,
          dueDate: jd.due_date,
          completedAt: jd.updated_at,
          isLate,
          basePoint,
          lateDeduction,
          lateTaskTypeCount,
          lateTaskTypes,
          taskTypeDeduction,
          warningCount,
          sp2dkCount,
          warningDeduction,
          sp2dkDeduction,
          totalDeduction,
          finalPoint
        };
      }));

      // Calculate average KPI
      const totalJobdesks = jobdeskPoints.length;
      const totalPoints = jobdeskPoints.reduce((sum, jp) => sum + jp.finalPoint, 0);
      const averageKpi = totalJobdesks > 0 ? Math.round(totalPoints / totalJobdesks) : 0;

      // Count total deductions
      const totalWarnings = jobdeskPoints.reduce((sum, jp) => sum + jp.warningCount, 0);
      const totalSp2dk = jobdeskPoints.reduce((sum, jp) => sum + jp.sp2dkCount, 0);
      const totalLateJobs = jobdeskPoints.filter(jp => jp.isLate).length;
      const totalLateDeduction = jobdeskPoints.reduce((sum, jp) => sum + jp.lateDeduction, 0);
      const totalLateTaskTypes = jobdeskPoints.reduce((sum, jp) => sum + jp.lateTaskTypeCount, 0);
      const totalTaskTypeDeduction = jobdeskPoints.reduce((sum, jp) => sum + jp.taskTypeDeduction, 0);

      // For KPIPageV2 compatibility - these are simplified metrics
      // KPI Hasil Kinerja = rata-rata poin dari semua jobdesk (sudah termasuk potongan)
      // KPI Total = sama dengan KPI Hasil Kinerja
      const kpiHasilKinerja = averageKpi;
      const kpiEfektivitasWaktu = totalJobdesks > 0
        ? Math.round(((totalJobdesks - totalLateJobs) / totalJobdesks) * 100)
        : 0;
      // KPI Total sekarang langsung sama dengan KPI Hasil Kinerja (rata-rata poin)
      const overallKpi = kpiHasilKinerja;

      // Get grade based on overallKpi (the combined score shown in UI)
      let grade = '-';
      let gradeColor = 'gray';
      if (totalJobdesks > 0) {
        if (overallKpi >= 90) { grade = 'A'; gradeColor = 'green'; }
        else if (overallKpi >= 80) { grade = 'B'; gradeColor = 'blue'; }
        else if (overallKpi >= 70) { grade = 'C'; gradeColor = 'yellow'; }
        else if (overallKpi >= 60) { grade = 'D'; gradeColor = 'orange'; }
        else { grade = 'E'; gradeColor = 'red'; }
      }

      // Determine SP level based on overallKpi
      let spLevel = 0;
      let spDescription = 'Normal';
      if (totalJobdesks > 0 && overallKpi < 60) {
        spLevel = 1;
        spDescription = 'Kandidat SP - KPI di bawah 60%';
      }

      // Count unique clients from completed jobdesks
      const totalClients = new Set(jobdeskPoints.map(jp => jp.clientName).filter(Boolean)).size;

      return {
        userId: u.id,
        userName: u.name,
        userEmail: u.email,
        userRole: u.role,
        divisionId: u.division_id,
        divisionName: u.division_name,
        periodMonth: month,
        periodYear: year,
        // Jobdesk details
        jobdeskPoints,
        totalJobdesks,
        totalPoints,
        averageKpi,
        // KPIPageV2 compatibility fields
        kpiHasilKinerja,
        kpiEfektivitasWaktu,
        overallKpi,
        totalClients,
        completedTasks: totalJobdesks,
        totalTasks: totalJobdesks,
        deadlineCompliance: kpiEfektivitasWaktu,
        pajakScore: averageKpi,
        pembukuanScore: averageKpi,
        warningLetterCount: totalWarnings,
        sp2dkCount: totalSp2dk,
        // Deductions summary
        totalWarnings,
        totalSp2dk,
        totalLateJobs,
        totalLateDeduction,
        totalLateTaskTypes,
        totalTaskTypeDeduction,
        // SP Status
        spLevel,
        spDescription,
        // Grade
        grade,
        gradeColor
      };
    }));

    return NextResponse.json({
      kpiData,
      period: { month, year }
    });
  } catch (error) {
    console.error('Get KPI V2 error:', error);
    return NextResponse.json({ error: 'Failed to fetch KPI data' }, { status: 500 });
  }
}

async function handleGetKpiV2Summary(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(request.url);
    const month = parseInt(url.searchParams.get('month')) || new Date().getMonth() + 1;
    const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();

    // Get summary statistics
    const summaryResult = await query(`
      SELECT
        COUNT(DISTINCT u.id) as total_employees,
        COUNT(DISTINCT CASE WHEN tp.handled_by IS NOT NULL THEN u.id END) as employees_with_tasks,
        COUNT(tp.id) as total_tax_periods,
        COUNT(CASE WHEN tp.pph_payment_status = 'completed' THEN 1 END) as pph_payment_completed,
        COUNT(CASE WHEN tp.pph_filing_status = 'completed' THEN 1 END) as pph_filing_completed,
        COUNT(CASE WHEN tp.bookkeeping_status = 'completed' THEN 1 END) as bookkeeping_completed
      FROM users u
      LEFT JOIN tax_periods tp ON tp.handled_by = u.id AND tp.period_month = $1 AND tp.period_year = $2
      WHERE u.is_active = true AND u.role = 'karyawan'
    `, [month, year]);

    // Count warning letters and SP2DK this month
    const issuesResult = await query(`
      SELECT
        (SELECT COUNT(*) FROM warning_letters WHERE EXTRACT(MONTH FROM letter_date) = $1 AND EXTRACT(YEAR FROM letter_date) = $2) as warning_letters,
        (SELECT COUNT(*) FROM sp2dk_notices WHERE EXTRACT(MONTH FROM letter_date) = $1 AND EXTRACT(YEAR FROM letter_date) = $2) as sp2dk_notices
    `, [month, year]);

    const summary = summaryResult.rows[0];
    const issues = issuesResult.rows[0];

    return NextResponse.json({
      summary: {
        totalEmployees: parseInt(summary.total_employees) || 0,
        employeesWithTasks: parseInt(summary.employees_with_tasks) || 0,
        totalTaxPeriods: parseInt(summary.total_tax_periods) || 0,
        completionRates: {
          pphPayment: summary.total_tax_periods > 0 ? Math.round((summary.pph_payment_completed / summary.total_tax_periods) * 100) : 0,
          pphFiling: summary.total_tax_periods > 0 ? Math.round((summary.pph_filing_completed / summary.total_tax_periods) * 100) : 0,
          bookkeeping: summary.total_tax_periods > 0 ? Math.round((summary.bookkeeping_completed / summary.total_tax_periods) * 100) : 0
        },
        issues: {
          warningLetters: parseInt(issues.warning_letters) || 0,
          sp2dkNotices: parseInt(issues.sp2dk_notices) || 0
        }
      },
      period: { month, year }
    });
  } catch (error) {
    console.error('Get KPI V2 summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch KPI summary' }, { status: 500 });
  }
}

// ============================================
// EMPLOYEE WARNING ENDPOINTS (SP Karyawan)
// ============================================

async function handleGetEmployeeWarnings(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const url = new URL(request.url);
    const year = url.searchParams.get('year');
    const userId = url.searchParams.get('userId');
    const spLevel = url.searchParams.get('spLevel');

    let queryText = `
      SELECT ew.*,
             u.name as user_name, u.email as user_email,
             ib.name as issued_by_name
      FROM employee_warnings ew
      JOIN users u ON ew.user_id = u.id
      LEFT JOIN users ib ON ew.issued_by = ib.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (year) {
      queryText += ` AND ew.period_year = $${paramIndex}`;
      params.push(parseInt(year));
      paramIndex++;
    }

    if (userId) {
      queryText += ` AND ew.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }

    if (spLevel) {
      queryText += ` AND ew.sp_level = $${paramIndex}`;
      params.push(parseInt(spLevel));
      paramIndex++;
    }

    queryText += ' ORDER BY ew.created_at DESC';

    const result = await query(queryText, params);

    return NextResponse.json({
      warnings: result.rows.map(w => ({
        id: w.id,
        userId: w.user_id,
        userName: w.user_name,
        userEmail: w.user_email,
        spLevel: w.sp_level,
        periodMonth: w.period_month,
        periodYear: w.period_year,
        reason: w.reason,
        notes: w.notes,
        issuedBy: w.issued_by,
        issuedByName: w.issued_by_name,
        status: w.status,
        createdAt: w.created_at,
        updatedAt: w.updated_at
      }))
    });
  } catch (error) {
    console.error('Get employee warnings error:', error);
    return NextResponse.json({ error: 'Failed to get employee warnings' }, { status: 500 });
  }
}

async function handleGetEmployeeWarningStats(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query(`
      SELECT
        COUNT(CASE WHEN sp_level = 1 AND status = 'active' THEN 1 END) as sp1,
        COUNT(CASE WHEN sp_level = 2 AND status = 'active' THEN 1 END) as sp2,
        COUNT(CASE WHEN sp_level = 3 AND status = 'active' THEN 1 END) as sp3,
        COUNT(*) as total
      FROM employee_warnings
    `);

    const stats = result.rows[0];

    return NextResponse.json({
      stats: {
        sp1: parseInt(stats.sp1) || 0,
        sp2: parseInt(stats.sp2) || 0,
        sp3: parseInt(stats.sp3) || 0,
        total: parseInt(stats.total) || 0
      }
    });
  } catch (error) {
    console.error('Get employee warning stats error:', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}

async function handleCreateEmployeeWarning(request) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, spLevel, periodMonth, periodYear, reason, notes } = body;

    if (!userId || !spLevel || !periodMonth || !periodYear || !reason) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if warning already exists for this user in this period
    const existingCheck = await query(
      'SELECT id FROM employee_warnings WHERE user_id = $1 AND period_month = $2 AND period_year = $3',
      [userId, periodMonth, periodYear]
    );

    if (existingCheck.rows.length > 0) {
      return NextResponse.json({
        error: 'Surat peringatan untuk karyawan ini sudah ada di periode yang sama'
      }, { status: 400 });
    }

    const result = await query(`
      INSERT INTO employee_warnings (user_id, sp_level, period_month, period_year, reason, notes, issued_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')
      RETURNING *
    `, [userId, spLevel, periodMonth, periodYear, reason, notes || null, user.userId]);

    return NextResponse.json({
      message: 'Surat peringatan berhasil dibuat',
      warning: result.rows[0]
    });
  } catch (error) {
    console.error('Create employee warning error:', error);
    return NextResponse.json({ error: 'Failed to create employee warning' }, { status: 500 });
  }
}

async function handleUpdateEmployeeWarning(request, warningId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { spLevel, periodMonth, periodYear, reason, notes, status } = body;

    const result = await query(`
      UPDATE employee_warnings
      SET sp_level = COALESCE($1, sp_level),
          period_month = COALESCE($2, period_month),
          period_year = COALESCE($3, period_year),
          reason = COALESCE($4, reason),
          notes = COALESCE($5, notes),
          status = COALESCE($6, status),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [spLevel, periodMonth, periodYear, reason, notes, status, warningId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Warning not found' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'Surat peringatan berhasil diupdate',
      warning: result.rows[0]
    });
  } catch (error) {
    console.error('Update employee warning error:', error);
    return NextResponse.json({ error: 'Failed to update employee warning' }, { status: 500 });
  }
}

async function handleDeleteEmployeeWarning(request, warningId) {
  try {
    const user = verifyToken(request);
    if (!user || !hasPermission(user.role, ['super_admin', 'owner'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query('DELETE FROM employee_warnings WHERE id = $1 RETURNING id', [warningId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Warning not found' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Surat peringatan berhasil dihapus' });
  } catch (error) {
    console.error('Delete employee warning error:', error);
    return NextResponse.json({ error: 'Failed to delete employee warning' }, { status: 500 });
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
    if (path.match(/^jobdesks\/[^/]+\/submissions$/)) {
      const jobdeskId = path.split('/')[1];
      return handleGetJobdeskSubmissions(request, jobdeskId);
    }
    if (path.match(/^jobdesks\/[^/]+$/) && !path.includes('attachments') && !path.includes('status')) {
      const jobdeskId = path.split('/')[1];
      return handleGetJobdeskDetail(request, jobdeskId);
    }

    // Daily logs
    if (path === 'daily-logs') return handleGetDailyLogs(request);

    // KPI
    if (path === 'kpi') return handleGetKPI(request);
    if (path === 'kpi-v2') return handleGetKpiV2(request);
    if (path === 'kpi-v2/summary') return handleGetKpiV2Summary(request);
    if (path === 'users') return handleGetUsers(request);
    if (path === 'users/list') return handleGetUsersList(request);

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

    // Profile
    if (path.match(/^profile\/[^/]+$/)) {
      const userId = path.split('/')[1];
      return handleGetUserProfile(request, userId);
    }

    // PWA endpoints
    if (path === 'pwa/vapid-key') return handleGetVapidKey(request);
    if (path === 'pwa/offline-bundle') return handleGetOfflineBundle(request);

    // Clients (Tax Consulting)
    if (path === 'clients') return handleGetClients(request);
    if (path.match(/^clients\/[^/]+$/)) {
      const clientId = path.split('/')[1];
      return handleGetClient(request, clientId);
    }

    // Tax Periods
    if (path === 'tax-periods') return handleGetTaxPeriods(request);
    if (path === 'tax-periods/stats') return handleGetTaxMonitoringStats(request);
    if (path.match(/^tax-periods\/[^/]+$/)) {
      const periodId = path.split('/')[1];
      return handleGetTaxPeriod(request, periodId);
    }

    // Warning Letters (DJP - Surat Teguran)
    if (path === 'warning-letters') return handleGetWarningLetters(request);

    // SP2DK Notices
    if (path === 'sp2dk') return handleGetSp2dkNotices(request);

    // Employee Warnings (SP Karyawan)
    if (path === 'employee-warnings') return handleGetEmployeeWarnings(request);
    if (path === 'employee-warnings/stats') return handleGetEmployeeWarningStats(request);

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

    // Users
    if (path === 'users') return handleCreateUser(request);

    // Divisions
    if (path === 'divisions') return handleCreateDivision(request);

    // Jobdesks
    if (path === 'jobdesks') return handleCreateJobdesk(request);
    if (path.match(/^jobdesks\/[^/]+\/submissions\/upload$/)) {
      const jobdeskId = path.split('/')[1];
      return handleUploadSubmissionFile(request, jobdeskId);
    }
    if (path.match(/^jobdesks\/[^/]+\/submissions$/)) {
      const jobdeskId = path.split('/')[1];
      return handleCreateJobdeskSubmission(request, jobdeskId);
    }

    // Daily logs
    if (path === 'daily-logs') return handleCreateDailyLog(request);

    // Todos
    if (path === 'todos') return handleCreateTodo(request);
    if (path.match(/^todos\/[^/]+\/convert-to-log$/)) {
      const todoId = path.split('/')[1];
      return handleConvertTodoToLog(request, todoId);
    }

    // Chat
    if (path === 'chat/rooms') return handleCreateChatRoom(request);
    if (path === 'chat/messages') return handleSendMessage(request);

    // Attachments
    if (path.startsWith('jobdesks/') && path.endsWith('/attachments')) {
      const jobdeskId = path.split('/')[1];
      return handleCreateAttachment(request, jobdeskId);
    }

    // Profile photo upload
    if (path === 'profile/photo') {
      return handleUploadProfilePhoto(request);
    }

    // PWA endpoints
    if (path === 'pwa/save-subscription') return handleSavePushSubscription(request);
    if (path === 'pwa/remove-subscription') return handleRemovePushSubscription(request);
    if (path === 'pwa/send-notification') return handleSendPushNotification(request);

    // Clients (Tax Consulting)
    if (path === 'clients') return handleCreateClient(request);
    if (path.match(/^clients\/[^/]+\/assign$/)) {
      const clientId = path.split('/')[1];
      return handleAssignClientEmployee(request, clientId);
    }

    // Tax Periods
    if (path === 'tax-periods') return handleCreateTaxPeriod(request);
    if (path === 'tax-periods/generate') return handleGenerateTaxPeriods(request);

    // Warning Letters (DJP)
    if (path === 'warning-letters') return handleCreateWarningLetter(request);

    // SP2DK Notices
    if (path === 'sp2dk') return handleCreateSp2dkNotice(request);

    // Employee Warnings (SP Karyawan)
    if (path === 'employee-warnings') return handleCreateEmployeeWarning(request);

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
    if (path.match(/^users\/[^/]+\/password$/)) {
      const userId = path.split('/')[1];
      return handleUpdateUserPassword(request, userId);
    }
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
    if (path.match(/^jobdesks\/[^/]+$/)) {
      const jobdeskId = path.split('/')[1];
      return handleUpdateJobdesk(request, jobdeskId);
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

    // Chat Rooms
    if (path.match(/^chat\/rooms\/[^/]+$/)) {
      const roomId = path.split('/')[2];
      return handleUpdateChatRoom(request, roomId);
    }

    // Clients (Tax Consulting)
    if (path.match(/^clients\/[^/]+\/assign\/[^/]+$/)) {
      const parts = path.split('/');
      const clientId = parts[1];
      const userId = parts[3];
      return handleUpdateClientAssignment(request, clientId, userId);
    }
    if (path.match(/^clients\/[^/]+$/)) {
      const clientId = path.split('/')[1];
      return handleUpdateClient(request, clientId);
    }

    // Tax Periods
    if (path.match(/^tax-periods\/[^/]+\/status$/)) {
      const periodId = path.split('/')[1];
      return handleUpdateTaxPeriodStatus(request, periodId);
    }
    if (path.match(/^tax-periods\/[^/]+$/)) {
      const periodId = path.split('/')[1];
      return handleUpdateTaxPeriod(request, periodId);
    }

    // Warning Letters
    if (path.match(/^warning-letters\/[^/]+$/)) {
      const letterId = path.split('/')[1];
      return handleUpdateWarningLetter(request, letterId);
    }

    // SP2DK Notices
    if (path.match(/^sp2dk\/[^/]+$/)) {
      const noticeId = path.split('/')[1];
      return handleUpdateSp2dkNotice(request, noticeId);
    }

    // Employee Warnings (SP Karyawan)
    if (path.match(/^employee-warnings\/[^/]+$/)) {
      const warningId = path.split('/')[1];
      return handleUpdateEmployeeWarning(request, warningId);
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

    // Jobdesks
    if (path.match(/^jobdesks\/[^/]+$/)) {
      const jobdeskId = path.split('/')[1];
      return handleDeleteJobdesk(request, jobdeskId);
    }

    // Jobdesk Submissions
    if (path.match(/^jobdesk-submissions\/[^/]+$/)) {
      const submissionId = path.split('/')[1];
      return handleDeleteJobdeskSubmission(request, submissionId);
    }

    // Attachments
    if (path.match(/^attachments\/[^/]+$/)) {
      const attachmentId = path.split('/')[1];
      return handleDeleteAttachment(request, attachmentId);
    }

    // Todos
    if (path.match(/^todos\/[^/]+$/)) {
      const todoId = path.split('/')[1];
      return handleDeleteTodo(request, todoId);
    }

    // Clients (Tax Consulting)
    if (path.match(/^clients\/[^/]+\/assign\/[^/]+$/)) {
      const parts = path.split('/');
      const clientId = parts[1];
      const userId = parts[3];
      return handleUnassignClientEmployee(request, clientId, userId);
    }
    if (path.match(/^clients\/[^/]+$/)) {
      const clientId = path.split('/')[1];
      return handleDeleteClient(request, clientId);
    }

    // Tax Periods
    if (path.match(/^tax-periods\/[^/]+$/)) {
      const periodId = path.split('/')[1];
      return handleDeleteTaxPeriod(request, periodId);
    }

    // Warning Letters
    if (path.match(/^warning-letters\/[^/]+$/)) {
      const letterId = path.split('/')[1];
      return handleDeleteWarningLetter(request, letterId);
    }

    // SP2DK Notices
    if (path.match(/^sp2dk\/[^/]+$/)) {
      const noticeId = path.split('/')[1];
      return handleDeleteSp2dkNotice(request, noticeId);
    }

    // Employee Warnings (SP Karyawan)
    if (path.match(/^employee-warnings\/[^/]+$/)) {
      const warningId = path.split('/')[1];
      return handleDeleteEmployeeWarning(request, warningId);
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
