#!/usr/bin/env node
/**
 * TYZD Auto Content Generator v1.0
 * Tıpta Yapay Zeka Derneği - Research-Driven Content Pipeline
 *
 * Pipeline: Discover → Research → Generate Blog + Instagram → Publish
 *
 * Sources:
 *   - PubMed (scientific papers, NCBI E-utilities)
 *   - ClinicalTrials.gov v2 (clinical trials, free JSON API)
 *   - Google News RSS (health/AI news headlines)
 *   - Brave Search (optional, needs BRAVE_API_KEY)
 *   - FDA openFDA API (device/drug approvals)
 *
 * USAGE:
 *   node auto-content-generator.js                     # Full pipeline
 *   node auto-content-generator.js --topic "Konu"      # Research specific topic
 *   node auto-content-generator.js --discover           # Show trending topics only
 *   node auto-content-generator.js --area ai_endoscopy  # Focus on one research area
 *   node auto-content-generator.js --deploy             # Generate + git commit/push
 *   node auto-content-generator.js --search-only "q"    # Search only, no generation
 *   node auto-content-generator.js --dry-run            # Full pipeline, don't write files
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import blog template from blog-generator.js
const { BLOG_TEMPLATE, CONFIG: BLOG_CONFIG } = require('./blog-generator.js');

// =============================================================================
// CONFIGURATION
// =============================================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const XAI_API_KEY = process.env.XAI_API_KEY;
const BRAVE_API_KEY = process.env.BRAVE_API_KEY; // Optional

// Determine which LLM provider to use
const LLM_PROVIDER = ANTHROPIC_API_KEY ? 'anthropic' : (XAI_API_KEY ? 'xai' : null);
const LLM_MODEL = ANTHROPIC_API_KEY ? 'claude-sonnet-4-20250514' : 'grok-3-mini';
const OUTPUT_DIR = path.join(__dirname, '../blog');
const BLOG_INDEX = path.join(__dirname, '../blog-posts.json');
const HISTORY_FILE = path.join(__dirname, '../data/content-history.json');
const INSTAGRAM_DIR = path.join(__dirname, '../instagram-templates');

const REQUEST_TIMEOUT = 15000; // 15s per request
const PUBMED_DELAY = 350; // PubMed rate limit: 3 req/s without API key

// =============================================================================
// CATEGORIES (TYZD Medical AI Categories)
// =============================================================================

const CATEGORIES = {
  'endoskopi':  { icon: '🔬', color: '#14b8a6', name: 'Endoskopi' },
  'radyoloji':  { icon: '📡', color: '#06b6d4', name: 'Radyoloji' },
  'patoloji':   { icon: '🧬', color: '#14b8a6', name: 'Patoloji' },
  'llm':        { icon: '🤖', color: '#06b6d4', name: 'Büyük Dil Modelleri' },
  'etik':       { icon: '⚖️', color: '#0ea5e9', name: 'Etik' },
  'arastirma':  { icon: '📊', color: '#06b6d4', name: 'Araştırma' },
  'egitim':     { icon: '🎓', color: '#06b6d4', name: 'Eğitim' },
  'politika':   { icon: '🏛️', color: '#0ea5e9', name: 'Politika' },
  'genel':      { icon: '🧠', color: '#0ea5e9', name: 'Genel' }
};

// =============================================================================
// RESEARCH AREAS (8 areas for medical AI scanning)
// =============================================================================

const RESEARCH_AREAS = {
  ai_endoscopy: {
    name: 'Endoskopide Yapay Zeka',
    pubmed: ['(artificial intelligence OR deep learning) AND (endoscopy OR colonoscopy OR gastroscopy) AND (2024[dp] OR 2025[dp] OR 2026[dp])'],
    news: ['AI endoscopy polyp detection study', 'artificial intelligence colonoscopy'],
    trials: ['artificial intelligence endoscopy OR deep learning colonoscopy OR CADe CADx'],
    category: 'endoskopi'
  },
  ai_radiology: {
    name: 'Radyolojide AI',
    pubmed: ['(artificial intelligence OR deep learning) AND (radiology OR imaging OR CT OR MRI) AND (2024[dp] OR 2025[dp] OR 2026[dp])'],
    news: ['AI radiology FDA approval', 'deep learning medical imaging'],
    trials: ['artificial intelligence radiology OR deep learning imaging diagnosis'],
    category: 'radyoloji'
  },
  ai_pathology: {
    name: 'Patolojide AI',
    pubmed: ['(artificial intelligence OR deep learning) AND (pathology OR histopathology OR digital pathology) AND (2024[dp] OR 2025[dp] OR 2026[dp])'],
    news: ['AI pathology cancer detection', 'digital pathology deep learning'],
    trials: ['artificial intelligence pathology OR computational pathology'],
    category: 'patoloji'
  },
  llm_clinical: {
    name: 'LLM Klinik Uygulamalar',
    pubmed: ['(large language model OR GPT OR ChatGPT) AND (clinical OR medical OR healthcare) AND (2024[dp] OR 2025[dp] OR 2026[dp])'],
    news: ['ChatGPT medical diagnosis', 'LLM healthcare clinical decision'],
    trials: ['large language model clinical OR GPT medical decision'],
    category: 'llm'
  },
  ai_ethics: {
    name: 'Tıpta AI Etiği',
    pubmed: ['(artificial intelligence) AND (ethics OR bias OR fairness OR equity) AND (healthcare OR medicine) AND (2024[dp] OR 2025[dp] OR 2026[dp])'],
    news: ['AI healthcare ethics bias regulation', 'EU AI Act health'],
    trials: [],
    category: 'etik'
  },
  ai_drug_discovery: {
    name: 'AI ile İlaç Keşfi',
    pubmed: ['(artificial intelligence OR machine learning) AND (drug discovery OR drug development) AND (2024[dp] OR 2025[dp] OR 2026[dp])'],
    news: ['AI drug discovery breakthrough', 'machine learning pharmaceutical'],
    trials: ['artificial intelligence drug discovery OR AI-designed drug'],
    category: 'arastirma'
  },
  ai_surgery: {
    name: 'Cerrahi ve Robotik AI',
    pubmed: ['(artificial intelligence OR machine learning) AND (surgery OR robotic surgery OR surgical planning) AND (2024[dp] OR 2025[dp] OR 2026[dp])'],
    news: ['AI robotic surgery autonomous', 'artificial intelligence surgical outcome'],
    trials: ['artificial intelligence surgery OR robotic surgery AI'],
    category: 'genel'
  },
  ai_turkey: {
    name: 'Türkiye AI Sağlık',
    pubmed: ['(Turkey OR Turkish) AND (artificial intelligence OR machine learning) AND (medicine OR health) AND (2024[dp] OR 2025[dp] OR 2026[dp])'],
    news: ['Türkiye yapay zeka sağlık', 'Turkey AI healthcare'],
    trials: [],
    category: 'genel'
  }
};

// =============================================================================
// PRIORITY & FILTERING
// =============================================================================

const PRIORITY_TRIGGERS = {
  urgent: [
    'FDA approves', 'FDA clears', 'EMA approves', 'CE mark',
    'Phase 3 results', 'Phase III results',
    'first-in-class', 'pivotal trial', 'breakthrough device',
    'guideline update', 'Cochrane review',
    'regulatory approval', 'clinical validation'
  ],
  high: [
    'clinical trial results', 'randomized controlled',
    'meta-analysis', 'systematic review',
    'conference presentation', 'multicenter study',
    'Phase 2 results', 'Phase II results',
    'large cohort', 'prospective study',
    'real-world evidence', 'FDA clearance'
  ],
  normal: [
    'Phase 1', 'observational study', 'review article',
    'pilot study', 'case series', 'retrospective',
    'proof of concept', 'feasibility study'
  ]
};

const EXCLUDE_PATTERNS = [
  /celebrity|influencer|sponsored|advertisement/i,
  /miracle|secret|shocking|clickbait/i,
  /unverified|supplement promotion/i,
  /buy now|limited offer|discount code/i,
  /weight loss hack|belly fat trick/i
];

const TRUSTED_DOMAINS = new Set([
  'nejm.org', 'thelancet.com', 'jamanetwork.com', 'bmj.com',
  'nature.com', 'cell.com', 'science.org', 'ahajournals.org',
  'academic.oup.com', 'wiley.com', 'springer.com',
  'fda.gov', 'ema.europa.eu', 'who.int',
  'statnews.com', 'reuters.com', 'medscape.com',
  'pubmed.ncbi.nlm.nih.gov', 'europepmc.org', 'clinicaltrials.gov',
  'radiologyai.rsna.org', 'rsna.org',
  'gastrojournal.org', 'giejournal.org',
  'pathologyoutlines.com',
  'arxiv.org', 'medrxiv.org', 'biorxiv.org',
  'saglik.gov.tr', 'titck.gov.tr', 'tubitak.gov.tr',
  'endpts.com', 'fiercebiotech.com'
]);

const CORE_KEYWORDS = [
  'artificial intelligence', 'yapay zeka', 'deep learning', 'derin öğrenme',
  'machine learning', 'makine öğrenmesi', 'neural network',
  'medical AI', 'clinical AI', 'healthcare AI',
  'endoscopy', 'endoskopi', 'colonoscopy', 'kolonoskopi',
  'radiology', 'radyoloji', 'pathology', 'patoloji',
  'LLM', 'GPT', 'ChatGPT', 'large language model',
  'FDA', 'CE mark', 'approval', 'regulatory',
  'computer-aided detection', 'CADe', 'CADx',
  'clinical decision support', 'diagnostic AI'
];

function detectPriority(text) {
  const lower = text.toLowerCase();
  for (const trigger of PRIORITY_TRIGGERS.urgent) {
    if (lower.includes(trigger.toLowerCase())) return 'urgent';
  }
  for (const trigger of PRIORITY_TRIGGERS.high) {
    if (lower.includes(trigger.toLowerCase())) return 'high';
  }
  return 'normal';
}

function isExcluded(text) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(text));
}

function isTrustedSource(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return [...TRUSTED_DOMAINS].some(domain => hostname.endsWith(domain));
  } catch {
    return false;
  }
}

function scoreFinding(finding) {
  let score = 0;
  // Priority
  if (finding.priority === 'urgent') score += 100;
  else if (finding.priority === 'high') score += 50;
  else score += 10;
  // Source trust
  if (finding.trusted) score += 30;
  // Recency
  const currentYear = new Date().getFullYear();
  if (finding.year >= currentYear) score += 20;
  else if (finding.year >= currentYear - 1) score += 10;
  // Has abstract/summary
  if (finding.abstract && finding.abstract.length > 200) score += 15;
  // Journal impact (rough heuristic)
  const highImpact = ['nejm', 'lancet', 'nature', 'jama', 'bmj', 'cell', 'radiology', 'gastroenterology', 'gut'];
  if (finding.journal && highImpact.some(j => finding.journal.toLowerCase().includes(j))) score += 25;
  // Core topic relevance
  const text = `${finding.title} ${finding.abstract || ''}`.toLowerCase();
  const coreMatches = CORE_KEYWORDS.filter(kw => text.includes(kw.toLowerCase())).length;
  score += Math.min(coreMatches * 15, 60);
  // Penalty for no core keyword match
  if (coreMatches === 0) score -= 30;
  return score;
}

// =============================================================================
// SEARCH ENGINES
// =============================================================================

async function fetchWithTimeout(url, options = {}, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error(`Timeout: ${url}`);
    throw err;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Search PubMed via NCBI E-utilities
 * Free, no key needed (3 req/s limit)
 */
async function searchPubMed(query, maxResults = 5) {
  const results = [];
  try {
    // Step 1: Search for PMIDs
    const searchParams = new URLSearchParams({
      db: 'pubmed',
      term: query,
      retmax: String(maxResults),
      sort: 'date',
      retmode: 'json'
    });
    const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${searchParams}`;
    const searchResponse = await fetchWithTimeout(searchUrl);
    if (!searchResponse.ok) throw new Error(`PubMed esearch ${searchResponse.status}`);
    const searchData = await searchResponse.json();
    const pmids = searchData.esearchresult?.idlist || [];

    if (pmids.length === 0) return results;
    await sleep(PUBMED_DELAY);

    // Step 2: Fetch summaries (JSON)
    const summaryParams = new URLSearchParams({
      db: 'pubmed',
      id: pmids.join(','),
      retmode: 'json'
    });
    const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${summaryParams}`;
    const summaryResponse = await fetchWithTimeout(summaryUrl);
    if (!summaryResponse.ok) throw new Error(`PubMed esummary ${summaryResponse.status}`);
    const summaryData = await summaryResponse.json();
    await sleep(PUBMED_DELAY);

    // Step 3: Fetch abstracts (XML)
    const fetchParams = new URLSearchParams({
      db: 'pubmed',
      id: pmids.join(','),
      rettype: 'abstract',
      retmode: 'xml'
    });
    const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?${fetchParams}`;
    const fetchResponse = await fetchWithTimeout(fetchUrl);
    const xml = fetchResponse.ok ? await fetchResponse.text() : '';

    // Parse abstracts from XML
    const abstractMap = {};
    const articleBlocks = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
    for (const block of articleBlocks) {
      const pmidMatch = block.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      const abstractParts = block.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g) || [];
      if (pmidMatch) {
        abstractMap[pmidMatch[1]] = abstractParts
          .map(p => p.replace(/<[^>]+>/g, '').trim())
          .join(' ');
      }
    }

    // Build results
    const uids = summaryData.result?.uids || pmids;
    for (const pmid of uids) {
      const article = summaryData.result?.[pmid];
      if (!article || !article.title) continue;

      const title = article.title.replace(/<[^>]+>/g, '');
      const authors = (article.authors || []).map(a => a.name).join(', ');
      const journal = article.fulljournalname || article.source || '';
      const pubDate = article.pubdate || article.sortpubdate || '';
      const doi = (article.articleids || []).find(a => a.idtype === 'doi')?.value || '';
      const abstract = abstractMap[pmid] || '';
      const year = parseInt(pubDate) || new Date().getFullYear();

      const text = `${title} ${abstract}`;
      if (isExcluded(text)) continue;

      results.push({
        type: 'paper',
        title,
        abstract,
        authors,
        journal,
        year,
        doi,
        pmid,
        url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        source: 'pubmed',
        priority: detectPriority(text),
        trusted: true,
        citedByCount: 0
      });
    }
  } catch (err) {
    console.warn(`⚠️  PubMed arama hatası: ${err.message}`);
  }
  return results;
}

/**
 * Search ClinicalTrials.gov v2 API
 * Free JSON API, no key needed
 */
async function searchClinicalTrials(query, maxResults = 5) {
  if (!query) return [];
  const results = [];
  try {
    const params = new URLSearchParams({
      'query.term': query,
      pageSize: String(maxResults),
      sort: 'LastUpdatePostDate',
      format: 'json'
    });
    const url = `https://clinicaltrials.gov/api/v2/studies?${params}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`ClinicalTrials.gov ${response.status}`);
    const data = await response.json();

    for (const study of (data.studies || [])) {
      const proto = study.protocolSection || {};
      const id = proto.identificationModule || {};
      const status = proto.statusModule || {};
      const design = proto.designModule || {};
      const desc = proto.descriptionModule || {};
      const enrollment = design.enrollmentInfo?.count || 0;

      const title = id.briefTitle || id.officialTitle || 'Untitled';
      const summary = desc.briefSummary || '';
      const text = `${title} ${summary}`;
      if (isExcluded(text)) continue;

      results.push({
        type: 'trial',
        title,
        abstract: summary,
        nctId: id.nctId || '',
        status: status.overallStatus || '',
        phase: (design.phases || []).join(', '),
        enrollment,
        url: id.nctId ? `https://clinicaltrials.gov/study/${id.nctId}` : '',
        source: 'clinicaltrials',
        priority: detectPriority(text),
        trusted: true,
        year: new Date().getFullYear()
      });
    }
  } catch (err) {
    console.warn(`⚠️  ClinicalTrials.gov arama hatası: ${err.message}`);
  }
  return results;
}

/**
 * Search Google News via RSS
 * Free, no API key needed
 */
async function searchGoogleNews(query, maxResults = 5) {
  const results = [];
  try {
    const params = new URLSearchParams({
      q: query,
      hl: 'en',
      gl: 'US',
      ceid: 'US:en'
    });
    const url = `https://news.google.com/rss/search?${params}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Google News RSS ${response.status}`);
    const xml = await response.text();

    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    for (const item of items.slice(0, maxResults)) {
      const title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/) || [])[1] || '';
      const link = (item.match(/<link>(.*?)<\/link>/) || item.match(/<link\/>\s*(.*?)[\s<]/) || [])[1] || '';
      const pubDate = (item.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || '';
      const description = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/) || [])[1] || '';

      const cleanTitle = title.replace(/<[^>]+>/g, '').trim();
      const cleanDesc = description.replace(/<[^>]+>/g, '').trim();
      const text = `${cleanTitle} ${cleanDesc}`;
      if (isExcluded(text) || !cleanTitle) continue;

      results.push({
        type: 'news',
        title: cleanTitle,
        abstract: cleanDesc,
        url: link,
        pubDate,
        source: 'google_news',
        priority: detectPriority(text),
        trusted: isTrustedSource(link),
        year: pubDate ? new Date(pubDate).getFullYear() : new Date().getFullYear()
      });
    }
  } catch (err) {
    console.warn(`⚠️  Google News arama hatası: ${err.message}`);
  }
  return results;
}

/**
 * Search Brave Web Search API (optional)
 * Needs BRAVE_API_KEY environment variable
 */
async function searchBrave(query, maxResults = 5) {
  if (!BRAVE_API_KEY) return [];
  const results = [];
  try {
    const params = new URLSearchParams({
      q: query,
      count: String(maxResults),
      freshness: 'pm' // past month
    });
    const url = `https://api.search.brave.com/res/v1/web/search?${params}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip',
        'X-Subscription-Token': BRAVE_API_KEY
      }
    });
    if (!response.ok) throw new Error(`Brave Search ${response.status}`);
    const data = await response.json();

    for (const result of (data.web?.results || [])) {
      const text = `${result.title} ${result.description || ''}`;
      if (isExcluded(text)) continue;

      results.push({
        type: 'web',
        title: result.title,
        abstract: result.description || '',
        url: result.url,
        source: 'brave',
        priority: detectPriority(text),
        trusted: isTrustedSource(result.url),
        year: new Date().getFullYear()
      });
    }
  } catch (err) {
    console.warn(`⚠️  Brave Search hatası: ${err.message}`);
  }
  return results;
}

/**
 * Search FDA Device Approvals via openFDA API
 * Free, no key needed
 */
async function searchFDA(query, maxResults = 5) {
  const results = [];
  try {
    // Search 510k premarket notifications for AI/ML devices
    const params = new URLSearchParams({
      search: `device_name:"${query}" OR advisory_committee_description:"${query}"`,
      limit: String(maxResults),
      sort: 'decision_date:desc'
    });
    const url = `https://api.fda.gov/device/510k.json?${params}`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return results;
    const data = await response.json();

    for (const item of (data.results || [])) {
      const deviceName = item.device_name || '';
      const applicant = item.applicant || '';
      const decision = item.decision_description || '';
      const title = `FDA 510(k): ${deviceName} by ${applicant}`;
      const text = `${title} ${decision}`;

      results.push({
        type: 'fda',
        title,
        abstract: `${decision}. Product: ${item.product_code || ''}`,
        url: `https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfpmn/pmn.cfm?ID=${item.k_number || ''}`,
        source: 'fda',
        priority: detectPriority(text),
        trusted: true,
        year: item.decision_date ? new Date(item.decision_date).getFullYear() : new Date().getFullYear()
      });
    }
  } catch (err) {
    console.warn(`⚠️  FDA API hatası: ${err.message}`);
  }

  // Also search openFDA drug labels for AI-related drugs
  try {
    const params2 = new URLSearchParams({
      search: `openfda.generic_name:"${query}" OR openfda.brand_name:"${query}"`,
      limit: String(Math.min(maxResults, 3)),
      sort: 'effective_time:desc'
    });
    const url2 = `https://api.fda.gov/drug/label.json?${params2}`;
    const response2 = await fetchWithTimeout(url2);
    if (response2.ok) {
      const data2 = await response2.json();
      for (const item of (data2.results || [])) {
        const brandName = item.openfda?.brand_name?.[0] || '';
        const genericName = item.openfda?.generic_name?.[0] || '';
        const purpose = (item.purpose || []).join(', ').substring(0, 200);
        const title = `FDA: ${brandName || genericName} Label Update`;

        results.push({
          type: 'fda',
          title,
          abstract: purpose || `${brandName} (${genericName})`,
          url: 'https://www.fda.gov/drugs',
          source: 'fda',
          priority: detectPriority(title),
          trusted: true,
          year: new Date().getFullYear()
        });
      }
    }
  } catch (err) {
    // Silently ignore drug label search failures
  }

  return results;
}

/**
 * Search trusted medical AI sites via Google
 */
async function searchTrustedSite(domain, query, maxResults = 3) {
  const googleQuery = `site:${domain} ${query}`;
  const results = await searchGoogleNews(googleQuery, maxResults);
  return results.map(r => ({ ...r, source: domain, trusted: true }));
}

/**
 * Fetch and extract readable text from a URL
 */
async function fetchArticleText(url, maxChars = 3000) {
  try {
    const response = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'TYZD-Research-Bot/1.0' }
    });
    if (!response.ok) return '';
    const html = await response.text();

    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '');

    const articleMatch = text.match(/<article[\s\S]*?<\/article>/i);
    if (articleMatch) text = articleMatch[0];

    text = text.replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    return text.substring(0, maxChars);
  } catch {
    return '';
  }
}

// =============================================================================
// RESEARCH PIPELINE
// =============================================================================

/**
 * Scan all research areas and collect findings
 */
async function discoverTopics(focusArea = null) {
  console.log('\n🔍 Araştırma taraması başlıyor...\n');
  const allFindings = [];
  const areas = focusArea ? { [focusArea]: RESEARCH_AREAS[focusArea] } : RESEARCH_AREAS;

  if (focusArea && !RESEARCH_AREAS[focusArea]) {
    console.error(`❌ Bilinmeyen alan: ${focusArea}`);
    console.log(`   Geçerli alanlar: ${Object.keys(RESEARCH_AREAS).join(', ')}`);
    process.exit(1);
  }

  for (const [areaKey, area] of Object.entries(areas)) {
    console.log(`📡 ${area.name}...`);

    // Search PubMed
    for (const query of area.pubmed) {
      const papers = await searchPubMed(query, 3);
      for (const p of papers) { p.area = areaKey; p.areaName = area.name; }
      allFindings.push(...papers);
      await sleep(PUBMED_DELAY);
    }

    // Search ClinicalTrials.gov
    for (const query of area.trials) {
      const trials = await searchClinicalTrials(query, 3);
      for (const t of trials) { t.area = areaKey; t.areaName = area.name; }
      allFindings.push(...trials);
      await sleep(200);
    }

    // Search Google News
    for (const query of area.news) {
      const news = await searchGoogleNews(query, 3);
      for (const n of news) { n.area = areaKey; n.areaName = area.name; }
      allFindings.push(...news);
      await sleep(200);
    }

    // Search trusted AI health sites
    if (area.news[0]) {
      const q = area.news[0];
      const [rsna, statnews, medscape] = await Promise.all([
        searchTrustedSite('rsna.org', q, 2),
        searchTrustedSite('statnews.com', q, 2),
        searchTrustedSite('medscape.com', q, 2)
      ]);
      const siteResults = [...rsna, ...statnews, ...medscape];
      for (const r of siteResults) { r.area = areaKey; r.areaName = area.name; }
      allFindings.push(...siteResults);
      await sleep(300);
    }

    // Search FDA for device-related areas
    if (['ai_endoscopy', 'ai_radiology', 'ai_pathology'].includes(areaKey)) {
      const fdaQuery = areaKey === 'ai_endoscopy' ? 'artificial intelligence endoscopy'
        : areaKey === 'ai_radiology' ? 'artificial intelligence radiology'
        : 'artificial intelligence pathology';
      const fda = await searchFDA(fdaQuery, 3);
      for (const f of fda) { f.area = areaKey; f.areaName = area.name; }
      allFindings.push(...fda);
      await sleep(200);
    }

    // Search Brave (if available)
    if (BRAVE_API_KEY) {
      for (const query of area.news) {
        const web = await searchBrave(query, 3);
        for (const w of web) { w.area = areaKey; w.areaName = area.name; }
        allFindings.push(...web);
        await sleep(200);
      }
    }
  }

  // Score and sort
  for (const f of allFindings) {
    f.score = scoreFinding(f);
  }
  allFindings.sort((a, b) => b.score - a.score);

  // Deduplicate by title similarity
  const seen = new Set();
  const unique = allFindings.filter(f => {
    const key = f.title.toLowerCase().substring(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\n✅ Toplam ${unique.length} benzersiz bulgu (${allFindings.length} ham sonuçtan)\n`);
  return unique;
}

/**
 * Deep research on a specific topic
 */
async function conductDeepResearch(topic, area = null) {
  console.log(`\n🔬 Derin araştırma: "${topic}"\n`);
  const findings = { papers: [], trials: [], news: [], articles: [] };

  const paperQueries = [
    topic,
    topic.replace(/[^a-zA-Z0-9\s]/g, '').trim()
  ];

  for (const query of paperQueries) {
    const papers = await searchPubMed(query, 5);
    findings.papers.push(...papers);
    await sleep(PUBMED_DELAY);
  }

  const trialQuery = topic.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const trials = await searchClinicalTrials(trialQuery, 5);
  findings.trials.push(...trials);

  const [news, rsna, statnews, medscape] = await Promise.all([
    searchGoogleNews(topic, 5),
    searchTrustedSite('rsna.org', topic, 3),
    searchTrustedSite('statnews.com', topic, 3),
    searchTrustedSite('medscape.com', topic, 3)
  ]);
  findings.news.push(...news, ...rsna, ...statnews, ...medscape);

  // FDA search for device topics
  const fda = await searchFDA(topic, 3);
  findings.news.push(...fda);

  if (BRAVE_API_KEY) {
    const braveResults = await searchBrave(topic, 5);
    findings.news.push(...braveResults);
  }

  // Fetch article text from top trusted sources (up to 3)
  const trustedUrls = [
    ...findings.papers.filter(p => p.url && p.trusted).map(p => p.url),
    ...findings.news.filter(n => n.url && n.trusted).map(n => n.url)
  ].slice(0, 3);

  for (const url of trustedUrls) {
    console.log(`📄 Makale çekiliyor: ${url.substring(0, 80)}...`);
    const text = await fetchArticleText(url);
    if (text.length > 100) {
      findings.articles.push({ url, text: text.substring(0, 2000) });
    }
    await sleep(500);
  }

  // Deduplicate
  const seenPapers = new Set();
  findings.papers = findings.papers.filter(p => {
    const key = (p.doi || p.title.substring(0, 50)).toLowerCase();
    if (seenPapers.has(key)) return false;
    seenPapers.add(key);
    return true;
  });

  console.log(`   📚 ${findings.papers.length} makale, 🧪 ${findings.trials.length} klinik çalışma, 📰 ${findings.news.length} haber, 📄 ${findings.articles.length} tam metin`);
  return findings;
}

/**
 * Build research context string for LLM
 */
function buildResearchContext(findings) {
  const sections = [];

  if (findings.papers.length > 0) {
    sections.push('## Bilimsel Makaleler (PubMed)\n');
    for (const p of findings.papers.slice(0, 8)) {
      sections.push(`### ${p.title}`);
      if (p.authors) sections.push(`Yazarlar: ${p.authors}`);
      if (p.journal) sections.push(`Dergi: ${p.journal} (${p.year})`);
      if (p.doi) sections.push(`DOI: ${p.doi}`);
      if (p.abstract) sections.push(`Özet: ${p.abstract.substring(0, 500)}`);
      sections.push('');
    }
  }

  if (findings.trials.length > 0) {
    sections.push('## Klinik Çalışmalar (ClinicalTrials.gov)\n');
    for (const t of findings.trials.slice(0, 5)) {
      sections.push(`### ${t.title}`);
      if (t.nctId) sections.push(`NCT: ${t.nctId}`);
      if (t.status) sections.push(`Durum: ${t.status}`);
      if (t.phase) sections.push(`Faz: ${t.phase}`);
      if (t.enrollment) sections.push(`Katılımcı: ${t.enrollment}`);
      if (t.abstract) sections.push(`Özet: ${t.abstract.substring(0, 400)}`);
      sections.push('');
    }
  }

  if (findings.news.length > 0) {
    sections.push('## Güncel Haberler\n');
    for (const n of findings.news.slice(0, 5)) {
      sections.push(`- **${n.title}**`);
      if (n.abstract) sections.push(`  ${n.abstract.substring(0, 200)}`);
      if (n.url) sections.push(`  Kaynak: ${n.url}`);
      if (n.trusted) sections.push(`  ✅ Güvenilir kaynak`);
    }
    sections.push('');
  }

  if (findings.articles.length > 0) {
    sections.push('## Makale İçerikleri\n');
    for (const a of findings.articles) {
      sections.push(`Kaynak: ${a.url}`);
      sections.push(a.text.substring(0, 1500));
      sections.push('---\n');
    }
  }

  return sections.join('\n');
}

// =============================================================================
// TOPIC SELECTION
// =============================================================================

function checkContentHistory(topic) {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return false;
    const history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    const topicWords = topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const entry of history) {
      const entryWords = entry.topic.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      const overlap = topicWords.filter(w => entryWords.includes(w)).length;
      const similarity = overlap / Math.max(topicWords.length, 1);
      if (similarity > 0.6) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function addToHistory(topic, slug) {
  const dataDir = path.join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  let history = [];
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch { /* start fresh */ }

  history.unshift({
    topic,
    slug,
    date: new Date().toISOString().split('T')[0]
  });
  history = history.slice(0, 200);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
}

function selectTopicFromFindings(findings) {
  const bestPerArea = {};
  for (const f of findings) {
    if (!bestPerArea[f.area] || f.score > bestPerArea[f.area].score) {
      bestPerArea[f.area] = f;
    }
  }

  const ranked = Object.values(bestPerArea).sort((a, b) => b.score - a.score);

  for (const finding of ranked) {
    const topicText = finding.title;
    if (!checkContentHistory(topicText)) {
      return {
        topic: topicText,
        category: RESEARCH_AREAS[finding.area]?.category || 'genel',
        priority: finding.priority,
        area: finding.area,
        areaName: finding.areaName,
        finding
      };
    }
    console.log(`⏭️  Daha önce yazılmış, atlıyorum: ${topicText.substring(0, 60)}...`);
  }

  if (findings.length > 0) {
    const best = findings[0];
    return {
      topic: best.title,
      category: RESEARCH_AREAS[best.area]?.category || 'genel',
      priority: best.priority,
      area: best.area,
      areaName: best.areaName,
      finding: best
    };
  }

  return null;
}

// Static topic pool (fallback)
const TOPIC_POOL = [
  { topic: "Kolonoskopide yapay zeka destekli polip tespiti: CADe sistemleri", category: "endoskopi", priority: "high" },
  { topic: "Radyolojide derin öğrenme: FDA onaylı AI ürünleri", category: "radyoloji", priority: "high" },
  { topic: "Dijital patolojide yapay zeka: Kanser tanısında yeni dönem", category: "patoloji", priority: "high" },
  { topic: "GPT-4 ve klinik karar destek: Büyük dil modellerinin tıptaki yeri", category: "llm", priority: "high" },
  { topic: "Tıpta yapay zeka etiği: Algoritmik önyargı ve adalet", category: "etik", priority: "high" },
  { topic: "AI ile ilaç keşfi: Molekül tasarımından klinik çalışmalara", category: "arastirma", priority: "normal" },
  { topic: "Robotik cerrahi ve yapay zeka: Otonom sistemlerin geleceği", category: "genel", priority: "normal" },
  { topic: "Türkiye'de tıpta yapay zeka: Mevcut durum ve fırsatlar", category: "genel", priority: "high" },
  { topic: "EU AI Act ve sağlık: Yeni düzenlemelerin klinik etkisi", category: "etik", priority: "urgent" },
  { topic: "Endoskopide CADx: Polip karakterizasyonunda yapay zeka", category: "endoskopi", priority: "high" }
];

function selectFromPool() {
  const unused = TOPIC_POOL.filter(t => !checkContentHistory(t.topic));
  if (unused.length === 0) return TOPIC_POOL[Math.floor(Math.random() * TOPIC_POOL.length)];
  const high = unused.filter(t => t.priority === 'high' || t.priority === 'urgent');
  const pool = high.length > 0 ? high : unused;
  return pool[Math.floor(Math.random() * pool.length)];
}

// =============================================================================
// BLOG + INSTAGRAM CONTENT GENERATION
// =============================================================================

const BLOG_SYSTEM_PROMPT = `Sen TYZD (Tıpta Yapay Zeka Derneği) için içerik yazarısın. Tıpta yapay zeka konusunda Türkçe, bilimsel, anlaşılır blog yazıları ve Instagram paylaşımları oluşturuyorsun.

KURALLAR:
1. Her zaman Türkçe yaz
2. Bilimsel kaynaklara (PubMed, Nature, NEJM, Lancet) dayalı ol
3. Hem hekimlerin hem mühendislerin anlayacağı dilde yaz
4. AI terimlerini kısaca açıkla (CNN = Evrişimli Sinir Ağı, transformer, LLM vb.)
5. Türkiye perspektifini ve klinik uygulamayı vurgula
6. 1000-1500 kelime arası blog + Instagram caption

AKADEMİK KALİTE:
- En az 5 farklı kaynak referans göster
- Her kaynak için DOI veya PubMed linki kullan
- Alt başlıklar (## ve ###), listeler ve kalın metin kullan
- Kanıt seviyelerini belirt (🟢 Güçlü kanıt, 🟡 Orta kanıt, 🔴 Erken kanıt)
- Hayvan çalışması/in vitro bulgularını "insana genellenemez" olarak işaretle
- Tıbbi tavsiye vermekten kaçın, bilgi amaçlı olduğunu belirt

YASAKLI İFADELER: "çığır açan", "devrim yaratan", "mucize", "şok eden"
Bunların yerine: "önemli", "dikkat çekici", "umut verici", "anlamlı"

İÇERİK FORMATI — SADECE JSON:
{
  "title": "Başlık (max 70 karakter, SEO uyumlu, Türkçe)",
  "description": "Meta açıklama (max 155 karakter, Türkçe)",
  "category": "endoskopi|radyoloji|patoloji|llm|etik|arastirma|egitim|politika|genel",
  "content": "HTML formatında blog içeriği (h2, h3, p, ul, li, blockquote kullan)",
  "keyPoints": ["Önemli nokta 1", "Önemli nokta 2", "Önemli nokta 3", "Önemli nokta 4"],
  "sources": [
    {"title": "Yazarlar et al. Tam kaynak. Dergi. Yıl;cilt:sayfa.", "url": "https://doi.org/... veya PubMed"}
  ],
  "readTime": 8,
  "instagram": {
    "caption": "Instagram caption metni (emoji + hashtag dahil, 2200 karakter max). Türkçe, bilgilendirici, 5-7 hashtag ile bitir. Örnek hashtag'ler: #TıptaYapayZeka #TYZD #MedikalAI #SağlıktaTeknoloji #YapayZeka #DerinÖğrenme",
    "slides": [
      {"type": "cover", "headline": "Kısa dikkat çekici başlık (max 50 karakter)", "subheadline": "Alt başlık (max 80 karakter)"},
      {"type": "content", "title": "Slide 2 başlığı", "bullets": ["Bullet 1 (max 60 karakter)", "Bullet 2", "Bullet 3"]},
      {"type": "content", "title": "Slide 3 başlığı", "bullets": ["Bullet 1", "Bullet 2", "Bullet 3"]},
      {"type": "cta", "text": "tyzd.org"}
    ]
  }
}`;

async function generateContent(topic, researchContext = '') {
  console.log(`\n📝 İçerik oluşturuluyor: ${topic}`);
  console.log(`🤖 Model: ${LLM_MODEL} (${LLM_PROVIDER})\n`);

  const userPrompt = `KONU: ${topic}

${researchContext ? `ARAŞTIRMA BAĞLAMI (gerçek ve güncel veriler — bunları kaynak olarak kullan):
${researchContext}

` : ''}Bu konuda:
1. Kapsamlı, bilimsel ve Türkçe bir blog yazısı yaz (1000-1500 kelime)
2. Instagram carousel paylaşımı için caption ve slide içerikleri hazırla
3. Araştırma verilerini AKTİF OLARAK KULLAN ve referans göster
4. Türkiye'deki okuyucular (hekimler, mühendisler, araştırmacılar) için uygun olsun
5. Blog içeriğini HTML formatında yaz (h2, h3, p, ul, li, blockquote)`;

  let content;

  if (LLM_PROVIDER === 'anthropic') {
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: 6000,
        system: BLOG_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    }, 180000);

    const data = await response.json();
    if (data.error) throw new Error(`Anthropic API: ${data.error.message}`);
    content = data.content[0].text;

  } else if (LLM_PROVIDER === 'xai') {
    const response = await fetchWithTimeout('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${XAI_API_KEY}`
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        max_tokens: 6000,
        messages: [
          { role: 'system', content: BLOG_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })
    }, 180000);

    const data = await response.json();
    if (data.error) throw new Error(`xAI API: ${data.error?.message || JSON.stringify(data.error)}`);
    content = data.choices[0].message.content;

  } else {
    throw new Error('API key bulunamadı. ANTHROPIC_API_KEY veya XAI_API_KEY gerekli.');
  }

  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('Raw LLM output:', content.substring(0, 500));
    throw new Error('İçerik JSON olarak parse edilemedi');
  }

  const parsed = JSON.parse(jsonMatch[0]);

  // Quality validation
  const warnings = validateContentQuality(parsed);
  if (warnings.length > 0) {
    console.warn('\n⚠️  KALİTE UYARILARI:');
    for (const w of warnings) console.warn(`   ❗ ${w}`);
    console.warn('   İçerik yine de oluşturulacak, ancak manuel inceleme önerilir.\n');
  }

  return parsed;
}

function validateContentQuality(post) {
  const warnings = [];
  const content = post.content || '';
  const sources = post.sources || [];

  if (sources.length < 3) {
    warnings.push(`Yetersiz kaynak: ${sources.length}/3 minimum.`);
  }

  const hypeWords = ['çığır açan', 'devrim yaratan', 'devrim niteliğinde', 'mucize', 'şok eden', 'inanılmaz'];
  const foundHype = hypeWords.filter(hw => content.toLowerCase().includes(hw));
  if (foundHype.length > 0) {
    warnings.push(`Hype dil tespit edildi: "${foundHype.join('", "')}".`);
  }

  if (!post.instagram || !post.instagram.caption) {
    warnings.push('Instagram içeriği eksik.');
  }

  if (post.instagram?.slides?.length < 3) {
    warnings.push('Instagram slide sayısı yetersiz (minimum 3).');
  }

  return warnings;
}

// =============================================================================
// SLUG & HTML GENERATION
// =============================================================================

function generateSlug(title) {
  const turkishMap = {
    'ğ': 'g', 'ü': 'u', 'ş': 's', 'ı': 'i', 'ö': 'o', 'ç': 'c',
    'Ğ': 'g', 'Ü': 'u', 'Ş': 's', 'İ': 'i', 'Ö': 'o', 'Ç': 'c'
  };
  return title
    .toLowerCase()
    .replace(/[ğüşıöçĞÜŞİÖÇ]/g, c => turkishMap[c] || c)
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60);
}

function generateBlogHtml(post, topicInfo) {
  const category = CATEGORIES[post.category] || CATEGORIES['genel'];
  const date = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
  const slug = generateSlug(post.title);
  const postUrl = `https://tyzd.org/blog/${slug}.html`;

  const keyPointsHtml = `<ul>${post.keyPoints.map(p => `<li>${p}</li>`).join('\n            ')}</ul>`;
  const sourcesHtml = `<ul>${post.sources.map(s =>
    `<li><a href="${s.url}" target="_blank">${s.title}</a></li>`
  ).join('\n            ')}</ul>`;

  let html = BLOG_TEMPLATE
    .replace(/\{\{title\}\}/g, post.title)
    .replace(/\{\{description\}\}/g, post.description)
    .replace(/\{\{categoryName\}\}/g, category.name)
    .replace(/\{\{categoryIcon\}\}/g, category.icon)
    .replace(/\{\{categoryColor\}\}/g, category.color)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{readTime\}\}/g, post.readTime)
    .replace(/\{\{author\}\}/g, 'TYZD Editör')
    .replace(/\{\{content\}\}/g, post.content)
    .replace(/\{\{keyPoints\}\}/g, keyPointsHtml)
    .replace(/\{\{sources\}\}/g, sourcesHtml)
    .replace(/\{\{encodedTitle\}\}/g, encodeURIComponent(post.title))
    .replace(/\{\{url\}\}/g, encodeURIComponent(postUrl))
    .replace(/\{\{rootPath\}\}/g, '../');

  return html;
}

// =============================================================================
// INDEX & HISTORY MANAGEMENT
// =============================================================================

function updateBlogIndex(post, slug, topicInfo) {
  let posts = [];
  if (fs.existsSync(BLOG_INDEX)) {
    try { posts = JSON.parse(fs.readFileSync(BLOG_INDEX, 'utf-8')); } catch { posts = []; }
  }

  const category = CATEGORIES[post.category] || CATEGORIES['genel'];
  posts.unshift({
    slug,
    title: post.title,
    description: post.description,
    category: post.category,
    categoryName: category.name,
    categoryIcon: category.icon,
    categoryColor: category.color,
    date: new Date().toISOString().split('T')[0],
    readTime: post.readTime,
    priority: topicInfo.priority || 'normal',
    area: topicInfo.area || null,
    url: `blog/${slug}.html`,
    instagram: post.instagram ? {
      caption: post.instagram.caption,
      slides: post.instagram.slides
    } : null
  });

  posts = posts.slice(0, 100);
  fs.writeFileSync(BLOG_INDEX, JSON.stringify(posts, null, 2));
  console.log(`📋 Blog index güncellendi (${posts.length} yazı)`);
}

// =============================================================================
// DISPLAY
// =============================================================================

function displayFindings(findings, limit = 20) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 ARAŞTIRMA SONUÇLARI — Tıpta Yapay Zeka');
  console.log('='.repeat(70));

  const grouped = {};
  for (const f of findings.slice(0, limit)) {
    const area = f.areaName || 'Diğer';
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push(f);
  }

  for (const [area, items] of Object.entries(grouped)) {
    console.log(`\n🏷️  ${area}`);
    console.log('-'.repeat(50));
    for (const item of items) {
      const typeEmoji = item.type === 'paper' ? '📚' : item.type === 'trial' ? '🧪' : item.type === 'fda' ? '🏥' : item.type === 'news' ? '📰' : '🔍';
      const priorityEmoji = item.priority === 'urgent' ? '🔴' : item.priority === 'high' ? '🟡' : '⚪';
      const trustEmoji = item.trusted ? '✅' : '';
      console.log(`  ${typeEmoji} ${priorityEmoji} [${item.score}] ${item.title.substring(0, 70)}`);
      if (item.journal) console.log(`     📖 ${item.journal} (${item.year}) ${trustEmoji}`);
      if (item.url) console.log(`     🔗 ${item.url.substring(0, 70)}`);
    }
  }
  console.log('\n' + '='.repeat(70));
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const isDiscover = args.includes('--discover');
  const isDryRun = args.includes('--dry-run');
  const isDeploy = args.includes('--deploy');
  const isJson = args.includes('--json');

  const topicIdx = args.indexOf('--topic');
  const providedTopic = topicIdx !== -1 ? args[topicIdx + 1] : null;

  const areaIdx = args.indexOf('--area');
  const focusArea = areaIdx !== -1 ? args[areaIdx + 1] : null;

  const searchIdx = args.indexOf('--search-only');
  const searchQuery = searchIdx !== -1 ? args[searchIdx + 1] : null;

  if (!LLM_PROVIDER && !isDiscover && !searchQuery) {
    console.error('❌ LLM API key gerekli. Ayarlayın: ANTHROPIC_API_KEY veya XAI_API_KEY');
    process.exit(1);
  }

  console.log('🧠 TYZD Auto Content Generator v1.0');
  console.log(`📅 ${new Date().toLocaleDateString('tr-TR')} ${new Date().toLocaleTimeString('tr-TR')}`);
  console.log(`🏛️  Tıpta Yapay Zeka Derneği`);
  if (LLM_PROVIDER) console.log(`🤖 LLM: ${LLM_MODEL} (${LLM_PROVIDER})`);
  if (BRAVE_API_KEY) console.log('🔍 Brave Search: aktif');

  try {
    // === SEARCH-ONLY MODE ===
    if (searchQuery) {
      console.log(`\n🔎 Arama: "${searchQuery}"\n`);
      const [papers, trials, news, fda] = await Promise.all([
        searchPubMed(searchQuery, 5),
        searchClinicalTrials(searchQuery, 5),
        searchGoogleNews(searchQuery, 5),
        searchFDA(searchQuery, 3)
      ]);
      const all = [...papers, ...trials, ...news, ...fda].map(f => {
        f.area = 'search'; f.areaName = 'Arama Sonuçları'; f.score = scoreFinding(f); return f;
      });
      all.sort((a, b) => b.score - a.score);
      displayFindings(all, 15);
      return;
    }

    // === PHASE 1: DISCOVER ===
    const findings = await discoverTopics(focusArea);
    displayFindings(findings, 20);

    if (isDiscover) {
      if (isJson) {
        const top = findings.slice(0, 20).map((f, i) => ({
          rank: i + 1,
          score: f.score,
          priority: f.priority,
          type: f.type,
          area: f.area,
          areaName: f.areaName,
          title: f.title,
          journal: f.journal || null,
          year: f.year,
          abstract: (f.abstract || '').substring(0, 300),
          url: f.url || null,
          trusted: f.trusted || false,
          source: f.source
        }));
        console.log(JSON.stringify(top, null, 2));
      } else {
        console.log('\n✅ Keşif tamamlandı (--discover modu, içerik oluşturulmadı)');
      }
      return;
    }

    if (findings.length === 0) {
      console.log('\n⚠️  Hiç bulgu yok. Statik konu havuzuna geçiliyor...');
    }

    // === PHASE 2: SELECT TOPIC ===
    let topicInfo;
    if (providedTopic) {
      topicInfo = { topic: providedTopic, category: 'genel', priority: 'normal', area: 'custom' };
    } else if (findings.length > 0) {
      topicInfo = selectTopicFromFindings(findings);
    } else {
      topicInfo = selectFromPool();
    }

    if (!topicInfo) {
      console.error('❌ Konu seçilemedi.');
      process.exit(1);
    }

    console.log(`\n🎯 Seçilen konu: ${topicInfo.topic}`);
    console.log(`📊 Öncelik: ${topicInfo.priority || 'normal'} | Alan: ${topicInfo.areaName || topicInfo.area || 'genel'}`);

    // === PHASE 3: DEEP RESEARCH ===
    const research = await conductDeepResearch(topicInfo.topic, topicInfo.area);
    const researchContext = buildResearchContext(research);
    console.log(`\n📄 Araştırma bağlamı: ${(researchContext.length / 1024).toFixed(1)} KB`);

    // === PHASE 4: GENERATE BLOG + INSTAGRAM ===
    const post = await generateContent(topicInfo.topic, researchContext);
    console.log(`✅ İçerik oluşturuldu: ${post.title}`);

    if (post.instagram) {
      console.log(`📸 Instagram carousel: ${post.instagram.slides?.length || 0} slide`);
      console.log(`📝 Instagram caption: ${post.instagram.caption?.length || 0} karakter`);
    }

    // === PHASE 5: PUBLISH ===
    const slug = generateSlug(post.title);

    if (!isDryRun) {
      const html = generateBlogHtml(post, topicInfo);
      if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      const filepath = path.join(OUTPUT_DIR, `${slug}.html`);
      fs.writeFileSync(filepath, html);
      console.log(`📄 Blog HTML kaydedildi: ${filepath}`);

      updateBlogIndex(post, slug, topicInfo);
      addToHistory(topicInfo.topic, slug);

      // Save Instagram data to posts.json in instagram-templates
      if (post.instagram) {
        const igPostsFile = path.join(INSTAGRAM_DIR, 'posts.json');
        let igPosts = [];
        try {
          if (fs.existsSync(igPostsFile)) {
            igPosts = JSON.parse(fs.readFileSync(igPostsFile, 'utf-8'));
          }
        } catch { igPosts = []; }

        const igEntry = {
          id: igPosts.length + 1,
          date: new Date().toISOString().split('T')[0],
          blogSlug: slug,
          caption: post.instagram.caption,
          slides: post.instagram.slides.map((slide, i) => {
            if (slide.type === 'cover') {
              return {
                id: `${igPosts.length + 1}-cover`,
                template: 'cover-slide.html',
                data: {
                  HEADLINE: slide.headline || post.title,
                  SUBHEADLINE: slide.subheadline || post.description,
                  CATEGORY: (CATEGORIES[post.category] || CATEGORIES['genel']).name
                }
              };
            } else if (slide.type === 'content') {
              const bullets = slide.bullets || [];
              const data = {
                PAGE_NUM: `${i + 1}/${post.instagram.slides.length}`,
                TITLE: slide.title || ''
              };
              bullets.forEach((b, j) => { data[`BULLET_${j + 1}`] = b; });
              return {
                id: `${igPosts.length + 1}-content-${i}`,
                template: 'content-slide.html',
                data
              };
            } else if (slide.type === 'cta') {
              return {
                id: `${igPosts.length + 1}-cta`,
                template: 'cta-slide.html',
                data: {
                  CTA_URL: slide.text || 'tyzd.org'
                }
              };
            }
            return null;
          }).filter(Boolean)
        };

        igPosts.unshift(igEntry);
        fs.writeFileSync(igPostsFile, JSON.stringify(igPosts, null, 2));
        console.log(`📸 Instagram veri kaydedildi: ${igPostsFile}`);
      }

      if (isDeploy) {
        console.log('\n🚀 Deploy ediliyor...');
        try {
          execSync(`cd ${path.join(__dirname, '..')} && git add -A && git commit -m "🤖 Blog: ${post.title.substring(0, 50)}" && git push origin main`, { stdio: 'inherit' });
          console.log('✅ GitHub Pages deploy başarılı');
        } catch (err) {
          console.error('❌ Deploy hatası:', err.message);
        }
      }

      console.log(`\n🎉 İçerik pipeline tamamlandı!`);
      console.log(`   📝 Başlık: ${post.title}`);
      console.log(`   📄 Blog: blog/${slug}.html`);
      console.log(`   📸 Instagram: ${post.instagram ? 'Hazır' : 'Yok'}`);
      console.log(`   📊 Kategori: ${post.category}`);
      console.log(`   ⏱️  Okuma: ${post.readTime} dk`);
      console.log(`   📚 Kaynaklar: ${post.sources.length}`);
    } else {
      console.log(`\n🎉 [DRY RUN] İçerik hazır ama yazılmadı`);
      console.log(`   Başlık: ${post.title}`);
      console.log(`   Slug: ${slug}`);
      console.log(`   Kaynaklar: ${post.sources.length}`);
      console.log(`   Instagram: ${post.instagram ? `${post.instagram.slides?.length} slide` : 'Yok'}`);
    }

  } catch (error) {
    console.error('\n❌ Hata:', error.message);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

main();
