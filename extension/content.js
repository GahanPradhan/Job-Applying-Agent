// JobPilot Chrome Extension — Content Script
// Injects a floating "Save to JobPilot" button on supported job pages

(function() {
  'use strict';

  // Don't inject if already present
  if (document.getElementById('jobpilot-fab')) return;

  // Create floating action button
  const fab = document.createElement('div');
  fab.id = 'jobpilot-fab';
  fab.innerHTML = `
    <div class="jobpilot-fab-btn" id="jobpilot-fab-btn" title="Save to JobPilot">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="jobpilot-toast" id="jobpilot-toast">
      <span id="jobpilot-toast-text">Saved to JobPilot!</span>
    </div>
  `;
  document.body.appendChild(fab);

  // Click handler
  const fabBtn = document.getElementById('jobpilot-fab-btn');
  fabBtn.addEventListener('click', async () => {
    fabBtn.classList.add('jobpilot-saving');
    
    const info = extractJobInfo();
    const serverUrl = 'http://localhost:3000';

    try {
      const res = await fetch(`${serverUrl}/api/jobs/quick-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: window.location.href,
          title: info.title || document.title,
          company: info.company || '',
          location: info.location || ''
        })
      });

      const data = await res.json();
      if (data.success) {
        showToast('✅ Saved to JobPilot!');
        fabBtn.classList.remove('jobpilot-saving');
        fabBtn.classList.add('jobpilot-saved');
        setTimeout(() => fabBtn.classList.remove('jobpilot-saved'), 3000);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      showToast('❌ Failed — is JobPilot running?');
      fabBtn.classList.remove('jobpilot-saving');
    }
  });

  function showToast(text) {
    const toast = document.getElementById('jobpilot-toast');
    document.getElementById('jobpilot-toast-text').textContent = text;
    toast.classList.add('jobpilot-toast-show');
    setTimeout(() => toast.classList.remove('jobpilot-toast-show'), 3000);
  }

  function extractJobInfo() {
    const info = { title: '', company: '', location: '' };
    const host = window.location.hostname;

    if (host.includes('linkedin.com')) {
      const t = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24, .top-card-layout__title');
      const c = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__org-name-link');
      const l = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .topcard__flavor--bullet');
      if (t) info.title = t.textContent.trim();
      if (c) info.company = c.textContent.trim();
      if (l) info.location = l.textContent.trim();
    } else if (host.includes('indeed.com')) {
      const t = document.querySelector('.jobsearch-JobInfoHeader-title, h1');
      const c = document.querySelector('.jobsearch-InlineCompanyRating-companyHeader a');
      if (t) info.title = t.textContent.trim();
      if (c) info.company = c.textContent.trim();
    } else if (host.includes('naukri.com')) {
      const t = document.querySelector('.jd-header-title, h1');
      const c = document.querySelector('.jd-header-comp-name a, .comp-name');
      const l = document.querySelector('.loc .locWdth');
      if (t) info.title = t.textContent.trim();
      if (c) info.company = c.textContent.trim();
      if (l) info.location = l.textContent.trim();
    } else {
      const h1 = document.querySelector('h1');
      if (h1) info.title = h1.textContent.trim().substring(0, 100);
    }

    return info;
  }
})();
