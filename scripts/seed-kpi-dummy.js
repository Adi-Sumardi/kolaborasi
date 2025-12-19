require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
  const result = await pool.query(text, params);
  return result;
}

async function seedDummyData() {
  console.log('🌱 Seeding KPI dummy data...\n');

  try {
    // Get existing users (karyawan)
    const usersResult = await query(`
      SELECT id, name, email, role FROM users
      WHERE role = 'karyawan' AND is_active = true
      LIMIT 5
    `);

    let karyawanUsers = usersResult.rows;

    // If no karyawan users exist, create some
    if (karyawanUsers.length === 0) {
      console.log('Creating dummy karyawan users...');

      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('password123', 10);

      const dummyUsers = [
        { name: 'Budi Santoso', email: 'budi@example.com' },
        { name: 'Siti Rahayu', email: 'siti@example.com' },
        { name: 'Ahmad Wijaya', email: 'ahmad@example.com' },
        { name: 'Dewi Lestari', email: 'dewi@example.com' },
        { name: 'Rizky Pratama', email: 'rizky@example.com' }
      ];

      for (const user of dummyUsers) {
        // Check if user already exists
        const existingUser = await query('SELECT id FROM users WHERE email = $1', [user.email]);
        if (existingUser.rows.length === 0) {
          const result = await query(`
            INSERT INTO users (name, email, password, role, is_active)
            VALUES ($1, $2, $3, 'karyawan', true)
            RETURNING id, name, email, role
          `, [user.name, user.email, hashedPassword]);
          karyawanUsers.push(result.rows[0]);
          console.log(`  ✓ Created user: ${user.name}`);
        } else {
          karyawanUsers.push({ id: existingUser.rows[0].id, ...user, role: 'karyawan' });
        }
      }
    }

    console.log(`Found/Created ${karyawanUsers.length} karyawan users`);

    // Get admin user for created_by
    const adminResult = await query(`
      SELECT id FROM users WHERE role IN ('super_admin', 'pengurus') LIMIT 1
    `);
    const adminId = adminResult.rows[0]?.id;

    if (!adminId) {
      console.log('No admin user found, using first karyawan as creator');
    }

    const creatorId = adminId || karyawanUsers[0]?.id;

    // Get or create a client
    let clientId = null;
    const clientResult = await query('SELECT id FROM clients LIMIT 1');
    if (clientResult.rows.length > 0) {
      clientId = clientResult.rows[0].id;
    } else {
      // Create dummy client
      const newClient = await query(`
        INSERT INTO clients (name, npwp, is_pkp, is_umkm, created_by)
        VALUES ('PT Maju Bersama', '01.234.567.8-901.000', true, false, $1)
        RETURNING id
      `, [creatorId]);
      clientId = newClient.rows[0].id;
      console.log('Created dummy client: PT Maju Bersama');
    }

    // Current date info
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Create jobdesks with various scenarios
    const jobdeskScenarios = [
      // Completed on time - User 0
      {
        title: 'Laporan PPh 21 - November',
        description: 'Menyusun dan melaporkan PPh 21 bulan November',
        status: 'completed',
        dueDate: new Date(currentYear, currentMonth - 1, 15), // Due 15th of current month
        completedDate: new Date(currentYear, currentMonth - 1, 12), // Completed 12th (on time)
        taskTypes: ['pph_21'],
        assignedUserIndex: 0
      },
      // Completed late - User 0
      {
        title: 'Laporan PPh Unifikasi - November',
        description: 'Pelaporan PPh 15, 22, 23, 26, 4(2)',
        status: 'completed',
        dueDate: new Date(currentYear, currentMonth - 1, 10), // Due 10th
        completedDate: new Date(currentYear, currentMonth - 1, 18), // Completed 18th (late)
        taskTypes: ['pph_unifikasi'],
        assignedUserIndex: 0
      },
      // Completed on time - User 1
      {
        title: 'PPN Bulanan - November',
        description: 'Pelaporan PPN bulanan',
        status: 'completed',
        dueDate: new Date(currentYear, currentMonth - 1, 25),
        completedDate: new Date(currentYear, currentMonth - 1, 23),
        taskTypes: ['ppn'],
        assignedUserIndex: 1
      },
      // Overdue (not completed yet) - User 1
      {
        title: 'PPh 25 Angsuran - Desember',
        description: 'Pembayaran PPh 25 angsuran',
        status: 'in_progress',
        dueDate: new Date(currentYear, currentMonth - 1, 5), // Already past
        completedDate: null,
        taskTypes: ['pph_25'],
        assignedUserIndex: 1
      },
      // Completed on time - User 2
      {
        title: 'PPh Badan Tahunan',
        description: 'Laporan tahunan PPh Badan',
        status: 'completed',
        dueDate: new Date(currentYear, currentMonth - 1, 20),
        completedDate: new Date(currentYear, currentMonth - 1, 18),
        taskTypes: ['pph_badan'],
        assignedUserIndex: 2
      },
      // Completed late - User 2
      {
        title: 'PPh 0,5% UMKM - November',
        description: 'Pelaporan PPh final UMKM',
        status: 'completed',
        dueDate: new Date(currentYear, currentMonth - 1, 8),
        completedDate: new Date(currentYear, currentMonth - 1, 15), // Late
        taskTypes: ['pph_05'],
        assignedUserIndex: 2
      },
      // Pending (future due date) - User 3
      {
        title: 'Laporan PPh 21 - Desember',
        description: 'Menyusun dan melaporkan PPh 21 bulan Desember',
        status: 'pending',
        dueDate: new Date(currentYear, currentMonth, 15), // Next month
        completedDate: null,
        taskTypes: ['pph_21', 'pph_unifikasi'],
        assignedUserIndex: 3
      },
      // Multiple completed for User 3
      {
        title: 'PPN & PPh Lengkap - November',
        description: 'Pelaporan lengkap PPN dan PPh',
        status: 'completed',
        dueDate: new Date(currentYear, currentMonth - 1, 20),
        completedDate: new Date(currentYear, currentMonth - 1, 19),
        taskTypes: ['ppn', 'pph_21', 'pph_unifikasi'],
        assignedUserIndex: 3
      }
    ];

    // Add scenarios for low performer (User 4) if available
    if (karyawanUsers.length > 4) {
      jobdeskScenarios.push(
        // Low performer - all late - User 4
        {
          title: 'PPh 21 Telat - November',
          description: 'PPh 21 yang terlambat diselesaikan',
          status: 'completed',
          dueDate: new Date(currentYear, currentMonth - 1, 5),
          completedDate: new Date(currentYear, currentMonth - 1, 20), // Very late
          taskTypes: ['pph_21'],
          assignedUserIndex: 4
        },
        {
          title: 'PPN Telat - November',
          description: 'PPN yang terlambat',
          status: 'completed',
          dueDate: new Date(currentYear, currentMonth - 1, 10),
          completedDate: new Date(currentYear, currentMonth - 1, 22), // Very late
          taskTypes: ['ppn'],
          assignedUserIndex: 4
        }
      );
    }

    console.log('\nCreating jobdesks...');
    let createdCount = 0;

    for (const scenario of jobdeskScenarios) {
      const userIndex = Math.min(scenario.assignedUserIndex, karyawanUsers.length - 1);
      const assignedUser = karyawanUsers[userIndex];

      if (!assignedUser) {
        console.log(`Skipping jobdesk "${scenario.title}" - no user available`);
        continue;
      }

      // Check if similar jobdesk already exists
      const existingJobdesk = await query(
        'SELECT id FROM jobdesks WHERE title = $1',
        [scenario.title]
      );

      if (existingJobdesk.rows.length > 0) {
        console.log(`  - Skipping "${scenario.title}" (already exists)`);
        continue;
      }

      // Create jobdesk
      const jobdeskResult = await query(`
        INSERT INTO jobdesks (
          title, description, status, due_date, client_id,
          period_month, period_year, task_types, created_by,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        scenario.title,
        scenario.description,
        scenario.status,
        scenario.dueDate,
        clientId,
        currentMonth,
        currentYear,
        scenario.taskTypes,
        creatorId,
        scenario.dueDate, // created_at (use due date for reasonable creation time)
        scenario.completedDate || now // updated_at (for completed status comparison)
      ]);

      const jobdeskId = jobdeskResult.rows[0].id;

      // Create assignment
      await query(`
        INSERT INTO jobdesk_assignments (jobdesk_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (jobdesk_id, user_id) DO NOTHING
      `, [jobdeskId, assignedUser.id]);

      const isLate = scenario.completedDate && scenario.dueDate && scenario.completedDate > scenario.dueDate;
      console.log(`  ✓ Created: "${scenario.title}" -> ${assignedUser.name} (${scenario.status}${isLate ? ' - LATE' : ''})`);
      createdCount++;
    }

    // Create some warning letters for one jobdesk (to test deduction)
    console.log('\nCreating sample warning letters...');

    // Find a completed jobdesk
    const completedJobdesk = await query(`
      SELECT id, title FROM jobdesks WHERE status = 'completed' LIMIT 1
    `);

    if (completedJobdesk.rows.length > 0) {
      const targetJobdesk = completedJobdesk.rows[0];

      // Check if warning letter already exists for this jobdesk
      const existingWarning = await query(
        'SELECT id FROM warning_letters WHERE jobdesk_id = $1',
        [targetJobdesk.id]
      );

      if (existingWarning.rows.length === 0) {
        await query(`
          INSERT INTO warning_letters (
            client_id, letter_date, letter_number, description,
            fine_amount, handled_by, jobdesk_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          clientId,
          new Date(),
          'ST-001/2024',
          'Surat Teguran untuk keterlambatan pelaporan',
          500000,
          creatorId,
          targetJobdesk.id
        ]);
        console.log(`  ✓ Created warning letter for: "${targetJobdesk.title}"`);
      } else {
        console.log('  - Warning letter already exists');
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✅ Dummy data seeding completed!');
    console.log('='.repeat(50));
    console.log('\nSummary:');
    console.log(`- ${karyawanUsers.length} karyawan users`);
    console.log(`- ${createdCount} jobdesks created`);
    console.log('\nKPI Scenarios Created:');
    console.log('├─ On-time completion: 100 points');
    console.log('├─ Late completion: 95 points (100 - 5 late penalty)');
    console.log('├─ With warning letter: -5 points deduction');
    console.log('└─ Overdue jobs: showing "Pekerjaan Telat" status');
    console.log('\nTest Users (password: password123):');
    karyawanUsers.forEach(u => console.log(`  - ${u.email}`));

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

seedDummyData();
