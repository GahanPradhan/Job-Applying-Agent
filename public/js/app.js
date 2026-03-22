// ========================================
// JobPilot — App Logic
// ========================================

const API = '';

// ---- State ----
let currentTab = 'dashboard';
let currentFilter = 'all';
let jobs = [];
let shareData = {};

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initDashboard();
  initProfile();
  initResume();
  initJobs();
  initModals();
  registerServiceWorker();
});

// ========== PWA & SERVICE WORKER ==========
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
      console.log('✅ Service Worker registered — PWA ready');
    } catch (err) {
      console.log('SW registration failed:', err);
    }
  }

  // Capture PWA install prompt
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner(deferredPrompt);
  });
}

function showInstallBanner(deferredPrompt) {
  // Only show if not already installed
  if (window.matchMedia('(display-mode: standalone)').matches) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-install-banner';
  banner.innerHTML = `
    <div style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#7c3aed,#3b82f6);color:white;padding:14px 24px;border-radius:14px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px rgba(124,58,237,0.4);z-index:3000;font-family:'Inter',sans-serif;max-width:90%;">
      <div style="font-size:1.5rem;">📱</div>
      <div style="flex:1;">
        <div style="font-weight:700;font-size:0.9rem;">Install JobPilot</div>
        <div style="font-size:0.78rem;opacity:0.85;">Share jobs from WhatsApp & LinkedIn directly!</div>
      </div>
      <button id="pwa-install-btn" style="background:white;color:#7c3aed;border:none;padding:8px 18px;border-radius:8px;font-weight:700;font-size:0.82rem;cursor:pointer;font-family:inherit;">Install</button>
      <button id="pwa-dismiss-btn" style="background:none;border:none;color:rgba(255,255,255,0.7);cursor:pointer;font-size:1.2rem;padding:4px;">✕</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('pwa-install-btn').addEventListener('click', async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      showToast('🎉 JobPilot installed! You can now share jobs from any app.');
    }
    banner.remove();
  });

  document.getElementById('pwa-dismiss-btn').addEventListener('click', () => banner.remove());
}

// ========== NAVIGATION ==========
function initNavigation() {
  document.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // Quick action buttons
  document.getElementById('qaBtnProfile').addEventListener('click', () => switchTab('profile'));
  document.getElementById('qaBtnResume').addEventListener('click', () => switchTab('resume'));
  document.getElementById('qaBtnAddJob').addEventListener('click', () => {
    switchTab('jobs');
    setTimeout(() => openAddJobModal(), 200);
  });
}

function switchTab(tab) {
  currentTab = tab;

  // Update nav links
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  // Update tab content
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');

  // Refresh data on tab switch
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'jobs') loadJobs();
}

// ========== DASHBOARD ==========
function initDashboard() {
  document.getElementById('quickAddJob').addEventListener('click', () => {
    switchTab('jobs');
    setTimeout(() => openAddJobModal(), 200);
  });
  loadDashboard();
}

async function loadDashboard() {
  try {
    const res = await fetch(`${API}/api/stats`);
    const stats = await res.json();

    animateNumber('stat-total', stats.total);
    animateNumber('stat-applied', stats.applied);
    animateNumber('stat-interview', stats.interview);
    animateNumber('stat-offer', stats.offer);

    // Load recent jobs
    const jobsRes = await fetch(`${API}/api/jobs`);
    jobs = await jobsRes.json();
    renderRecentJobs(jobs.slice(-5).reverse());
  } catch (err) {
    console.error('Failed to load dashboard:', err);
  }
}

function animateNumber(elementId, target) {
  const el = document.getElementById(elementId);
  const current = parseInt(el.textContent) || 0;
  if (current === target) return;

  const duration = 600;
  const start = performance.now();

  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(current + (target - current) * eased);
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

function renderRecentJobs(recentJobs) {
  const container = document.getElementById('recentJobsList');

  if (!recentJobs.length) {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
        <p>No jobs tracked yet. Add your first job link!</p>
      </div>`;
    return;
  }

  container.innerHTML = recentJobs.map(job => `
    <div class="recent-job-item" onclick="switchTab('jobs')">
      <div class="recent-job-left">
        <div class="platform-badge platform-${job.platform}">${getPlatformLabel(job.platform)}</div>
        <div class="recent-job-info">
          <h4>${escapeHtml(job.title)}</h4>
          <p>${escapeHtml(job.company)}${job.location ? ' · ' + escapeHtml(job.location) : ''}</p>
        </div>
      </div>
      <span class="status-badge status-${job.status}">${job.status}</span>
    </div>
  `).join('');
}

// ========== PROFILE ==========
function initProfile() {
  loadProfile();
  document.getElementById('profileForm').addEventListener('submit', saveProfile);
}

async function loadProfile() {
  try {
    const res = await fetch(`${API}/api/profile`);
    const profile = await res.json();
    if (profile && profile.name) {
      document.getElementById('profileName').value = profile.name || '';
      document.getElementById('profileEmail').value = profile.email || '';
      document.getElementById('profilePhone').value = profile.phone || '';
      document.getElementById('profileLocation').value = profile.location || '';
      document.getElementById('profileLinkedin').value = profile.linkedin || '';
      document.getElementById('profileGithub').value = profile.github || '';
      document.getElementById('profileTitle').value = profile.title || '';
      document.getElementById('profileSkills').value = profile.skills || '';
      document.getElementById('profileSummary').value = profile.summary || '';
      document.getElementById('profileExperience').value = profile.experience || '';
    }
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

async function saveProfile(e) {
  e.preventDefault();

  const profile = {
    name: document.getElementById('profileName').value,
    email: document.getElementById('profileEmail').value,
    phone: document.getElementById('profilePhone').value,
    location: document.getElementById('profileLocation').value,
    linkedin: document.getElementById('profileLinkedin').value,
    github: document.getElementById('profileGithub').value,
    title: document.getElementById('profileTitle').value,
    skills: document.getElementById('profileSkills').value,
    summary: document.getElementById('profileSummary').value,
    experience: document.getElementById('profileExperience').value
  };

  try {
    const res = await fetch(`${API}/api/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });

    if (res.ok) {
      showToast('Profile saved successfully!');
      const status = document.getElementById('profileSaveStatus');
      status.textContent = '✓ Saved';
      status.classList.add('visible');
      setTimeout(() => status.classList.remove('visible'), 3000);
    }
  } catch (err) {
    showToast('Failed to save profile');
    console.error(err);
  }
}

// ========== RESUME ==========
function initResume() {
  const dropZone = document.getElementById('dropZone');
  const resumeInput = document.getElementById('resumeInput');

  dropZone.addEventListener('click', () => resumeInput.click());

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length) uploadResume(files[0]);
  });

  resumeInput.addEventListener('change', e => {
    if (e.target.files.length) uploadResume(e.target.files[0]);
  });

  document.getElementById('downloadResume').addEventListener('click', () => {
    window.open(`${API}/api/resume/download`, '_blank');
  });

  document.getElementById('deleteResume').addEventListener('click', deleteResume);

  document.getElementById('replaceResume').addEventListener('click', () => {
    resumeInput.click();
  });

  loadResume();
}

async function loadResume() {
  try {
    const res = await fetch(`${API}/api/resume`);
    const resume = await res.json();
    if (resume && resume.filename) {
      showResumeInfo(resume);
    }
  } catch (err) {
    console.error('Failed to load resume:', err);
  }
}

async function uploadResume(file) {
  const formData = new FormData();
  formData.append('resume', file);

  try {
    const res = await fetch(`${API}/api/resume`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (data.success) {
      showResumeInfo(data.resume);
      showToast('Resume uploaded successfully!');
    } else {
      showToast(data.error || 'Upload failed');
    }
  } catch (err) {
    showToast('Failed to upload resume');
    console.error(err);
  }
}

async function deleteResume() {
  try {
    await fetch(`${API}/api/resume`, { method: 'DELETE' });
    document.getElementById('dropZone').style.display = '';
    document.getElementById('resumeInfo').style.display = 'none';
    showToast('Resume deleted');
  } catch (err) {
    console.error(err);
  }
}

function showResumeInfo(resume) {
  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('resumeInfo').style.display = '';
  document.getElementById('resumeFileName').textContent = resume.originalName;

  const size = (resume.size / 1024).toFixed(1);
  const date = new Date(resume.uploadedAt).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
  document.getElementById('resumeFileMeta').textContent = `Uploaded ${date} • ${size} KB`;
}

// ========== JOBS ==========
function initJobs() {
  document.getElementById('addJobBtn').addEventListener('click', openAddJobModal);

  // Filters
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderJobs();
    });
  });

  loadJobs();
}

async function loadJobs() {
  try {
    const res = await fetch(`${API}/api/jobs`);
    jobs = await res.json();
    renderJobs();
  } catch (err) {
    console.error('Failed to load jobs:', err);
  }
}

function renderJobs() {
  const container = document.getElementById('jobsList');
  let filtered = jobs;

  if (currentFilter !== 'all') {
    filtered = jobs.filter(j => j.status === currentFilter);
  }

  if (!filtered.length) {
    container.innerHTML = `
      <div class="empty-state" id="jobsEmptyState">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity="0.3">
          <rect x="2" y="7" width="20" height="14" rx="2"/>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
        </svg>
        <h3>${currentFilter === 'all' ? 'No jobs here yet' : 'No ' + currentFilter + ' jobs'}</h3>
        <p>${currentFilter === 'all' ? 'Paste a job link to start tracking your applications' : 'Jobs with status "' + currentFilter + '" will appear here'}</p>
      </div>`;
    return;
  }

  container.innerHTML = filtered.reverse().map(job => `
    <div class="job-card" id="job-${job.id}">
      <div class="job-card-header">
        <div class="job-card-main">
          <h3>${escapeHtml(job.title)}</h3>
          <span class="job-card-company">${escapeHtml(job.company)}</span>
          <div class="job-card-meta">
            ${job.location ? `
              <span class="job-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                ${escapeHtml(job.location)}
              </span>` : ''}
            ${job.salary ? `
              <span class="job-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                ${escapeHtml(job.salary)}
              </span>` : ''}
            <span class="job-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
              ${getPlatformLabel(job.platform)}
            </span>
            <span class="job-meta-item">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              ${formatDate(job.createdAt)}
            </span>
          </div>
        </div>
        <div class="job-card-right">
          <button class="job-delete-btn" onclick="deleteJob('${job.id}')" title="Delete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
          <span class="status-badge status-${job.status}">${job.status}</span>
        </div>
      </div>

      ${job.notes ? `<p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 12px;">${escapeHtml(job.notes)}</p>` : ''}

      <div class="job-card-actions">
        <select class="status-select" onchange="updateJobStatus('${job.id}', this.value)">
          <option value="saved" ${job.status === 'saved' ? 'selected' : ''}>📋 Saved</option>
          <option value="applied" ${job.status === 'applied' ? 'selected' : ''}>✅ Applied</option>
          <option value="interview" ${job.status === 'interview' ? 'selected' : ''}>🎯 Interview</option>
          <option value="offer" ${job.status === 'offer' ? 'selected' : ''}>⭐ Offer</option>
          <option value="rejected" ${job.status === 'rejected' ? 'selected' : ''}>❌ Rejected</option>
        </select>

        ${job.url ? `
          <a href="${escapeHtml(job.url)}" target="_blank" class="btn btn-primary btn-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open & Apply
          </a>` : ''}

        <button class="btn btn-outline btn-sm" onclick="openShareModal('${job.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
      </div>
    </div>
  `).join('');
}

async function updateJobStatus(id, status) {
  try {
    await fetch(`${API}/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    await loadJobs();
    showToast(`Status updated to "${status}"`);
  } catch (err) {
    console.error(err);
  }
}

async function deleteJob(id) {
  try {
    await fetch(`${API}/api/jobs/${id}`, { method: 'DELETE' });
    await loadJobs();
    showToast('Job removed');
  } catch (err) {
    console.error(err);
  }
}

// ========== MODALS ==========
function initModals() {
  // Add Job Modal
  const addModal = document.getElementById('addJobModal');
  document.getElementById('closeModal').addEventListener('click', () => closeModal(addModal));
  document.getElementById('cancelModal').addEventListener('click', () => closeModal(addModal));
  addModal.addEventListener('click', e => {
    if (e.target === addModal) closeModal(addModal);
  });

  document.getElementById('addJobForm').addEventListener('submit', handleAddJob);

  // Share Modal
  const shareModalEl = document.getElementById('shareModal');
  document.getElementById('closeShareModal').addEventListener('click', () => closeModal(shareModalEl));
  shareModalEl.addEventListener('click', e => {
    if (e.target === shareModalEl) closeModal(shareModalEl);
  });

  // Share buttons
  document.getElementById('shareWhatsapp').addEventListener('click', () => openShareLink('whatsapp'));
  document.getElementById('shareLinkedin').addEventListener('click', () => openShareLink('linkedin'));
  document.getElementById('shareTwitter').addEventListener('click', () => openShareLink('twitter'));
  document.getElementById('shareTelegram').addEventListener('click', () => openShareLink('telegram'));
  document.getElementById('shareEmail').addEventListener('click', () => openShareLink('email'));
  document.getElementById('shareCopy').addEventListener('click', copyShareLink);

  // Keyboard shortcut
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal(addModal);
      closeModal(shareModalEl);
    }
  });
}

function openAddJobModal() {
  document.getElementById('addJobForm').reset();
  document.getElementById('addJobModal').classList.add('active');
  setTimeout(() => document.getElementById('jobUrl').focus(), 100);
}

function closeModal(modal) {
  modal.classList.remove('active');
}

async function handleAddJob(e) {
  e.preventDefault();

  const job = {
    url: document.getElementById('jobUrl').value,
    title: document.getElementById('jobTitle').value || extractTitleFromUrl(document.getElementById('jobUrl').value),
    company: document.getElementById('jobCompany').value || 'Unknown Company',
    location: document.getElementById('jobLocation').value,
    salary: document.getElementById('jobSalary').value,
    notes: document.getElementById('jobNotes').value
  };

  try {
    const res = await fetch(`${API}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job)
    });

    if (res.ok) {
      closeModal(document.getElementById('addJobModal'));
      await loadJobs();
      showToast('Job added to tracker!');
    }
  } catch (err) {
    showToast('Failed to add job');
    console.error(err);
  }
}

async function openShareModal(jobId) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return;

  document.getElementById('shareJobTitle').textContent = `${job.title} at ${job.company}`;

  try {
    const res = await fetch(`${API}/api/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobUrl: job.url,
        jobTitle: `${job.title} at ${job.company}`,
        message: `🚀 Check out this job opportunity!\n\n${job.title} at ${job.company}${job.location ? '\n📍 ' + job.location : ''}${job.salary ? '\n💰 ' + job.salary : ''}\n\nApply here: ${job.url}`
      })
    });
    shareData = await res.json();
  } catch (err) {
    console.error(err);
  }

  document.getElementById('shareModal').classList.add('active');
}

function openShareLink(platform) {
  if (shareData[platform]) {
    window.open(shareData[platform], '_blank');
  }
}

async function copyShareLink() {
  if (shareData.copy) {
    try {
      await navigator.clipboard.writeText(shareData.copy);
      showToast('Link copied to clipboard!');
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = shareData.copy;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Link copied!');
    }
  }
}

// ========== HELPERS ==========
function showToast(message) {
  const toast = document.getElementById('toast');
  document.getElementById('toastMessage').textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getPlatformLabel(platform) {
  const labels = {
    linkedin: 'LI',
    indeed: 'IN',
    naukri: 'NK',
    glassdoor: 'GD',
    monster: 'MO',
    angellist: 'AL',
    lever: 'LV',
    greenhouse: 'GH',
    workday: 'WD',
    ziprecruiter: 'ZR',
    other: '🔗'
  };
  return labels[platform] || '🔗';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

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
