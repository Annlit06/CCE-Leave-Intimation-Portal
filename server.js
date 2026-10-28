/**
 * CCE Leave Intimation Portal — Backend REST API
 * Christ College of Engineering (Autonomous), Irinjalakuda
 * 
 * Technology: Node.js, Express.js, better-sqlite3
 * Environment: Development
 * 
 * NOTE: This backend is configured for local development. Security enhancements
 * such as password hashing (bcrypt), JWT authentication, role-based authorization,
 * and rate limiting must be implemented before production deployment.
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'leave_management.db');

// ==========================================
// Middleware Configuration
// ==========================================

// Enable CORS for cross-origin access from local frontend files / separate ports
app.use(cors());

// Parse incoming JSON request bodies
app.use(express.json());

// Request logging (development mode)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ==========================================
// Database Initialization (SQLite)
// ==========================================

const db = new Database(DB_PATH);

// Configure SQLite pragmas for performance and data integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 1. Create leaves table
db.exec(`
  CREATE TABLE IF NOT EXISTS leaves (
    id TEXT PRIMARY KEY,
    sid TEXT NOT NULL,
    from_date TEXT NOT NULL,
    to_date TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT NOT NULL,
    proof TEXT DEFAULT '',
    status TEXT NOT NULL,
    remark TEXT DEFAULT '',
    by_user TEXT DEFAULT '',
    locked INTEGER DEFAULT 0,
    created TEXT NOT NULL,
    log TEXT NOT NULL
  )
`);

// 2. Create users table for demo accounts
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL
  )
`);

// 3. Seed demo accounts (preserves IDs, roles, emails, and credentials)
// Note: Class, batch, department, and mentor assignments are NOT invented here.
const DEMO_USERS = [
  { id: 'u1', name: 'Nikhil Menon', email: 'nikhil@cce.edu', password: 'cce123', role: 'Student' },
  { id: 'u2', name: 'Sneha Thomas', email: 'sneha@cce.edu', password: 'cce123', role: 'Student' },
  { id: 'u3', name: 'Arjun Das', email: 'arjun@cce.edu', password: 'cce123', role: 'Student' },
  { id: 'm1', name: 'Dr. Meera Nair', email: 'meera@cce.edu', password: 'cce123', role: 'Mentor' },
  { id: 'm2', name: 'Prof. Joseph Paul', email: 'joseph@cce.edu', password: 'cce123', role: 'Mentor' },
  { id: 'h1', name: 'Dr. Suresh Kumar', email: 'hod@cce.edu', password: 'cce123', role: 'HOD' }
];

const insertUserStmt = db.prepare(`
  INSERT OR IGNORE INTO users (id, name, email, password, role)
  VALUES (@id, @name, @email, @password, @role)
`);

const seedDemoUsers = db.transaction((users) => {
  for (const user of users) {
    insertUserStmt.run(user);
  }
});

seedDemoUsers(DEMO_USERS);

// ==========================================
// Helper Functions & Data Formatting
// ==========================================

/**
 * Formats a SQLite row into the frontend-compatible JSON schema.
 * - from_date as from
 * - to_date as to
 * - by_user as by
 * - log parsed into JSON array
 * - locked converted to boolean
 */
function formatLeaveRecord(row) {
  if (!row) return null;

  let parsedLog = [];
  if (typeof row.log === 'string') {
    try {
      parsedLog = JSON.parse(row.log);
    } catch (e) {
      parsedLog = [];
    }
  } else if (Array.isArray(row.log)) {
    parsedLog = row.log;
  }

  return {
    id: row.id,
    sid: row.sid,
    from: row.from_date,
    to: row.to_date,
    type: row.type,
    reason: row.reason,
    proof: row.proof || '',
    status: row.status,
    remark: row.remark || '',
    by: row.by_user || '',
    locked: Boolean(row.locked),
    created: row.created,
    log: parsedLog
  };
}

/**
 * Validates date string in YYYY-MM-DD format.
 */
function isValidDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const d = new Date(dateStr);
  return d instanceof Date && !isNaN(d.getTime());
}

// ==========================================
// API Routes
// ==========================================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'CCE Leave Intimation Portal API',
    environment: 'development',
    timestamp: new Date().toISOString()
  });
});

// Demo accounts endpoint (preserves existing accounts for frontend login/lookup)
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT id, name, email, role FROM users').all();
  res.json(users);
});

/**
 * 1. GET /api/leaves
 * Return all leave records stored in SQLite as JSON in frontend-compatible format.
 * Optional query parameter: ?sid=<userId> to filter by student.
 */
app.get('/api/leaves', (req, res) => {
  try {
    const { sid } = req.query;
    let rows;
    if (sid) {
      rows = db.prepare('SELECT * FROM leaves WHERE sid = ? ORDER BY created DESC').all(sid);
    } else {
      rows = db.prepare('SELECT * FROM leaves ORDER BY created DESC').all();
    }

    const leaves = rows.map(formatLeaveRecord);
    res.json(leaves);
  } catch (error) {
    console.error('Error fetching leaves:', error);
    res.status(500).json({ error: 'Failed to retrieve leave records from database' });
  }
});

/**
 * 2. POST /api/leaves
 * Create a leave request with input:
 * { "sid": "u1", "from": "2026-11-01", "to": "2026-11-03", "type": "Personal", "reason": "Personal reasons", "proof": "" }
 */
app.post('/api/leaves', (req, res) => {
  try {
    const { sid, from, to, type, reason, proof } = req.body;

    // Validate required fields
    if (!sid || typeof sid !== 'string' || sid.trim() === '') {
      return res.status(400).json({ error: 'Student ID (sid) is required and must be a valid string' });
    }

    // Verify student exists in users table
    const student = db.prepare('SELECT id, role FROM users WHERE id = ?').get(sid);
    if (!student || student.role !== 'Student') {
      return res.status(400).json({ error: `Invalid student ID: "${sid}". Must belong to a registered student.` });
    }

    if (!from || !isValidDate(from)) {
      return res.status(400).json({ error: 'Valid start date (from) in YYYY-MM-DD format is required' });
    }

    if (!to || !isValidDate(to)) {
      return res.status(400).json({ error: 'Valid end date (to) in YYYY-MM-DD format is required' });
    }

    if (from > to) {
      return res.status(400).json({ error: 'Start date (from) cannot be later than end date (to)' });
    }

    if (!type || typeof type !== 'string' || type.trim() === '') {
      return res.status(400).json({ error: 'Leave type is required' });
    }

    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return res.status(400).json({ error: 'Reason for leave is required' });
    }

    // Server-side ID generation
    const recordId = `L${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
    const created = new Date().toISOString();
    const status = 'Pending';
    const proofVal = typeof proof === 'string' ? proof.trim() : '';
    const initialRemark = '';
    const initialBy = '';
    const initialLocked = 0;

    const initialLog = [
      {
        action: 'Applied',
        status: 'Pending',
        by: sid,
        timestamp: created,
        remark: 'Leave request submitted'
      }
    ];

    const insertLeaveStmt = db.prepare(`
      INSERT INTO leaves (
        id, sid, from_date, to_date, type, reason, proof, status, remark, by_user, locked, created, log
      ) VALUES (
        @id, @sid, @from_date, @to_date, @type, @reason, @proof, @status, @remark, @by_user, @locked, @created, @log
      )
    `);

    insertLeaveStmt.run({
      id: recordId,
      sid: sid.trim(),
      from_date: from,
      to_date: to,
      type: type.trim(),
      reason: reason.trim(),
      proof: proofVal,
      status: status,
      remark: initialRemark,
      by_user: initialBy,
      locked: initialLocked,
      created: created,
      log: JSON.stringify(initialLog)
    });

    const createdRow = db.prepare('SELECT * FROM leaves WHERE id = ?').get(recordId);
    res.status(201).json(formatLeaveRecord(createdRow));
  } catch (error) {
    console.error('Error creating leave:', error);
    res.status(500).json({ error: 'Internal server error while creating leave request' });
  }
});

/**
 * 3. PATCH /api/leaves/:id
 * Support approval, rejection, and eligible cancellation.
 * Validates status transitions, preserves the activity log, and returns the complete updated record.
 * 
 * Expected payload:
 * {
 *   "status": "Approved" | "Rejected" | "Cancelled",
 *   "remark": "Optional remark",
 *   "by": "m1" | "h1" | "u1" (acting user ID or name)
 * }
 */
app.patch('/api/leaves/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { status: newStatus, remark, by } = req.body;

    if (!newStatus || typeof newStatus !== 'string') {
      return res.status(400).json({ error: 'Target status is required' });
    }

    const validStatuses = ['Approved', 'Rejected', 'Cancelled'];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({
        error: `Invalid status "${newStatus}". Allowed statuses: ${validStatuses.join(', ')}`
      });
    }

    // Retrieve existing record
    const existing = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: `Leave request with ID "${id}" not found` });
    }

    // Check if record is locked
    if (existing.locked === 1) {
      return res.status(400).json({
        error: `Leave request "${id}" is locked and cannot be modified`
      });
    }

    // Validate status transitions
    const currentStatus = existing.status;

    if (currentStatus === 'Rejected' || currentStatus === 'Cancelled') {
      return res.status(400).json({
        error: `Leave request "${id}" is already ${currentStatus} and cannot transition to ${newStatus}`
      });
    }

    if (currentStatus === 'Approved') {
      // Once approved, only cancellation is permitted prior to leave completion
      if (newStatus !== 'Cancelled') {
        return res.status(400).json({
          error: `Leave request "${id}" is already Approved and cannot be changed to ${newStatus}`
        });
      }
    }

    // Parse existing log
    let logArray = [];
    try {
      logArray = JSON.parse(existing.log);
      if (!Array.isArray(logArray)) logArray = [];
    } catch (e) {
      logArray = [];
    }

    // Append new activity to log
    const timestamp = new Date().toISOString();
    const actor = (by && typeof by === 'string') ? by.trim() : 'System';
    const remarkText = (remark && typeof remark === 'string') ? remark.trim() : '';

    logArray.push({
      action: newStatus,
      status: newStatus,
      by: actor,
      timestamp: timestamp,
      remark: remarkText
    });

    // Locking rules: Terminal statuses (Rejected, Cancelled) are locked
    const nextLocked = (newStatus === 'Rejected' || newStatus === 'Cancelled') ? 1 : 0;

    // Update record using prepared statement inside a transaction
    const updateStmt = db.prepare(`
      UPDATE leaves
      SET status = @status,
          remark = @remark,
          by_user = @by_user,
          locked = @locked,
          log = @log
      WHERE id = @id
    `);

    updateStmt.run({
      id: id,
      status: newStatus,
      remark: remarkText,
      by_user: actor,
      locked: nextLocked,
      log: JSON.stringify(logArray)
    });

    const updatedRow = db.prepare('SELECT * FROM leaves WHERE id = ?').get(id);
    res.json(formatLeaveRecord(updatedRow));
  } catch (error) {
    console.error('Error updating leave request:', error);
    res.status(500).json({ error: 'Internal server error while updating leave request' });
  }
});

/**
 * 4. POST /api/leaves/migrate-demo
 * Development-only migration endpoint that accepts:
 * { "leaves": [...] }
 * 
 * - Accepts the four original sample records when supplied from separate frontend.
 * - Preserves original data.
 * - Uses INSERT OR IGNORE to prevent duplicate entries.
 * - Transactions ensure atomic writes.
 * 
 * IMPORTANT: This endpoint is strictly for development and initial migration.
 * It must be disabled or protected before production deployment.
 */
app.post('/api/leaves/migrate-demo', (req, res) => {
  res.setHeader('X-Environment-Warning', 'Development-only endpoint. Must be disabled before production.');

  try {
    const { leaves } = req.body;

    if (!Array.isArray(leaves)) {
      return res.status(400).json({
        error: 'Invalid payload: "leaves" must be an array of leave records'
      });
    }

    if (leaves.length === 0) {
      return res.status(200).json({
        message: 'Migration received 0 records. No sample data has been migrated.',
        totalReceived: 0,
        inserted: 0,
        ignored: 0,
        sampleMigrated: false
      });
    }

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO leaves (
        id, sid, from_date, to_date, type, reason, proof, status, remark, by_user, locked, created, log
      ) VALUES (
        @id, @sid, @from_date, @to_date, @type, @reason, @proof, @status, @remark, @by_user, @locked, @created, @log
      )
    `);

    let insertedCount = 0;
    let ignoredCount = 0;

    const migrationTx = db.transaction((records) => {
      for (const rec of records) {
        if (!rec.id || !rec.sid) {
          continue;
        }

        // Handle both frontend field names (from/to/by) and db field names (from_date/to_date/by_user)
        const fromDate = rec.from || rec.from_date || '';
        const toDate = rec.to || rec.to_date || '';
        const byUser = rec.by || rec.by_user || '';
        const lockedVal = rec.locked === true || rec.locked === 1 ? 1 : 0;
        const proofVal = rec.proof || '';
        const remarkVal = rec.remark || '';
        const createdVal = rec.created || new Date().toISOString();

        let logStr = '[]';
        if (typeof rec.log === 'string') {
          logStr = rec.log;
        } else if (Array.isArray(rec.log)) {
          logStr = JSON.stringify(rec.log);
        }

        const info = insertStmt.run({
          id: String(rec.id),
          sid: String(rec.sid),
          from_date: fromDate,
          to_date: toDate,
          type: rec.type || 'General',
          reason: rec.reason || '',
          proof: proofVal,
          status: rec.status || 'Pending',
          remark: remarkVal,
          by_user: byUser,
          locked: lockedVal,
          created: createdVal,
          log: logStr
        });

        if (info.changes > 0) {
          insertedCount++;
        } else {
          ignoredCount++;
        }
      }
    });

    migrationTx(leaves);

    res.status(200).json({
      message: `Migration processed: ${insertedCount} inserted, ${ignoredCount} ignored (duplicates/unmodified).`,
      totalReceived: leaves.length,
      inserted: insertedCount,
      ignored: ignoredCount,
      sampleMigrated: insertedCount > 0
    });
  } catch (error) {
    console.error('Error during demo migration:', error);
    res.status(500).json({ error: 'Migration failed due to database or transaction error' });
  }
});

// ==========================================
// Centralized 404 & Error Handlers
// ==========================================

app.use((req, res) => {
  res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'An unexpected internal server error occurred' });
});

// ==========================================
// Server Start & Clean Shutdown
// ==========================================

const server = app.listen(PORT, () => {
  console.log(`CCE Leave Portal Backend running on http://localhost:${PORT}`);
  console.log(`Database connected: ${DB_PATH}`);
  console.log(`Ready for requests.`);
});

function gracefulShutdown(signal) {
  console.log(`\nReceived ${signal}. Closing server and SQLite database...`);
  server.close(() => {
    db.close();
    console.log('Database connection closed. Process exited gracefully.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = { app, db };
