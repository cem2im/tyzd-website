#!/usr/bin/env node
/**
 * TYZD Instagram Reels — Slide Renderer
 * Renders 5 slide HTML templates to 1080x1920 PNG via Puppeteer.
 *
 * Usage:
 *   node render.js                     → render with placeholder text
 *   node render.js --post posts.json   → fill placeholders from posts.json
 *   node render.js --post posts.json --index 0  → specific post index
 */

let puppeteer;
try {
  puppeteer = require('/home/clawdbot/.openclaw/workspace-uzunyasa/website/scripts/node_modules/puppeteer');
} catch {
  puppeteer = require('/home/clawdbot/.openclaw/workspace-uzunyasa/website/social-cards/node_modules/puppeteer');
}
const fs = require('fs');
const path = require('path');

const SLIDES = [
  'slide-1-hook.html',
  'slide-2-content.html',
  'slide-3-stats.html',
  'slide-4-content2.html',
  'slide-5-cta.html'
];

const DIR = __dirname;
const OUT = path.join(DIR, 'output');

// Parse CLI args
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--post' && args[i + 1]) opts.postFile = args[++i];
    if (args[i] === '--index' && args[i + 1]) opts.index = parseInt(args[++i], 10);
  }
  return opts;
}

// Build replacement map from a post object
function buildReplacements(post) {
  return {
    '{{ICON}}': post.icon || '🧠',
    '{{CATEGORY}}': post.category || 'Tıpta AI',
    '{{TITLE_BEFORE}}': post.title || 'Yapay Zeka',
    '{{ACCENT}}': post.accent || 'Sağlıkta',
    '{{TITLE_AFTER}}': post.title_after || '',
    '{{SUBTITLE}}': post.subtitle || 'Tıpta yapay zeka gelişmeleri',
    '{{PAGE}}': '2',
    '{{SECTION_TITLE}}': post.section_title || 'Temel Özellikler',
    '{{BULLET_1}}': (post.bullets && post.bullets[0]) || 'Birinci madde',
    '{{BULLET_2}}': (post.bullets && post.bullets[1]) || 'İkinci madde',
    '{{BULLET_3}}': (post.bullets && post.bullets[2]) || 'Üçüncü madde',
    '{{STAT_NUMBER}}': post.stat_number || '%95',
    '{{STAT_TEXT}}': post.stat_text || 'Doğruluk oranı',
    '{{SOURCE}}': post.source || 'Bilimsel Çalışma',
    '{{DETAIL}}': post.detail || 'Detaylı bilgi için <strong>tyzd.org</strong> adresini ziyaret edin.',
    '{{SECTION_TITLE_2}}': post.section_title_2 || 'Gelecek Perspektifi',
    '{{BULLET_4}}': (post.bullets2 && post.bullets2[0]) || 'Dördüncü madde',
    '{{BULLET_5}}': (post.bullets2 && post.bullets2[1]) || 'Beşinci madde',
    '{{BULLET_6}}': (post.bullets2 && post.bullets2[2]) || 'Altıncı madde',
  };
}

// Apply replacements to HTML string
function applyReplacements(html, replacements) {
  let result = html;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.split(key).join(value);
  }
  return result;
}

(async () => {
  const opts = parseArgs();
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // Load post data if provided
  let replacements = null;
  if (opts.postFile) {
    const postPath = path.resolve(opts.postFile);
    const posts = JSON.parse(fs.readFileSync(postPath, 'utf8'));
    const idx = opts.index || 0;
    if (!posts[idx]) {
      console.error(`❌ Post index ${idx} not found in ${postPath}`);
      process.exit(1);
    }
    replacements = buildReplacements(posts[idx]);
    console.log(`📋 Using post: "${posts[idx].title || 'Untitled'}" (index ${idx})`);
  }

  // Try cached Chrome first, fall back to system chromium
  const launchOpts = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  };
  const cachedChrome = '/home/clawdbot/.cache/puppeteer/chrome/linux-145.0.7632.77/chrome-linux64/chrome';
  const systemChromium = '/usr/bin/chromium-browser';
  const fs2 = require('fs');
  if (fs2.existsSync(cachedChrome)) {
    launchOpts.executablePath = cachedChrome;
  } else if (fs2.existsSync(systemChromium)) {
    launchOpts.executablePath = systemChromium;
  }
  const browser = await puppeteer.launch(launchOpts);

  for (let i = 0; i < SLIDES.length; i++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

    if (replacements) {
      // Read HTML, apply replacements, then load from string
      let html = fs.readFileSync(path.join(DIR, SLIDES[i]), 'utf8');
      html = applyReplacements(html, replacements);
      await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
    } else {
      await page.goto('file://' + path.join(DIR, SLIDES[i]), { waitUntil: 'networkidle2', timeout: 30000 });
    }

    await page.evaluate(() => document.fonts.ready);
    await new Promise(r => setTimeout(r, 1500));

    const outFile = path.join(OUT, `slide-${i + 1}.png`);
    await page.screenshot({ path: outFile, type: 'png' });
    await page.close();
    console.log(`✅ ${SLIDES[i]} → ${outFile}`);
  }

  await browser.close();
  console.log(`\n🎬 Done! ${SLIDES.length} slides rendered to ${OUT}`);
})();
