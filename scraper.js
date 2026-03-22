// ========================================
// JobPilot — Job Detail Scraper
// Fetches and extracts job details from URLs
// ========================================

const axios = require('axios');
const cheerio = require('cheerio');

// Browser-like headers to avoid bot blocking
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
};

/**
 * Main entry point — scrape job details from a URL
 * @param {string} url - The job listing URL
 * @returns {Object} { title, company, location, salary, description }
 */
async function scrapeJobDetails(url) {
  const empty = { title: '', company: '', location: '', salary: '', description: '' };

  if (!url) return empty;

  try {
    // Follow redirects to resolve shortened URLs (bit.ly, lnkd.in, etc.)
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 12000,
      maxRedirects: 5,
    });

    const html = response.data;
    const finalUrl = response.request?.res?.responseUrl || url;
    const $ = cheerio.load(html);

    // Try platform-specific extractors first, then fall back to generic
    const host = new URL(finalUrl).hostname.toLowerCase();

    let details;
    if (host.includes('linkedin.com'))       details = extractLinkedIn($, html);
    else if (host.includes('indeed.com'))     details = extractIndeed($);
    else if (host.includes('naukri.com'))     details = extractNaukri($);
    else if (host.includes('glassdoor.com'))  details = extractGlassdoor($, html);
    else if (host.includes('lever.co'))       details = extractLever($);
    else if (host.includes('greenhouse.io'))  details = extractGreenhouse($);
    else if (host.includes('workday.com'))    details = extractWorkday($, html);
    else                                     details = extractGeneric($, html);

    // Clean up all fields
    return {
      title:       clean(details.title)       || extractFromMeta($, 'title'),
      company:     clean(details.company)      || '',
      location:    clean(details.location)     || '',
      salary:      clean(details.salary)       || '',
      description: clean(details.description)  || extractFromMeta($, 'description'),
    };
  } catch (err) {
    console.error(`[Scraper] Failed to scrape ${url}:`, err.message);
    return empty;
  }
}

// ============== PLATFORM EXTRACTORS ==============

function extractLinkedIn($, html) {
  // LinkedIn heavily uses JSON-LD for job postings
  const jsonLd = extractJsonLd(html, 'JobPosting');

  // Meta tags as backup
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDesc  = $('meta[property="og:description"]').attr('content') || '';

  // DOM selectors (for logged-in views)
  const domTitle   = $('.job-details-jobs-unified-top-card__job-title, .top-card-layout__title, h1.t-24').first().text();
  const domCompany = $('.job-details-jobs-unified-top-card__company-name, .topcard__org-name-link, a.topcard__org-name-link').first().text();
  const domLoc     = $('.job-details-jobs-unified-top-card__bullet, .topcard__flavor--bullet').first().text();

  // Parse "title at company" from og:title (e.g., "Software Engineer at Google")
  let titleFromOg = '', companyFromOg = '';
  if (ogTitle.includes(' at ')) {
    const parts = ogTitle.split(' at ');
    titleFromOg = parts[0].trim();
    companyFromOg = parts.slice(1).join(' at ').trim();
  }

  return {
    title:       jsonLd?.title || domTitle || titleFromOg || ogTitle,
    company:     jsonLd?.hiringOrganization?.name || domCompany || companyFromOg,
    location:    jsonLd?.jobLocation?.address?.addressLocality || domLoc || '',
    salary:      formatSalary(jsonLd?.baseSalary) || '',
    description: jsonLd?.description || domDescription($) || ogDesc,
  };
}

function extractIndeed($) {
  const title    = $('h1.jobsearch-JobInfoHeader-title, h1[data-testid="jobsearch-JobInfoHeader-title"], .icl-u-xs-mb--xs h1').first().text();
  const company  = $('[data-testid="inlineHeader-companyName"] a, .jobsearch-InlineCompanyRating-companyHeader a, [data-company-name="true"]').first().text();
  const location = $('[data-testid="inlineHeader-companyLocation"], .jobsearch-JobInfoHeader-subtitle .icl-u-xs-mt--xs div').first().text();
  const salary   = $('[data-testid="attribute_snippet_testid"], #salaryInfoAndJobType span').first().text();
  const desc     = $('#jobDescriptionText, .jobsearch-jobDescriptionText').first().text();

  return { title, company, location, salary, description: desc };
}

function extractNaukri($) {
  const title    = $('h1.jd-header-title, h1.styles_jd-header-title__rZwM1, h1').first().text();
  const company  = $('a.jd-header-comp-name, .styles_jd-header-comp-name__MvqAI a, .comp-name').first().text();
  const location = $('.loc .locWdth, .location, .ni-job-tuple-icon-srp-location').first().text();
  const salary   = $('.sal .salary, .salary, .ni-job-tuple-icon-srp-rupee').first().text();
  const desc     = $('.jd-desc, .styles_JDC__dang-inner-html__h0K4t, .job-desc').first().text();

  return { title, company, location, salary, description: desc };
}

function extractGlassdoor($, html) {
  const jsonLd = extractJsonLd(html, 'JobPosting');

  const title    = $('[data-test="job-title"], .e1tk4kwz5').first().text();
  const company  = $('[data-test="employer-name"], .e1tk4kwz1').first().text();
  const location = $('[data-test="location"], .e1tk4kwz3').first().text();
  const salary   = $('[data-test="detailSalary"], .css-1bluz6i').first().text();

  return {
    title:       jsonLd?.title || title,
    company:     jsonLd?.hiringOrganization?.name || company,
    location:    jsonLd?.jobLocation?.address?.addressLocality || location,
    salary:      formatSalary(jsonLd?.baseSalary) || salary,
    description: jsonLd?.description || '',
  };
}

function extractLever($) {
  const title    = $('.posting-headline h2').first().text();
  const location = $('.posting-headline .sort-by-time, .posting-categories .location').first().text();
  const company  = $('meta[property="og:title"]').attr('content')?.split(' - ')?.[1] || '';
  const desc     = $('[data-qa="job-description"], .posting-page .content').first().text();

  return { title, company: company.trim(), location, salary: '', description: desc };
}

function extractGreenhouse($) {
  const title    = $('h1.app-title, #header .app-title').first().text();
  const company  = $('meta[property="og:title"]').attr('content')?.split(' at ')?.[1] || '';
  const location = $('.location, #header .location').first().text();
  const desc     = $('#content .content-intro, #content').first().text();

  return { title, company: company.trim(), location, salary: '', description: desc };
}

function extractWorkday($, html) {
  const jsonLd = extractJsonLd(html, 'JobPosting');
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDesc  = $('meta[property="og:description"]').attr('content') || '';

  return {
    title:       jsonLd?.title || ogTitle,
    company:     jsonLd?.hiringOrganization?.name || '',
    location:    jsonLd?.jobLocation?.address?.addressLocality || '',
    salary:      formatSalary(jsonLd?.baseSalary) || '',
    description: jsonLd?.description || ogDesc,
  };
}

// ============== GENERIC EXTRACTOR ==============

function extractGeneric($, html) {
  // Try JSON-LD JobPosting first (many modern career pages use this)
  const jsonLd = extractJsonLd(html, 'JobPosting');

  if (jsonLd) {
    return {
      title:       jsonLd.title || '',
      company:     jsonLd.hiringOrganization?.name || '',
      location:    jsonLd.jobLocation?.address?.addressLocality ||
                   jsonLd.jobLocation?.address?.name || '',
      salary:      formatSalary(jsonLd.baseSalary) || '',
      description: jsonLd.description || '',
    };
  }

  // Fallback: OpenGraph + DOM
  const ogTitle = $('meta[property="og:title"]').attr('content') || '';
  const ogDesc  = $('meta[property="og:description"]').attr('content') || '';
  const h1      = $('h1').first().text();

  return {
    title:       ogTitle || h1,
    company:     $('meta[property="og:site_name"]').attr('content') || '',
    location:    '',
    salary:      '',
    description: ogDesc,
  };
}

// ============== HELPERS ==============

/**
 * Extract JSON-LD structured data of a specific @type
 */
function extractJsonLd(html, type) {
  try {
    const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        let data = JSON.parse(match[1]);
        // Handle arrays (some pages wrap in array)
        if (Array.isArray(data)) {
          data = data.find(d => d['@type'] === type) || data[0];
        }
        // Handle @graph
        if (data['@graph']) {
          data = data['@graph'].find(d => d['@type'] === type) || data['@graph'][0];
        }
        if (data && data['@type'] === type) {
          return data;
        }
      } catch (e) { /* skip invalid JSON */ }
    }
  } catch (e) {}
  return null;
}

/**
 * Extract title or description from meta tags
 */
function extractFromMeta($, field) {
  if (field === 'title') {
    return $('meta[property="og:title"]').attr('content') ||
           $('meta[name="twitter:title"]').attr('content') ||
           $('title').text() || '';
  }
  if (field === 'description') {
    return $('meta[property="og:description"]').attr('content') ||
           $('meta[name="description"]').attr('content') || '';
  }
  return '';
}

/**
 * Extract description from DOM body
 */
function domDescription($) {
  return $('.description__text, .show-more-less-html__markup, .job-description').first().text();
}

/**
 * Format salary from JSON-LD baseSalary object
 */
function formatSalary(baseSalary) {
  if (!baseSalary) return '';
  try {
    const value = baseSalary.value;
    if (!value) return '';
    const currency = baseSalary.currency || '';
    if (value.minValue && value.maxValue) {
      return `${currency} ${value.minValue.toLocaleString()} - ${value.maxValue.toLocaleString()} ${value.unitText || ''}`.trim();
    }
    if (value.value) {
      return `${currency} ${value.value.toLocaleString()} ${value.unitText || ''}`.trim();
    }
  } catch (e) {}
  return '';
}

/**
 * Clean whitespace, newlines, and limit length
 */
function clean(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 500);
}

module.exports = { scrapeJobDetails };
