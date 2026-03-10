import nodemailer from 'nodemailer';

// Create transporter - uses environment variables for SMTP config
// Falls back to console logging if SMTP not configured
function createTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return null;
}

export async function sendSubmissionNotificationEmail({
  adminEmails,
  employeeName,
  jobdeskTitle,
  taskType,
  periodMonth,
  periodYear,
  submissionDate,
  isLate,
  lateDays,
  submissionType,
  fileName,
  notes,
  fileBuffer,
}) {
  const transporter = createTransporter();

  if (!transporter) {
    console.log('[Email] SMTP not configured. Skipping email notification.');
    console.log('[Email] Would send to:', adminEmails);
    console.log('[Email] Subject: Submission dari', employeeName, '-', jobdeskTitle);
    return;
  }

  const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  const periodStr = periodMonth && periodYear
    ? `${monthNames[periodMonth - 1]} ${periodYear}`
    : '-';

  const statusText = isLate
    ? `❌ Terlambat ${lateDays} hari`
    : '✅ Tepat Waktu';

  const statusColor = isLate ? '#ef4444' : '#22c55e';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); padding: 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0;">📋 Laporan Submission Jobdesk</h2>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; width: 140px;">Karyawan</td>
            <td style="padding: 8px 0; font-weight: bold;">${employeeName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Jobdesk</td>
            <td style="padding: 8px 0; font-weight: bold;">${jobdeskTitle}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Tipe Tugas</td>
            <td style="padding: 8px 0;">${taskType || '-'}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Period</td>
            <td style="padding: 8px 0;">${periodStr}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Dikirim</td>
            <td style="padding: 8px 0;">${new Date(submissionDate).toLocaleString('id-ID')}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Status</td>
            <td style="padding: 8px 0;">
              <span style="background: ${statusColor}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 14px;">
                ${statusText}
              </span>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Jenis</td>
            <td style="padding: 8px 0;">${submissionType === 'link' ? '🔗 Link' : submissionType === 'file' ? '📎 File' : '📝 Catatan'}</td>
          </tr>
          ${fileName ? `<tr><td style="padding: 8px 0; color: #6b7280;">File</td><td style="padding: 8px 0;">📎 ${fileName}</td></tr>` : ''}
          ${notes ? `<tr><td style="padding: 8px 0; color: #6b7280;">Catatan</td><td style="padding: 8px 0;">${notes}</td></tr>` : ''}
        </table>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          Email ini dikirim otomatis oleh Workspace Collaboration System
        </p>
      </div>
    </div>
  `;

  const attachments = [];
  if (fileBuffer && fileName) {
    attachments.push({
      filename: fileName,
      content: fileBuffer,
    });
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@workspace.com',
    to: adminEmails.join(', '),
    subject: `[Workspace] ${employeeName} mengirimkan pekerjaan - ${jobdeskTitle}`,
    html,
    attachments,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('[Email] Submission notification sent to:', adminEmails);
  } catch (error) {
    console.error('[Email] Failed to send notification:', error);
  }
}
