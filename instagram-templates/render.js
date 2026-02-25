#!/usr/bin/env node
/**
 * TYZD Instagram Template Renderer
 * Renders HTML templates to PNG using Playwright
 * 
 * Usage:
 *   node render.js                    # Render all posts from posts.json
 *   node render.js --post 1           # Render specific post by id
 *   node render.js --latest           # Render only the latest post
 *   node render.js --template cover   # Render a specific template with test data
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TEMPLATE_DIR = __dirname;
const POSTS_FILE = path.join(TEMPLATE_DIR, 'posts.json');
const OUTPUT_DIR = path.join(TEMPLATE_DIR, 'output');

const VIEWPORT = { width: 1080, height: 1350 };

// Test data for standalone template rendering
const TEST_DATA = {
  'cover-slide.html': {
    HEADLINE: 'Kolonoskopide AI ile Polip Tespiti',
    SUBHEADLINE: 'Yapay zeka destekli endoskopi sistemleri polip tespit oranlarını %30 artırıyor',
    CATEGORY: 'Endoskopi'
  },
  'content-slide.html': {
    PAGE_NUM: '2/4',
    TITLE: 'Öne Çıkan Bulgular',
    BULLET_1: 'CADe sistemleri adenom tespit oranını %14 artırdı (RCT, n=3.028)',
    BULLET_2: 'FDA onaylı 15+ endoskopi AI cihazı mevcut (2025 itibarıyla)',
    BULLET_3: 'Gerçek zamanlı AI analizi ortalama 40ms gecikme ile çalışıyor'
  },
  'cta-slide.html': {
    CTA_URL: 'tyzd.org'
  }
};

/**
 * Replace all {{PLACEHOLDER}} in HTML with actual data
 */
function applyTemplate(html, data) {
  let result = html;
  for (const [key, value] of Object.entries(data)) {
    const safeValue = String(value).replace(/\n/g, '<br>');
    result = result.replaceAll(`{{${key}}}`, safeValue);
  }
  // Remove any remaining placeholders
  result = result.replace(/\{\{[A-Z_0-9]+\}\}/g, '');
  return result;
}

/**
 * Render a single slide to PNG
 */
async function renderSlide(browser, templateFile, data, outputPath) {
  const templatePath = path.join(TEMPLATE_DIR, templateFile);
  if (!fs.existsSync(templatePath)) {
    console.warn(`⚠️  Template not found: ${templateFile}`);
    return null;
  }

  let html = fs.readFileSync(templatePath, 'utf-8');
  html = applyTemplate(html, data);

  // Write temp file
  const tmpFile = path.join(OUTPUT_DIR, `_tmp_${path.basename(outputPath)}.html`);
  fs.writeFileSync(tmpFile, html);

  const page = await browser.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.goto('file://' + tmpFile, { waitUntil: 'networkidle' });
  
  // Wait a bit for fonts to load
  await page.waitForTimeout(1000);

  await page.screenshot({ path: outputPath, type: 'png' });
  await page.close();

  // Clean up temp file
  fs.unlinkSync(tmpFile);
  
  console.log(`  ✅ Rendered: ${path.basename(outputPath)}`);
  return outputPath;
}

/**
 * Render all slides for a post
 */
async function renderPost(browser, post) {
  console.log(`\n📸 Post #${post.id} render ediliyor...`);
  
  const postDir = path.join(OUTPUT_DIR, `post-${String(post.id).padStart(3, '0')}`);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });

  const rendered = [];
  for (let i = 0; i < post.slides.length; i++) {
    const slide = post.slides[i];
    const outputPath = path.join(postDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
    const result = await renderSlide(browser, slide.template, slide.data, outputPath);
    if (result) rendered.push(result);
  }

  // Save caption as txt
  if (post.caption) {
    const captionPath = path.join(postDir, 'caption.txt');
    fs.writeFileSync(captionPath, post.caption);
    console.log(`  📝 Caption saved: caption.txt`);
  }

  console.log(`  🎉 ${rendered.length} slide rendered to ${postDir}`);
  return rendered;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Parse args
  const templateIdx = args.indexOf('--template');
  const postIdx = args.indexOf('--post');
  const isLatest = args.includes('--latest');

  console.log('📸 TYZD Instagram Renderer');
  console.log(`   Viewport: ${VIEWPORT.width}x${VIEWPORT.height}`);
  
  const browser = await chromium.launch();

  try {
    // === Single template test mode ===
    if (templateIdx !== -1 && args[templateIdx + 1]) {
      const templateName = args[templateIdx + 1];
      const templateFile = templateName.endsWith('.html') ? templateName : `${templateName}-slide.html`;
      const data = TEST_DATA[templateFile] || {};
      
      console.log(`\n🎨 Test render: ${templateFile}`);
      const outputPath = path.join(OUTPUT_DIR, `test-${templateName}.png`);
      await renderSlide(browser, templateFile, data, outputPath);
      console.log(`\n✅ Test render tamamlandı: ${outputPath}`);
      return;
    }

    // === Load posts ===
    if (!fs.existsSync(POSTS_FILE)) {
      console.log('⚠️  posts.json bulunamadı. --template ile test render yapabilirsiniz.');
      return;
    }

    const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
    if (posts.length === 0) {
      console.log('⚠️  posts.json boş. Önce auto-content-generator.js ile içerik oluşturun.');
      return;
    }

    // === Specific post mode ===
    if (postIdx !== -1 && args[postIdx + 1]) {
      const postId = parseInt(args[postIdx + 1]);
      const post = posts.find(p => p.id === postId);
      if (!post) {
        console.error(`❌ Post #${postId} bulunamadı.`);
        process.exit(1);
      }
      await renderPost(browser, post);
      return;
    }

    // === Latest post mode ===
    if (isLatest) {
      await renderPost(browser, posts[0]);
      return;
    }

    // === All posts mode ===
    console.log(`\n📋 ${posts.length} post render edilecek...\n`);
    for (const post of posts) {
      await renderPost(browser, post);
    }

    console.log(`\n🎉 Tüm postlar render edildi! Output: ${OUTPUT_DIR}`);

  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error('❌ Render hatası:', e.message);
  process.exit(1);
});
