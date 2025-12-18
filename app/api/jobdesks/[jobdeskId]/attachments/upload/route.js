import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@/lib/db';
import jwt from 'jsonwebtoken';
import { sendNotification } from '@/lib/socket-server';
import fs from 'fs';

// Ensure upload directory exists
const uploadDir = join(process.cwd(), 'public', 'uploads', 'jobdesk-attachments');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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

export async function POST(request, { params }) {
  try {
    const user = verifyToken(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const jobdeskId = params.jobdeskId;

    // Check if user has access to this jobdesk
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
    const assignedTo = jobdesk.assigned_to?.filter(id => id !== null) || [];

    // Check permission: only assigned karyawan can upload
    if (!assignedTo.includes(user.userId)) {
      return NextResponse.json({
        error: 'Only assigned karyawan can upload attachments'
      }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Validate file size (10MB = 10 * 1024 * 1024 bytes)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({
        error: 'File size exceeds 10MB limit'
      }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({
        error: 'File type not allowed. Allowed: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, ZIP, JPG, PNG, GIF'
      }, { status: 400 });
    }

    // Generate unique filename
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const fileExt = file.name.split('.').pop();
    const uniqueId = uuidv4();
    const fileName = `${uniqueId}.${fileExt}`;
    const originalFileName = file.name;

    // Save to public/uploads/jobdesk-attachments
    const filePath = join(uploadDir, fileName);

    await writeFile(filePath, buffer);

    // Save to database
    const attachmentResult = await query(
      `INSERT INTO attachments (jobdesk_id, type, name, url, size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [jobdeskId, 'file', originalFileName, `/uploads/jobdesk-attachments/${fileName}`, file.size, user.userId]
    );

    const attachment = attachmentResult.rows[0];

    // Send notification to pengurus and super_admin
    const pengurusResult = await query(
      `SELECT id FROM users WHERE role IN ('pengurus', 'super_admin')`
    );

    for (const pengurus of pengurusResult.rows) {
      await query(
        `INSERT INTO notifications (user_id, title, message, type)
         VALUES ($1, $2, $3, $4)`,
        [pengurus.id, 'Lampiran Baru', `${user.email} mengunggah file di jobdesk: ${jobdesk.title}`, 'attachment_added']
      );

      try {
        sendNotification(pengurus.id, {
          type: 'attachment_added',
          title: 'Lampiran Baru',
          message: `${user.email} mengunggah file di jobdesk: ${jobdesk.title}`
        });
      } catch (err) {
        console.error('Socket notification error:', err);
      }
    }

    return NextResponse.json({
      message: 'File uploaded successfully',
      attachment: {
        id: attachment.id,
        jobdeskId: attachment.jobdesk_id,
        type: attachment.type,
        name: attachment.name,
        url: attachment.url,
        size: attachment.size,
        uploadedBy: attachment.uploaded_by,
        createdAt: attachment.created_at
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
