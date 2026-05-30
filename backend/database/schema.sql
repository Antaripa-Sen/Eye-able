-- EyeAble Complete Database Schema
-- Run: psql -U postgres -d eyeable -f schema.sql

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table (teachers and students)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('teacher', 'student')),
  avatar_color VARCHAR(7) DEFAULT '#6366f1',
  google_uid VARCHAR(255) UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  is_active BOOLEAN DEFAULT true
);

-- Assignments table
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'sentence_typing' CHECK (type IN ('sentence_typing', 'paragraph_typing', 'communication', 'vocabulary', 'exam')),
  difficulty VARCHAR(20) DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  is_published BOOLEAN DEFAULT false,
  total_marks INTEGER DEFAULT 10,
  due_date TIMESTAMPTZ,
  time_limit_minutes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assignment student assignments (many-to-many)
CREATE TABLE IF NOT EXISTS assignment_students (
  assignment_id UUID REFERENCES assignments(id) ON DELETE CASCADE,
  student_id UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (assignment_id, student_id)
);

-- Submissions table (with marks, feedback, correction)
CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL DEFAULT '',
  is_submitted BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ,
  wpm NUMERIC(6,2) DEFAULT 0,
  accuracy NUMERIC(5,2) DEFAULT 0,
  marks NUMERIC(6,2) DEFAULT NULL,
  total_marks INTEGER DEFAULT NULL,
  feedback TEXT DEFAULT NULL,
  correction TEXT DEFAULT NULL,
  graded_by UUID REFERENCES users(id),
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics table (per-session analytics)
CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  assignment_id UUID REFERENCES assignments(id) ON DELETE SET NULL,
  wpm NUMERIC(6,2) DEFAULT 0,
  accuracy NUMERIC(5,2) DEFAULT 100,
  characters_typed INTEGER DEFAULT 0,
  backspaces_used INTEGER DEFAULT 0,
  dwell_time_ms INTEGER DEFAULT 500,
  gaze_confidence NUMERIC(5,2) DEFAULT 0,
  session_duration_seconds INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gaze heatmap data
CREATE TABLE IF NOT EXISTS gaze_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  key_label VARCHAR(20) NOT NULL,
  hit_count INTEGER DEFAULT 1,
  miss_count INTEGER DEFAULT 0,
  avg_dwell_ms INTEGER DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calibration logs
CREATE TABLE IF NOT EXISTS calibration_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  accuracy_score NUMERIC(5,2),
  calibration_points INTEGER DEFAULT 9,
  webcam_available BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Accessibility settings (per student, configurable by teacher)
CREATE TABLE IF NOT EXISTS accessibility_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dwell_time_ms INTEGER DEFAULT 500,
  keyboard_size VARCHAR(20) DEFAULT 'medium' CHECK (keyboard_size IN ('small', 'medium', 'large')),
  font_size INTEGER DEFAULT 24,
  key_spacing INTEGER DEFAULT 12,
  high_contrast BOOLEAN DEFAULT false,
  highlight_color VARCHAR(7) DEFAULT '#ffd700',
  prediction_sensitivity NUMERIC(3,2) DEFAULT 0.15,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Teacher notes on students
CREATE TABLE IF NOT EXISTS teacher_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_analytics_student ON analytics(student_id);
CREATE INDEX IF NOT EXISTS idx_analytics_recorded ON analytics(recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gaze_student ON gaze_data(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher ON assignments(teacher_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers if exist then recreate
DROP TRIGGER IF EXISTS users_updated_at ON users;
DROP TRIGGER IF EXISTS assignments_updated_at ON assignments;
DROP TRIGGER IF EXISTS submissions_updated_at ON submissions;
DROP TRIGGER IF EXISTS accessibility_settings_updated_at ON accessibility_settings;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER submissions_updated_at BEFORE UPDATE ON submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER accessibility_settings_updated_at BEFORE UPDATE ON accessibility_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill grading-related columns for existing deployments
ALTER TABLE IF EXISTS assignments ADD COLUMN IF NOT EXISTS total_marks INTEGER DEFAULT 10;
ALTER TABLE IF EXISTS submissions ADD COLUMN IF NOT EXISTS marks NUMERIC(6,2) DEFAULT NULL;
ALTER TABLE IF EXISTS submissions ADD COLUMN IF NOT EXISTS total_marks INTEGER DEFAULT NULL;
ALTER TABLE IF EXISTS submissions ADD COLUMN IF NOT EXISTS feedback TEXT DEFAULT NULL;
ALTER TABLE IF EXISTS submissions ADD COLUMN IF NOT EXISTS correction TEXT DEFAULT NULL;
ALTER TABLE IF EXISTS submissions ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES users(id);
ALTER TABLE IF EXISTS submissions ADD COLUMN IF NOT EXISTS graded_at TIMESTAMP WITH TIME ZONE;

UPDATE assignments SET total_marks = 10 WHERE total_marks IS NULL;
UPDATE submissions SET total_marks = 10 WHERE total_marks IS NULL;
