const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const speakeasy = require('speakeasy');

const MONGO_URL = 'mongodb://localhost:27017/workspace_collaboration';

async function seed() {
  const client = await MongoClient.connect(MONGO_URL);
  const db = client.db();

  try {
    console.log('🌱 Starting database seeding...');

    // Clear existing data
    await db.collection('users').deleteMany({});
    await db.collection('divisions').deleteMany({});
    await db.collection('jobdesks').deleteMany({});
    await db.collection('daily_logs').deleteMany({});
    await db.collection('todos').deleteMany({});
    await db.collection('chat_rooms').deleteMany({});
    await db.collection('messages').deleteMany({});
    await db.collection('notifications').deleteMany({});

    console.log('✅ Cleared existing data');

    // Create divisions
    const divisions = [
      {
        id: uuidv4(),
        name: 'IT & Technology',
        description: 'Departemen Teknologi Informasi',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Marketing',
        description: 'Departemen Pemasaran',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        name: 'Human Resources',
        description: 'Departemen SDM',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    await db.collection('divisions').insertMany(divisions);
    console.log('✅ Created divisions');

    // Create users
    const password = await bcrypt.hash('password123', 10);
    
    const users = [
      {
        id: uuidv4(),
        email: 'admin@workspace.com',
        password,
        name: 'Super Administrator',
        role: 'super_admin',
        divisionId: null,
        isActive: true,
        twoFactorSecret: speakeasy.generateSecret({ length: 32 }).base32,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        email: 'pengurus@workspace.com',
        password,
        name: 'Pengurus Utama',
        role: 'pengurus',
        divisionId: divisions[0].id,
        twoFactorSecret: speakeasy.generateSecret({ length: 32 }).base32,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        email: 'sdm@workspace.com',
        password,
        name: 'Manajer SDM',
        role: 'sdm',
        divisionId: divisions[2].id,
        twoFactorSecret: speakeasy.generateSecret({ length: 32 }).base32,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        email: 'karyawan1@workspace.com',
        password,
        name: 'Budi Santoso',
        role: 'karyawan',
        divisionId: divisions[0].id,
        twoFactorSecret: speakeasy.generateSecret({ length: 32 }).base32,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        email: 'karyawan2@workspace.com',
        password,
        name: 'Siti Nurhaliza',
        role: 'karyawan',
        divisionId: divisions[1].id,
        twoFactorSecret: speakeasy.generateSecret({ length: 32 }).base32,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        email: 'karyawan3@workspace.com',
        password,
        name: 'Ahmad Fauzi',
        role: 'karyawan',
        divisionId: divisions[0].id,
        twoFactorSecret: speakeasy.generateSecret({ length: 32 }).base32,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    await db.collection('users').insertMany(users);
    console.log('✅ Created users');

    // Create sample jobdesks
    const karyawanUsers = users.filter(u => u.role === 'karyawan');
    const jobdesks = [
      {
        id: uuidv4(),
        title: 'Develop New Feature',
        description: 'Implementasi fitur baru pada sistem',
        assignedTo: [karyawanUsers[0].id, karyawanUsers[2].id],
        createdBy: users[1].id,
        status: 'in_progress',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        title: 'Marketing Campaign Q1',
        description: 'Persiapan kampanye marketing untuk Q1',
        assignedTo: [karyawanUsers[1].id],
        createdBy: users[1].id,
        status: 'pending',
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: uuidv4(),
        title: 'Code Review & Testing',
        description: 'Review code dan testing aplikasi',
        assignedTo: [karyawanUsers[0].id],
        createdBy: users[1].id,
        status: 'completed',
        completedAt: new Date(),
        dueDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      }
    ];

    await db.collection('jobdesks').insertMany(jobdesks);
    console.log('✅ Created jobdesks');

    // Create sample daily logs
    const logs = [
      {
        id: uuidv4(),
        userId: karyawanUsers[0].id,
        jobdeskId: jobdesks[0].id,
        notes: 'Menyelesaikan setup environment dan instalasi dependencies',
        hoursSpent: 4,
        date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
      },
      {
        id: uuidv4(),
        userId: karyawanUsers[0].id,
        jobdeskId: jobdesks[0].id,
        notes: 'Implementasi API endpoints dan testing',
        hoursSpent: 6,
        date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
      },
      {
        id: uuidv4(),
        userId: karyawanUsers[0].id,
        jobdeskId: jobdesks[2].id,
        notes: 'Code review selesai, ditemukan 3 bugs minor',
        hoursSpent: 3,
        date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
      }
    ];

    await db.collection('daily_logs').insertMany(logs);
    console.log('✅ Created daily logs');

    // Create sample chat room
    const chatRoom = {
      id: uuidv4(),
      name: 'Tim IT - General',
      type: 'group',
      members: [users[0].id, users[1].id, karyawanUsers[0].id, karyawanUsers[2].id],
      createdBy: users[1].id,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('chat_rooms').insertMany([chatRoom]);
    console.log('✅ Created chat room');

    // Create sample messages
    const messages = [
      {
        id: uuidv4(),
        roomId: chatRoom.id,
        userId: users[1].id,
        userEmail: users[1].email,
        content: 'Halo tim! Ada update project baru nih',
        createdAt: new Date(Date.now() - 60 * 60 * 1000)
      },
      {
        id: uuidv4(),
        roomId: chatRoom.id,
        userId: karyawanUsers[0].id,
        userEmail: karyawanUsers[0].email,
        content: 'Siap! Apa yang perlu dikerjakan?',
        createdAt: new Date(Date.now() - 50 * 60 * 1000)
      }
    ];

    await db.collection('messages').insertMany(messages);
    console.log('✅ Created messages');

    console.log('\\n🎉 Database seeding completed!\\n');
    console.log('═══════════════════════════════════════');
    console.log('📋 Sample Login Credentials:');
    console.log('═══════════════════════════════════════');
    console.log('\\n🔹 Super Admin:');
    console.log('   Email: admin@workspace.com');
    console.log('   Password: password123');
    console.log('\\n🔹 Pengurus:');
    console.log('   Email: pengurus@workspace.com');
    console.log('   Password: password123');
    console.log('\\n🔹 SDM:');
    console.log('   Email: sdm@workspace.com');
    console.log('   Password: password123');
    console.log('\\n🔹 Karyawan:');
    console.log('   Email: karyawan1@workspace.com');
    console.log('   Password: password123');
    console.log('═══════════════════════════════════════\\n');

  } catch (error) {
    console.error('❌ Seeding error:', error);
  } finally {
    await client.close();
  }
}

seed();
