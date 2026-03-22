// JobPilot Chrome Extension — Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const saveBtn = document.getElementById('saveBtn');
  const statusEl = document.getElementById('status');
  const pageUrlEl = document.getElementById('pageUrl');
  const titleInput = document.getElementById('jobTitle');
  const companyInput = document.getElementById('jobCompany');
  const locationInput = document.getElementById('jobLocation');
  const serverUrlInput = document.getElementById('serverUrl');

  // Load saved server URL
  const stored = await chrome.storage?.local?.get('serverUrl');
  if (stored?.serverUrl) {
    serverUrlInput.value = stored.serverUrl;
  }

  // Save server URL on change
  serverUrlInput.addEventListener('change', () => {
    chrome.storage?.local?.set({ serverUrl: serverUrlInput.value });
  });

  // Get current tab info
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    pageUrlEl.textContent = tab.url;

    // Try to extract job info from the page
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        function: extractJobInfo
      });
      if (results && results[0] && results[0].result) {
        const info = results[0].result;
        if (info.title) titleInput.value = info.title;
        if (info.company) companyInput.value = info.company;
        if (info.location) locationInput.value = info.location;
      }
    } catch (err) {
      console.log('Could not extract job info:', err);
      // Fall back to page title
      if (tab.title) {
        titleInput.value = tab.title.split(' - ')[0].split(' | ')[0].trim();
      }
    }
  }

  // Save button
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    statusEl.className = 'status';
    statusEl.style.display = 'none';

    const serverUrl = serverUrlInput.value.replace(/\/$/, '');

    try {
      const response = await fetch(`${serverUrl}/api/jobs/quick-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: tab.url,
          title: titleInput.value || tab.title || 'Untitled Job',
          company: companyInput.value || '',
          location: locationInput.value || ''
        })
      });

      const data = await response.json();
      if (data.success) {
        statusEl.textContent = '✅ Job saved to JobPilot!';
        statusEl.className = 'status success';
        saveBtn.textContent = '✓ Saved!';
        // Auto-close after 2s
        setTimeout(() => window.close(), 2000);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      statusEl.textContent = `❌ ${err.message}. Is JobPilot server running?`;
      statusEl.className = 'status error';
      saveBtn.disabled = false;
      saveBtn.textContent = '🚀 Save to JobPilot';
    }
  });
});

// This function runs in the context of the web page
function extractJobInfo() {
  const info = { title: '', company: '', location: '' };

  // LinkedIn
  if (window.location.hostname.includes('linkedin.com')) {
    const titleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title, h1.t-24, .top-card-layout__title');
    const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, .topcard__org-name-link, .top-card-layout__card a[data-tracking-control-name*="company"]');
    const locationEl = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet, .topcard__flavor--bullet, .top-card-layout__card .topcard__flavor:not(.topcard__flavor--bullet)');

    if (titleEl) info.title = titleEl.textContent.trim();
    if (companyEl) info.company = companyEl.textContent.trim();
    if (locationEl) info.location = locationEl.textContent.trim();
  }

  // Indeed
  else if (window.location.hostname.includes('indeed.com')) {
    const titleEl = document.querySelector('.jobsearch-JobInfoHeader-title, h1[data-testid="jobsearch-JobInfoHeader-title"]');
    const companyEl = document.querySelector('.jobsearch-InlineCompanyRating-companyHeader a, [data-testid="inlineHeader-companyName"]');
    const locationEl = document.querySelector('.jobsearch-JobInfoHeader-subtitle [data-testid="job-location"], .jobsearch-InlineCompanyRating + div');

    if (titleEl) info.title = titleEl.textContent.trim();
    if (companyEl) info.company = companyEl.textContent.trim();
    if (locationEl) info.location = locationEl.textContent.trim();
  }

  // Naukri
  else if (window.location.hostname.includes('naukri.com')) {
    const titleEl = document.querySelector('.jd-header-title, h1.jd-header-title');
    const companyEl = document.querySelector('.jd-header-comp-name a, .comp-name');
    const locationEl = document.querySelector('.loc .locWdth, .location .loc');

    if (titleEl) info.title = titleEl.textContent.trim();
    if (companyEl) info.company = companyEl.textContent.trim();
    if (locationEl) info.location = locationEl.textContent.trim();
  }

  // Glassdoor
  else if (window.location.hostname.includes('glassdoor.com') || window.location.hostname.includes('glassdoor.co.in')) {
    const titleEl = document.querySelector('[data-test="jobTitle"], .css-1vg6q84');
    const companyEl = document.querySelector('[data-test="employerName"], .css-87uc0g');
    const locationEl = document.querySelector('[data-test="location"], .css-56kyx5');

    if (titleEl) info.title = titleEl.textContent.trim();
    if (companyEl) info.company = companyEl.textContent.trim();
    if (locationEl) info.location = locationEl.textContent.trim();
  }

  // Fallback: try common patterns
  if (!info.title) {
    const h1 = document.querySelector('h1');
    if (h1) info.title = h1.textContent.trim().substring(0, 100);
  }

  return info;
}
