const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Simple JSON file database
const DB_PATH = path.join(dataDir, 'db.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const defaultDB = { profile: null, resume: null, jobs: [] };
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultDB, null, 2));
    return defaultDB;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Multer config for resume upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `resume_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
    }
  }
});

// ============== PROFILE ENDPOINTS ==============

// Get profile
app.get('/api/profile', (req, res) => {
  const db = readDB();
  res.json(db.profile || {});
});

// Save/Update profile
app.post('/api/profile', (req, res) => {
  const db = readDB();
  db.profile = {
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  writeDB(db);
  res.json({ success: true, profile: db.profile });
});

// ============== RESUME ENDPOINTS ==============

// Get resume info
app.get('/api/resume', (req, res) => {
  const db = readDB();
  res.json(db.resume || {});
});

// Upload resume
app.post('/api/resume', upload.single('resume'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const db = readDB();

  // Delete old resume file if exists
  if (db.resume && db.resume.filename) {
    const oldPath = path.join(uploadsDir, db.resume.filename);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.resume = {
    filename: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: new Date().toISOString()
  };
  writeDB(db);
  res.json({ success: true, resume: db.resume });
});

// Download resume
app.get('/api/resume/download', (req, res) => {
  const db = readDB();
  if (!db.resume || !db.resume.filename) {
    return res.status(404).json({ error: 'No resume found' });
  }
  const filePath = path.join(uploadsDir, db.resume.filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(filePath, db.resume.originalName);
});

// Delete resume
app.delete('/api/resume', (req, res) => {
  const db = readDB();
  if (db.resume && db.resume.filename) {
    const filePath = path.join(uploadsDir, db.resume.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.resume = null;
  writeDB(db);
  res.json({ success: true });
});

// ============== JOBS ENDPOINTS ==============

// Get all jobs
app.get('/api/jobs', (req, res) => {
  const db = readDB();
  res.json(db.jobs || []);
});

// Add a job
app.post('/api/jobs', (req, res) => {
  const db = readDB();
  const job = {
    id: uuidv4(),
    url: req.body.url || '',
    title: req.body.title || 'Untitled Job',
    company: req.body.company || 'Unknown Company',
    location: req.body.location || '',
    salary: req.body.salary || '',
    description: req.body.description || '',
    platform: detectPlatform(req.body.url || ''),
    status: 'saved', // saved, applied, interview, offer, rejected
    notes: req.body.notes || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    appliedAt: null
  };
  db.jobs.push(job);
  writeDB(db);
  res.json({ success: true, job });
});

// Update a job
app.patch('/api/jobs/:id', (req, res) => {
  const db = readDB();
  const idx = db.jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Job not found' });

  const updates = { ...req.body, updatedAt: new Date().toISOString() };
  if (req.body.status === 'applied' && !db.jobs[idx].appliedAt) {
    updates.appliedAt = new Date().toISOString();
  }
  db.jobs[idx] = { ...db.jobs[idx], ...updates };
  writeDB(db);
  res.json({ success: true, job: db.jobs[idx] });
});

// Delete a job
app.delete('/api/jobs/:id', (req, res) => {
  const db = readDB();
  db.jobs = db.jobs.filter(j => j.id !== req.params.id);
  writeDB(db);
  res.json({ success: true });
});

// ============== QUICK-ADD ENDPOINT ==============
// Used by: Chrome Extension, PWA Share Target, direct URL sharing

// GET /add?url=<job-link>&title=&company= — serves a confirmation page
app.get('/add', (req, res) => {
  const { url, title, text } = req.query;
  // PWA share target may send URL in 'text' or 'url' param
  const jobUrl = url || text || '';
  
  if (!jobUrl) {
    return res.redirect('/');
  }

  // Auto-save the job
  const db = readDB();
  const job = {
    id: uuidv4(),
    url: jobUrl,
    title: title || extractTitleFromUrl(jobUrl),
    company: 'Unknown Company',
    location: '',
    salary: '',
    description: '',
    platform: detectPlatform(jobUrl),
    status: 'saved',
    notes: 'Added via share/quick-add',
    source: 'share',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    appliedAt: null
  };
  db.jobs.push(job);
  writeDB(db);

  // Serve the confirmation page
  res.sendFile(path.join(__dirname, 'public', 'add.html'));
});

// POST /share-target — PWA Web Share Target handler
app.post('/share-target', express.urlencoded({ extended: true }), (req, res) => {
  const { url, text, title } = req.body;
  const jobUrl = url || text || '';

  if (!jobUrl) {
    return res.redirect('/');
  }

  // Auto-save the job
  const db = readDB();
  const job = {
    id: uuidv4(),
    url: jobUrl,
    title: title || extractTitleFromUrl(jobUrl),
    company: 'Unknown Company',
    location: '',
    salary: '',
    description: '',
    platform: detectPlatform(jobUrl),
    status: 'saved',
    notes: 'Added via mobile share',
    source: 'pwa-share',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    appliedAt: null
  };
  db.jobs.push(job);
  writeDB(db);

  res.redirect('/add?url=' + encodeURIComponent(jobUrl) + '&saved=true');
});

// POST /api/jobs/quick-add — API endpoint for Chrome extension
app.post('/api/jobs/quick-add', (req, res) => {
  const { url, title, company, location } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const db = readDB();
  const job = {
    id: uuidv4(),
    url,
    title: title || extractTitleFromUrl(url),
    company: company || 'Unknown Company',
    location: location || '',
    salary: '',
    description: '',
    platform: detectPlatform(url),
    status: 'saved',
    notes: 'Added via Chrome extension',
    source: 'extension',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    appliedAt: null
  };
  db.jobs.push(job);
  writeDB(db);
  res.json({ success: true, job });
});

// ============== SHARE ENDPOINTS ==============

// Generate share links
app.post('/api/share', (req, res) => {
  const { jobUrl, jobTitle, message } = req.body;
  const text = message || `Check out this job opportunity: ${jobTitle || 'Job'} - ${jobUrl}`;
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(jobUrl || '');

  res.json({
    whatsapp: `https://wa.me/?text=${encodedText}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodedText}`,
    email: `mailto:?subject=${encodeURIComponent(jobTitle || 'Job Opportunity')}&body=${encodedText}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(text)}`,
    copy: jobUrl
  });
});

// ============== STATS ENDPOINT ==============

app.get('/api/stats', (req, res) => {
  const db = readDB();
  const jobs = db.jobs || [];
  res.json({
    total: jobs.length,
    saved: jobs.filter(j => j.status === 'saved').length,
    applied: jobs.filter(j => j.status === 'applied').length,
    interview: jobs.filter(j => j.status === 'interview').length,
    offer: jobs.filter(j => j.status === 'offer').length,
    rejected: jobs.filter(j => j.status === 'rejected').length,
    hasResume: !!db.resume,
    hasProfile: !!db.profile
  });
});

// ============== HELPERS ==============

function extractTitleFromUrl(url) {
  try {
    const u = new URL(url);
    const pathParts = u.pathname.split('/').filter(Boolean);
    if (pathParts.length) {
      return pathParts[pathParts.length - 1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
        .substring(0, 60);
    }
  } catch {}
  return 'Untitled Job';
}

function detectPlatform(url) {
  if (!url) return 'other';
  const u = url.toLowerCase();
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('indeed.com')) return 'indeed';
  if (u.includes('glassdoor.com')) return 'glassdoor';
  if (u.includes('naukri.com')) return 'naukri';
  if (u.includes('monster.com')) return 'monster';
  if (u.includes('angel.co') || u.includes('wellfound.com')) return 'angellist';
  if (u.includes('lever.co')) return 'lever';
  if (u.includes('greenhouse.io')) return 'greenhouse';
  if (u.includes('workday.com')) return 'workday';
  if (u.includes('ziprecruiter.com')) return 'ziprecruiter';
  return 'other';
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Job Automation App running at http://localhost:${PORT}\n`);
});
