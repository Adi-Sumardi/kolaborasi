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
    if (!authUser || !hasPermission(authUser.role, ['super_admin', 'pengurus'])) {
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
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
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
               ARRAY_AGG(ja.user_id) as assigned_to
        FROM jobdesks j
        JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
        WHERE j.id IN (
          SELECT jobdesk_id FROM jobdesk_assignments WHERE user_id = $1
        )
        GROUP BY j.id
        ORDER BY j.created_at DESC
        LIMIT $2 OFFSET $3
      `;
      params = [user.userId, limit, offset];
    } else {
      countQuery = 'SELECT COUNT(*) as total FROM jobdesks';
      dataQuery = `
        SELECT j.*,
               ARRAY_AGG(ja.user_id) as assigned_to
        FROM jobdesks j
        LEFT JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
        GROUP BY j.id
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
      createdBy: j.created_by,
      assignedTo: j.assigned_to ? j.assigned_to.filter(id => id !== null) : [],
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
    const { title, description, assignedTo, dueDate, priority } = body;

    if (!title || !assignedTo || assignedTo.length === 0) {
      return NextResponse.json(
        { error: 'Title and at least one assignee required' },
        { status: 400 }
      );
    }

    // Use transaction to create jobdesk and assignments
    const jobdesk = await transaction(async (client) => {
      // Create jobdesk
      const jobdeskResult = await client.query(
        `INSERT INTO jobdesks (title, description, status, priority, due_date, created_by)
         VALUES ($1, $2, 'pending', $3, $4, $5)
         RETURNING *`,
        [title, description || '', priority || 'medium', dueDate ? new Date(dueDate) : null, user.userId]
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
        assignedTo
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
        assignedTo: jobdesk.assignedTo,
        createdBy: jobdesk.created_by,
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
    const { title, description, assignedTo, dueDate, priority, status } = body;

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
    const isSuperAdminOrPengurus = hasPermission(user.role, ['super_admin', 'pengurus']);
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
    if (!user || !hasPermission(user.role, ['super_admin'])) {
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
    if (userId !== user.userId && !hasPermission(user.role, ['super_admin', 'pengurus', 'sdm'])) {
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
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus', 'sdm'])) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await query(
      `SELECT id, email, name, role, division_id, is_active, profile_photo, created_at, updated_at
       FROM users
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
      hasPermission(user.role, ['super_admin', 'pengurus', 'sdm']);

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
      hasPermission(user.role, ['super_admin', 'pengurus', 'sdm']);

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
      hasPermission(user.role, ['super_admin', 'pengurus', 'sdm']);

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
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
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
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
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

    // Soft delete
    await query(
      'UPDATE users SET is_active = FALSE WHERE id = $1',
      [userId]
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
    if (!user || !hasPermission(user.role, ['super_admin'])) {
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
    if (!user || !hasPermission(user.role, ['super_admin', 'pengurus'])) {
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
    if (user.userId !== userId && !hasPermission(user.role, ['super_admin', 'pengurus', 'sdm'])) {
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

    // Profile
    if (path.match(/^profile\/[^/]+$/)) {
      const userId = path.split('/')[1];
      return handleGetUserProfile(request, userId);
    }

    // PWA endpoints
    if (path === 'pwa/vapid-key') return handleGetVapidKey(request);
    if (path === 'pwa/offline-bundle') return handleGetOfflineBundle(request);

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

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
