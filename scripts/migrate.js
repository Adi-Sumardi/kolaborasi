/**
 * PostgreSQL Database Migration Script
 * Creates all required tables for Workspace Collaboration app
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const migrations = [
  // Enable UUID extension
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`,

  // Users table
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'karyawan',
    division_id UUID,
    profile_photo TEXT,
    two_factor_secret VARCHAR(255),
    two_factor_enabled BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    push_subscription JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Divisions table
  `CREATE TABLE IF NOT EXISTS divisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Add foreign key for users.division_id
  `DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT fk_users_division
    FOREIGN KEY (division_id) REFERENCES divisions(id) ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END $$;`,

  // Jobdesks table
  `CREATE TABLE IF NOT EXISTS jobdesks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(50) DEFAULT 'medium',
    due_date DATE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Jobdesk assignments (many-to-many)
  `CREATE TABLE IF NOT EXISTS jobdesk_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(jobdesk_id, user_id)
  );`,

  // Daily logs table
  `CREATE TABLE IF NOT EXISTS daily_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE SET NULL,
    activity TEXT NOT NULL,
    hours_spent DECIMAL(4,2) DEFAULT 0,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Todos table
  `CREATE TABLE IF NOT EXISTS todos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    priority VARCHAR(50) DEFAULT 'medium',
    due_date DATE,
    "order" INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Chat rooms table
  `CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'group',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Chat room members (many-to-many)
  `CREATE TABLE IF NOT EXISTS chat_room_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(room_id, user_id)
  );`,

  // Chat messages table
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Notifications table
  `CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type VARCHAR(50) DEFAULT 'info',
    read BOOLEAN DEFAULT FALSE,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Attachments table
  `CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    url TEXT NOT NULL,
    size INTEGER,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Create indexes for better performance
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`,
  `CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`,
  `CREATE INDEX IF NOT EXISTS idx_users_division ON users(division_id);`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesks_status ON jobdesks(status);`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesks_created_by ON jobdesks(created_by);`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesk_assignments_user ON jobdesk_assignments(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesk_assignments_jobdesk ON jobdesk_assignments(jobdesk_id);`,
  `CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON daily_logs(user_id, date);`,
  `CREATE INDEX IF NOT EXISTS idx_daily_logs_jobdesk ON daily_logs(jobdesk_id);`,
  `CREATE INDEX IF NOT EXISTS idx_todos_user_status ON todos(user_id, status);`,
  `CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id, created_at);`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);`,
  `CREATE INDEX IF NOT EXISTS idx_attachments_jobdesk ON attachments(jobdesk_id);`,

  // Create updated_at trigger function
  `CREATE OR REPLACE FUNCTION update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
  END;
  $$ language 'plpgsql';`,

  // Apply triggers to tables with updated_at
  `DROP TRIGGER IF EXISTS update_users_updated_at ON users;
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_divisions_updated_at ON divisions;
  CREATE TRIGGER update_divisions_updated_at BEFORE UPDATE ON divisions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_jobdesks_updated_at ON jobdesks;
  CREATE TRIGGER update_jobdesks_updated_at BEFORE UPDATE ON jobdesks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_todos_updated_at ON todos;
  CREATE TRIGGER update_todos_updated_at BEFORE UPDATE ON todos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_chat_rooms_updated_at ON chat_rooms;
  CREATE TRIGGER update_chat_rooms_updated_at BEFORE UPDATE ON chat_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,
];

async function migrate() {
  console.log('🚀 Starting database migration...\n');

  try {
    for (let i = 0; i < migrations.length; i++) {
      const sql = migrations[i];
      const preview = sql.substring(0, 60).replace(/\n/g, ' ');
      process.stdout.write(`[${i + 1}/${migrations.length}] ${preview}...`);

      await pool.query(sql);
      console.log(' ✅');
    }

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Tables created:');
    console.log('   - users');
    console.log('   - divisions');
    console.log('   - jobdesks');
    console.log('   - jobdesk_assignments');
    console.log('   - daily_logs');
    console.log('   - todos');
    console.log('   - chat_rooms');
    console.log('   - chat_room_members');
    console.log('   - chat_messages');
    console.log('   - notifications');
    console.log('   - attachments');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
