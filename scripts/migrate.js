/**
 * PostgreSQL Database Migration Script
 * Creates all required tables for Workspace Collaboration app
 */

require('dotenv').config();
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
    submission_link TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Add submission_link column if not exists (for existing databases)
  `ALTER TABLE jobdesks ADD COLUMN IF NOT EXISTS submission_link TEXT;`,

  // Clients table - MUST be created before jobdesks references it
  `CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    npwp VARCHAR(30),
    address TEXT,
    contact_person VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    is_pkp BOOLEAN DEFAULT FALSE,
    is_umkm BOOLEAN DEFAULT FALSE,
    client_type VARCHAR(20) DEFAULT 'badan',
    notes TEXT,
    created_by UUID REFERENCES users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Client assignments (Penugasan Karyawan ke Klien)
  `CREATE TABLE IF NOT EXISTS client_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    is_primary BOOLEAN DEFAULT FALSE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, user_id)
  );`,

  // Add client and tax-related columns to jobdesks
  `ALTER TABLE jobdesks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;`,
  `ALTER TABLE jobdesks ADD COLUMN IF NOT EXISTS period_month INTEGER CHECK (period_month BETWEEN 1 AND 12);`,
  `ALTER TABLE jobdesks ADD COLUMN IF NOT EXISTS period_year INTEGER CHECK (period_year >= 2020);`,
  `ALTER TABLE jobdesks ADD COLUMN IF NOT EXISTS task_types TEXT[];`, // Array: pph_payment, pph_filing, ppn_payment, ppn_filing, bookkeeping, annual_filing

  // Jobdesk submissions (pengumpulan hasil kerja)
  `CREATE TABLE IF NOT EXISTS jobdesk_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE CASCADE,
    submitted_by UUID REFERENCES users(id),
    submission_type VARCHAR(50) NOT NULL, -- link, file, note
    title VARCHAR(255),
    content TEXT, -- URL for links, file path for files, text for notes
    file_name VARCHAR(255),
    file_size INTEGER,
    mime_type VARCHAR(100),
    task_type VARCHAR(50), -- which task this submission is for (pph_payment, etc)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_jobdesk_submissions_jobdesk ON jobdesk_submissions(jobdesk_id);`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesk_submissions_task_type ON jobdesk_submissions(task_type);`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesks_client ON jobdesks(client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesks_period ON jobdesks(period_year, period_month);`,

  // Add notes column to jobdesk_submissions (untuk catatan per submission)
  `ALTER TABLE jobdesk_submissions ADD COLUMN IF NOT EXISTS notes TEXT;`,

  // Add deadline tracking columns to jobdesk_submissions
  `ALTER TABLE jobdesk_submissions ADD COLUMN IF NOT EXISTS deadline DATE;`,
  `ALTER TABLE jobdesk_submissions ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT false;`,
  `ALTER TABLE jobdesk_submissions ADD COLUMN IF NOT EXISTS late_days INTEGER DEFAULT 0;`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesk_submissions_deadline ON jobdesk_submissions(deadline);`,
  `CREATE INDEX IF NOT EXISTS idx_jobdesk_submissions_is_late ON jobdesk_submissions(is_late);`,

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

  // =====================================================
  // TAX CONSULTING KPI SYSTEM - NEW TABLES
  // =====================================================

  // Note: clients and client_assignments tables are created earlier in the migration
  // to ensure proper foreign key ordering (before jobdesks.client_id)

  // Tax periods (Periode Pajak Bulanan)
  `CREATE TABLE IF NOT EXISTS tax_periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year INTEGER NOT NULL CHECK (period_year >= 2020),
    pph_payment_deadline DATE,
    pph_filing_deadline DATE,
    ppn_payment_deadline DATE,
    ppn_filing_deadline DATE,
    bookkeeping_employee_deadline DATE,
    bookkeeping_owner_deadline DATE,
    pph_paid_at TIMESTAMP WITH TIME ZONE,
    pph_filed_at TIMESTAMP WITH TIME ZONE,
    ppn_paid_at TIMESTAMP WITH TIME ZONE,
    ppn_filed_at TIMESTAMP WITH TIME ZONE,
    bookkeeping_submitted_at TIMESTAMP WITH TIME ZONE,
    bookkeeping_authorized_at TIMESTAMP WITH TIME ZONE,
    pph_payment_status VARCHAR(20) DEFAULT 'pending',
    pph_filing_status VARCHAR(20) DEFAULT 'pending',
    ppn_payment_status VARCHAR(20) DEFAULT 'pending',
    ppn_filing_status VARCHAR(20) DEFAULT 'pending',
    bookkeeping_status VARCHAR(20) DEFAULT 'pending',
    handled_by UUID REFERENCES users(id),
    authorized_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, period_month, period_year)
  );`,

  // Annual tax filings (Laporan Tahunan - PPh Badan/OP)
  `CREATE TABLE IF NOT EXISTS annual_tax_filings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    tax_year INTEGER NOT NULL,
    filing_type VARCHAR(50) NOT NULL,
    deadline DATE NOT NULL,
    filed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending',
    handled_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(client_id, tax_year, filing_type)
  );`,

  // Tax exceptions (Pengecualian - Owner Approval)
  `CREATE TABLE IF NOT EXISTS tax_exceptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_type VARCHAR(50) NOT NULL,
    reference_id UUID NOT NULL,
    exception_field VARCHAR(100) NOT NULL,
    requested_by UUID REFERENCES users(id),
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    review_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // Warning letters (Surat Teguran)
  `CREATE TABLE IF NOT EXISTS warning_letters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    letter_date DATE NOT NULL,
    letter_number VARCHAR(100),
    description TEXT,
    fine_amount DECIMAL(15,2) DEFAULT 0,
    fine_updated_at TIMESTAMP WITH TIME ZONE,
    fine_update_status VARCHAR(20) DEFAULT 'pending',
    handled_by UUID REFERENCES users(id),
    period_month INTEGER,
    period_year INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // SP2DK notices
  `CREATE TABLE IF NOT EXISTS sp2dk_notices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    letter_date DATE NOT NULL,
    letter_number VARCHAR(100),
    description TEXT,
    deadline DATE NOT NULL,
    response_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'pending',
    handled_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  // KPI scores (Skor KPI Bulanan per Karyawan)
  `CREATE TABLE IF NOT EXISTS kpi_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year INTEGER NOT NULL CHECK (period_year >= 2020),
    score_pajak_bulanan DECIMAL(5,2) DEFAULT 0,
    score_pembukuan_bulanan DECIMAL(5,2) DEFAULT 0,
    score_tahunan DECIMAL(5,2) DEFAULT 0,
    warning_letter_count INTEGER DEFAULT 0,
    warning_letter_deduction DECIMAL(5,2) DEFAULT 0,
    sp2dk_count INTEGER DEFAULT 0,
    sp2dk_deduction DECIMAL(5,2) DEFAULT 0,
    kpi_hasil_kinerja DECIMAL(5,2) DEFAULT 0,
    target_hours DECIMAL(6,2) DEFAULT 160,
    actual_hours DECIMAL(6,2) DEFAULT 0,
    tasks_on_time INTEGER DEFAULT 0,
    tasks_total INTEGER DEFAULT 0,
    deadline_compliance_rate DECIMAL(5,2) DEFAULT 0,
    kpi_efektivitas_waktu DECIMAL(5,2) DEFAULT 0,
    sp_issued BOOLEAN DEFAULT FALSE,
    sp_level INTEGER DEFAULT 0,
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    calculated_by UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, period_month, period_year)
  );`,

  // Add client_id to jobdesks (optional link)
  `ALTER TABLE jobdesks ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;`,

  // Indexes for tax tables
  `CREATE INDEX IF NOT EXISTS idx_clients_is_pkp ON clients(is_pkp);`,
  `CREATE INDEX IF NOT EXISTS idx_clients_is_umkm ON clients(is_umkm);`,
  `CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active);`,
  `CREATE INDEX IF NOT EXISTS idx_client_assignments_user ON client_assignments(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_client_assignments_client ON client_assignments(client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_tax_periods_client ON tax_periods(client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_tax_periods_period ON tax_periods(period_year, period_month);`,
  `CREATE INDEX IF NOT EXISTS idx_tax_periods_handler ON tax_periods(handled_by);`,
  `CREATE INDEX IF NOT EXISTS idx_annual_filings_client ON annual_tax_filings(client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_annual_filings_year ON annual_tax_filings(tax_year);`,
  `CREATE INDEX IF NOT EXISTS idx_tax_exceptions_status ON tax_exceptions(status);`,
  `CREATE INDEX IF NOT EXISTS idx_tax_exceptions_ref ON tax_exceptions(reference_type, reference_id);`,
  `CREATE INDEX IF NOT EXISTS idx_warning_letters_client ON warning_letters(client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sp2dk_client ON sp2dk_notices(client_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sp2dk_status ON sp2dk_notices(status);`,
  `CREATE INDEX IF NOT EXISTS idx_kpi_scores_user_period ON kpi_scores(user_id, period_year, period_month);`,

  // Triggers for new tables
  `DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
  CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_tax_periods_updated_at ON tax_periods;
  CREATE TRIGGER update_tax_periods_updated_at BEFORE UPDATE ON tax_periods
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_annual_tax_filings_updated_at ON annual_tax_filings;
  CREATE TRIGGER update_annual_tax_filings_updated_at BEFORE UPDATE ON annual_tax_filings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_warning_letters_updated_at ON warning_letters;
  CREATE TRIGGER update_warning_letters_updated_at BEFORE UPDATE ON warning_letters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_sp2dk_notices_updated_at ON sp2dk_notices;
  CREATE TRIGGER update_sp2dk_notices_updated_at BEFORE UPDATE ON sp2dk_notices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  `DROP TRIGGER IF EXISTS update_kpi_scores_updated_at ON kpi_scores;
  CREATE TRIGGER update_kpi_scores_updated_at BEFORE UPDATE ON kpi_scores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  // Employee Warnings (Surat Peringatan Karyawan)
  `CREATE TABLE IF NOT EXISTS employee_warnings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sp_level INTEGER NOT NULL CHECK (sp_level BETWEEN 1 AND 3),
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year INTEGER NOT NULL CHECK (period_year >= 2020),
    reason TEXT NOT NULL,
    notes TEXT,
    issued_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
  );`,

  `CREATE INDEX IF NOT EXISTS idx_employee_warnings_user ON employee_warnings(user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_employee_warnings_period ON employee_warnings(period_year, period_month);`,
  `CREATE INDEX IF NOT EXISTS idx_employee_warnings_level ON employee_warnings(sp_level);`,

  `DROP TRIGGER IF EXISTS update_employee_warnings_updated_at ON employee_warnings;
  CREATE TRIGGER update_employee_warnings_updated_at BEFORE UPDATE ON employee_warnings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  // Add jobdesk_id to warning_letters and sp2dk_notices for KPI point deduction
  `ALTER TABLE warning_letters ADD COLUMN IF NOT EXISTS jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE SET NULL;`,
  `ALTER TABLE sp2dk_notices ADD COLUMN IF NOT EXISTS jobdesk_id UUID REFERENCES jobdesks(id) ON DELETE SET NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_warning_letters_jobdesk ON warning_letters(jobdesk_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sp2dk_notices_jobdesk ON sp2dk_notices(jobdesk_id);`,
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
    console.log('\n📊 Tax KPI Tables created:');
    console.log('   - clients');
    console.log('   - client_assignments');
    console.log('   - tax_periods');
    console.log('   - annual_tax_filings');
    console.log('   - tax_exceptions');
    console.log('   - warning_letters');
    console.log('   - sp2dk_notices');
    console.log('   - kpi_scores');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
