import { NextResponse } from 'next/server';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import clientPromise from '@/lib/mongodb';
import jwt from 'jsonwebtoken';
import { sendNotification } from '@/lib/socket-server';

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
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'jobdesk-attachments');
    const filePath = join(uploadDir, fileName);
    
    await writeFile(filePath, buffer);
    
    // Save to database
    const attachment = {
      id: uuidv4(),
      jobdeskId,
      userId: user.userId,
      type: 'file',
      fileName: originalFileName,
      storedFileName: fileName,
      fileSize: file.size,
      fileType: file.type,
      url: `/uploads/jobdesk-attachments/${fileName}`,
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
        message: `${user.email} mengunggah file di jobdesk: ${jobdesk.title}`,
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
      message: 'File uploaded successfully',
      attachment
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    );
  }
}
