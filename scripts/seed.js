/**
 * PostgreSQL Database Seed Script
 * Creates initial data for Workspace Collaboration app
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Generate 2FA secrets for users
    const generate2FASecret = (email) => {
      return speakeasy.generateSecret({
        name: `Workspace (${email})`,
        length: 32
      }).base32;
    };

    // Hash password - Password123 meets strong password requirements
    const defaultPassword = await bcrypt.hash('Password123', 10);

    // 1. Create divisions
    console.log('Creating divisions...');
    const divisions = [
      { name: 'IT & Technology', description: 'Departemen Teknologi Informasi' },
      { name: 'Marketing', description: 'Departemen Pemasaran' },
      { name: 'Human Resources', description: 'Departemen SDM' },
      { name: 'Finance', description: 'Departemen Keuangan' },
    ];

    const divisionIds = [];
    for (const div of divisions) {
      const result = await pool.query(
        `INSERT INTO divisions (name, description)
         VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = $2
         RETURNING id`,
        [div.name, div.description]
      );
      divisionIds.push(result.rows[0].id);
      console.log(`  ✅ Division: ${div.name}`);
    }

    // 2. Create users
    console.log('\nCreating users...');
    const users = [
      {
        email: 'admin@workspace.com',
        name: 'Super Administrator',
        role: 'super_admin',
        division_id: null
      },
      {
        email: 'pengurus@workspace.com',
        name: 'Pengurus Utama',
        role: 'pengurus',
        division_id: divisionIds[0]
      },
      {
        email: 'sdm@workspace.com',
        name: 'Manajer SDM',
        role: 'sdm',
        division_id: divisionIds[2]
      },
      {
        email: 'karyawan1@workspace.com',
        name: 'Budi Santoso',
        role: 'karyawan',
        division_id: divisionIds[0]
      },
      {
        email: 'karyawan2@workspace.com',
        name: 'Siti Nurhaliza',
        role: 'karyawan',
        division_id: divisionIds[1]
      },
      {
        email: 'karyawan3@workspace.com',
        name: 'Ahmad Fauzi',
        role: 'karyawan',
        division_id: divisionIds[0]
      },
    ];

    const userIds = [];
    for (const user of users) {
      const twoFactorSecret = generate2FASecret(user.email);
      const result = await pool.query(
        `INSERT INTO users (email, password, name, role, division_id, two_factor_secret)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET
           name = $3, role = $4, division_id = $5
         RETURNING id`,
        [user.email, defaultPassword, user.name, user.role, user.division_id, twoFactorSecret]
      );
      userIds.push(result.rows[0].id);
      console.log(`  ✅ User: ${user.email} (${user.role})`);
    }

    // Get karyawan user IDs (indices 3, 4, 5)
    const karyawanIds = [userIds[3], userIds[4], userIds[5]];

    // 3. Create jobdesks
    console.log('\nCreating jobdesks...');
    const jobdesks = [
      {
        title: 'Develop New Feature',
        description: 'Implementasi fitur baru pada sistem',
        status: 'in_progress',
        priority: 'high',
        created_by: userIds[1],
        assigned_to: [karyawanIds[0], karyawanIds[2]]
      },
      {
        title: 'Marketing Campaign Q1',
        description: 'Persiapan kampanye marketing untuk Q1',
        status: 'pending',
        priority: 'medium',
        created_by: userIds[1],
        assigned_to: [karyawanIds[1]]
      },
      {
        title: 'Code Review & Testing',
        description: 'Review code dan testing aplikasi',
        status: 'completed',
        priority: 'high',
        created_by: userIds[1],
        assigned_to: [karyawanIds[0]]
      },
      {
        title: 'Employee Onboarding Process',
        description: 'Review dan update dokumentasi onboarding',
        status: 'in_progress',
        priority: 'low',
        created_by: userIds[2],
        assigned_to: [userIds[2]]
      },
    ];

    const jobdeskIds = [];
    for (const job of jobdesks) {
      const result = await pool.query(
        `INSERT INTO jobdesks (title, description, status, priority, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [job.title, job.description, job.status, job.priority, job.created_by]
      );
      const jobdeskId = result.rows[0].id;
      jobdeskIds.push(jobdeskId);

      // Add assignments
      for (const userId of job.assigned_to) {
        await pool.query(
          `INSERT INTO jobdesk_assignments (jobdesk_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [jobdeskId, userId]
        );
      }
      console.log(`  ✅ Jobdesk: ${job.title}`);
    }

    // 4. Create daily logs
    console.log('\nCreating daily logs...');
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];

    const dailyLogs = [
      { user_id: karyawanIds[0], jobdesk_id: jobdeskIds[0], activity: 'Menyelesaikan setup environment dan instalasi dependencies', hours_spent: 4, date: twoDaysAgo },
      { user_id: karyawanIds[0], jobdesk_id: jobdeskIds[0], activity: 'Implementasi API endpoints dan testing', hours_spent: 6, date: yesterday },
      { user_id: karyawanIds[0], jobdesk_id: jobdeskIds[2], activity: 'Code review selesai, ditemukan 3 bugs minor', hours_spent: 3, date: today },
      { user_id: karyawanIds[1], jobdesk_id: jobdeskIds[1], activity: 'Membuat draft kampanye marketing', hours_spent: 2, date: today },
    ];

    for (const log of dailyLogs) {
      await pool.query(
        `INSERT INTO daily_logs (user_id, jobdesk_id, activity, hours_spent, date)
         VALUES ($1, $2, $3, $4, $5)`,
        [log.user_id, log.jobdesk_id, log.activity, log.hours_spent, log.date]
      );
    }
    console.log(`  ✅ Created ${dailyLogs.length} daily logs`);

    // 5. Create todos
    console.log('\nCreating todos...');
    const todos = [
      { user_id: karyawanIds[0], title: 'Review PR #123', status: 'pending', priority: 'high' },
      { user_id: karyawanIds[0], title: 'Update documentation', status: 'in_progress', priority: 'medium' },
      { user_id: karyawanIds[1], title: 'Prepare presentation', status: 'pending', priority: 'high' },
      { user_id: karyawanIds[2], title: 'Fix bug in login page', status: 'completed', priority: 'high' },
    ];

    for (const todo of todos) {
      await pool.query(
        `INSERT INTO todos (user_id, title, status, priority)
         VALUES ($1, $2, $3, $4)`,
        [todo.user_id, todo.title, todo.status, todo.priority]
      );
    }
    console.log(`  ✅ Created ${todos.length} todos`);

    // 6. Create chat rooms
    console.log('\nCreating chat rooms...');

    // General room
    const generalRoomResult = await pool.query(
      `INSERT INTO chat_rooms (name, type, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Tim IT - General', 'group', userIds[1]]
    );
    const generalRoomId = generalRoomResult.rows[0].id;

    // Add members to general room
    const generalMembers = [userIds[0], userIds[1], karyawanIds[0], karyawanIds[2]];
    for (const userId of generalMembers) {
      await pool.query(
        `INSERT INTO chat_room_members (room_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [generalRoomId, userId]
      );
    }
    console.log('  ✅ Chat room: Tim IT - General');

    // Marketing room
    const marketingRoomResult = await pool.query(
      `INSERT INTO chat_rooms (name, type, created_by)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['Tim Marketing', 'group', userIds[1]]
    );
    const marketingRoomId = marketingRoomResult.rows[0].id;

    // Add members to marketing room
    const marketingMembers = [userIds[0], userIds[1], karyawanIds[1]];
    for (const userId of marketingMembers) {
      await pool.query(
        `INSERT INTO chat_room_members (room_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [marketingRoomId, userId]
      );
    }
    console.log('  ✅ Chat room: Tim Marketing');

    // Add sample messages
    await pool.query(
      `INSERT INTO chat_messages (room_id, user_id, content)
       VALUES ($1, $2, $3)`,
      [generalRoomId, userIds[1], 'Halo tim! Ada update project baru nih 🎉']
    );
    await pool.query(
      `INSERT INTO chat_messages (room_id, user_id, content)
       VALUES ($1, $2, $3)`,
      [generalRoomId, karyawanIds[0], 'Siap! Apa yang perlu dikerjakan?']
    );
    console.log('  ✅ Created sample messages');

    // Summary
    console.log('\n' + '═'.repeat(50));
    console.log('🎉 Database seeding completed successfully!');
    console.log('═'.repeat(50));
    console.log('\n📋 Sample Login Credentials:');
    console.log('─'.repeat(50));
    console.log('\n🔹 Super Admin:');
    console.log('   Email: admin@workspace.com');
    console.log('   Password: Password123');
    console.log('\n🔹 Pengurus:');
    console.log('   Email: pengurus@workspace.com');
    console.log('   Password: Password123');
    console.log('\n🔹 SDM:');
    console.log('   Email: sdm@workspace.com');
    console.log('   Password: Password123');
    console.log('\n🔹 Karyawan:');
    console.log('   Email: karyawan1@workspace.com');
    console.log('   Password: Password123');
    console.log('─'.repeat(50));
    console.log('\n⚠️  Note: 2FA is disabled by default for all users');
    console.log('');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
