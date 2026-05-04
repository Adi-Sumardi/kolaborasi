const cron = require('node-cron');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const TASK_LABELS = {
  pph_21: 'PPh 21', pph_unifikasi: 'PPh Unifikasi', pph_25: 'PPh 25',
  ppn: 'PPN', pph_badan: 'PPh Badan', pph_05: 'PPh 0,5%', rekap_laporan: 'Rekap Laporan'
};

// Universal deadline: tanggal 5 bulan berikutnya from period_month/year
function calcTaskDeadline(taskType, periodMonth, periodYear, rekapDeadline) {
  if (taskType === 'rekap_laporan') {
    return rekapDeadline ? new Date(rekapDeadline) : null;
  }
  if (!periodMonth || !periodYear) return null;
  let nextMonth = periodMonth + 1;
  let nextYear = periodYear;
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }
  return new Date(nextYear, nextMonth - 1, 5);
}

function daysUntil(date) {
  if (!date) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function realtimeNotify(userId, payload) {
  try {
    if (global.io) {
      global.io.to(`user:${userId}`).emit('notification', payload);
    }
  } catch (err) {
    console.error('[Scheduler] Realtime notify error:', err.message);
  }
}

async function insertNotification(userId, title, message, type) {
  await pool.query(
    `INSERT INTO notifications (user_id, title, message, type)
     VALUES ($1, $2, $3, $4)`,
    [userId, title, message, type]
  );
  realtimeNotify(userId, { type, title, message });
}

// Idempotency check: avoid sending the same reminder multiple times
async function alreadySent(userId, jobdeskId, taskType, daysLeft) {
  const tag = `[REM:${jobdeskId}:${taskType || 'jobdesk'}:${daysLeft}]`;
  const result = await pool.query(
    `SELECT id FROM notifications
     WHERE user_id = $1 AND type = 'deadline_reminder' AND message LIKE $2
       AND created_at > NOW() - INTERVAL '2 days'`,
    [userId, `%${tag}%`]
  );
  return result.rows.length > 0;
}

async function checkDeadlines() {
  console.log('[Scheduler] Running deadline check at', new Date().toISOString());
  const REMIND_DAYS = [3, 1, 0]; // H-3, H-1, hari-H

  try {
    // Active jobdesks (not completed) with assignees
    const result = await pool.query(`
      SELECT j.id, j.title, j.due_date, j.period_month, j.period_year,
             j.task_types, j.rekap_laporan_deadline, j.status,
             ARRAY_AGG(DISTINCT ja.user_id) as assignee_ids
      FROM jobdesks j
      LEFT JOIN jobdesk_assignments ja ON ja.jobdesk_id = j.id
      WHERE j.status != 'completed'
      GROUP BY j.id
    `);

    for (const jd of result.rows) {
      const assignees = (jd.assignee_ids || []).filter(id => id !== null);
      if (assignees.length === 0) continue;

      // Get already-submitted task types for this jobdesk
      const submittedRes = await pool.query(
        `SELECT DISTINCT task_type FROM jobdesk_submissions
         WHERE jobdesk_id = $1 AND task_type IS NOT NULL`,
        [jd.id]
      );
      const submittedTaskTypes = new Set(submittedRes.rows.map(r => r.task_type));

      // 1) Jobdesk-level due_date reminder
      if (jd.due_date) {
        const days = daysUntil(jd.due_date);
        if (REMIND_DAYS.includes(days)) {
          for (const userId of assignees) {
            if (await alreadySent(userId, jd.id, null, days)) continue;
            const label = days === 0 ? 'hari ini' : `H-${days}`;
            const message = `Deadline jobdesk "${jd.title}" ${label} [REM:${jd.id}:jobdesk:${days}]`;
            await insertNotification(userId, 'Pengingat Deadline', message, 'deadline_reminder');
          }
        }
      }

      // 2) Per task type reminders
      const taskTypes = jd.task_types || [];
      for (const taskType of taskTypes) {
        if (submittedTaskTypes.has(taskType)) continue; // already submitted
        const taskDeadline = calcTaskDeadline(
          taskType, jd.period_month, jd.period_year, jd.rekap_laporan_deadline
        );
        if (!taskDeadline) continue;
        const days = daysUntil(taskDeadline);
        if (!REMIND_DAYS.includes(days)) continue;

        const taskLabel = TASK_LABELS[taskType] || taskType;
        for (const userId of assignees) {
          if (await alreadySent(userId, jd.id, taskType, days)) continue;
          const label = days === 0 ? 'hari ini' : `H-${days}`;
          const message = `Deadline ${taskLabel} di "${jd.title}" ${label} [REM:${jd.id}:${taskType}:${days}]`;
          await insertNotification(userId, 'Pengingat Deadline', message, 'deadline_reminder');
        }
      }
    }

    console.log(`[Scheduler] Deadline check done — ${result.rows.length} active jobdesks scanned`);
  } catch (err) {
    console.error('[Scheduler] Deadline check error:', err);
  }
}

function startScheduler() {
  // Run every day at 08:00 server time
  cron.schedule('0 8 * * *', checkDeadlines, { timezone: 'Asia/Jakarta' });
  console.log('[Scheduler] Deadline reminder cron registered (daily 08:00 WIB)');

  // Optional: run once shortly after startup for catch-up
  setTimeout(() => {
    checkDeadlines().catch(err => console.error('[Scheduler] Startup run error:', err));
  }, 30 * 1000);
}

module.exports = { startScheduler, checkDeadlines };
