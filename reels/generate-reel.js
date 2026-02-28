#!/usr/bin/env node
/**
 * TYZD Reel Generator — Blog → Reel pipeline
 * Reads blog-posts.json, extracts content, fills slide templates, renders + assembles.
 *
 * Usage:
 *   node generate-reel.js --latest                → latest blog post
 *   node generate-reel.js --slug "blog-slug"      → specific post by slug
 *   node generate-reel.js --index 2               → specific post by index
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DIR = __dirname;
const REPO = path.join(DIR, '..');
const BLOG_POSTS_PATH = path.join(REPO, 'blog-posts.json');

// Parse CLI arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--latest') opts.latest = true;
    if (args[i] === '--slug' && args[i + 1]) opts.slug = args[++i];
    if (args[i] === '--index' && args[i + 1]) opts.index = parseInt(args[++i], 10);
  }
  return opts;
}

// Load blog posts
function loadBlogPosts() {
  if (!fs.existsSync(BLOG_POSTS_PATH)) {
    console.error(`❌ blog-posts.json not found at ${BLOG_POSTS_PATH}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(BLOG_POSTS_PATH, 'utf8'));
}

// Find the target post
function findPost(posts, opts) {
  if (opts.slug) {
    const post = posts.find(p => p.slug === opts.slug);
    if (!post) {
      console.error(`❌ Post with slug "${opts.slug}" not found`);
      process.exit(1);
    }
    return post;
  }
  if (opts.index !== undefined) {
    if (!posts[opts.index]) {
      console.error(`❌ Post index ${opts.index} out of range (${posts.length} posts)`);
      process.exit(1);
    }
    return posts[opts.index];
  }
  // Default: latest (first item, sorted by date desc)
  const sorted = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
  return sorted[0];
}

// Parse blog HTML file for additional content if needed
function parseBlogHtml(blogPost) {
  const blogPath = path.join(REPO, blogPost.url);
  if (!fs.existsSync(blogPath)) {
    console.warn(`⚠️  Blog HTML not found: ${blogPath}, using metadata only`);
    return null;
  }

  const html = fs.readFileSync(blogPath, 'utf8');

  // Extract key stats (look for percentage or number patterns)
  const statMatches = html.match(/%\d+|\d+%|\d{2,}\+?/g) || [];
  // Extract strong/bold text for key points
  const strongMatches = [...html.matchAll(/<strong[^>]*>([^<]+)<\/strong>/g)].map(m => m[1]);

  return { stats: statMatches, keyPoints: strongMatches };
}

// Convert a blog post to reel post data
function blogToReelPost(blogPost) {
  const ig = blogPost.instagram;

  // Base from instagram metadata if available
  if (ig && ig.slides && ig.slides.length >= 3) {
    const cover = ig.slides.find(s => s.type === 'cover') || {};
    const contents = ig.slides.filter(s => s.type === 'content');
    const content1 = contents[0] || {};
    const content2 = contents[1] || {};

    return {
      id: 1,
      icon: blogPost.categoryIcon || '🧠',
      title: cover.headline || blogPost.title,
      accent: extractAccent(cover.headline || blogPost.title),
      title_after: '',
      subtitle: cover.subheadline || blogPost.description,
      category: blogPost.categoryName || blogPost.category || 'Tıpta AI',
      section_title: content1.title || 'Temel Özellikler',
      bullets: content1.bullets || [
        'Birinci önemli nokta',
        'İkinci önemli nokta',
        'Üçüncü önemli nokta'
      ],
      stat_number: extractStatNumber(blogPost),
      stat_text: extractStatText(blogPost),
      source: 'Bilimsel Çalışma',
      detail: blogPost.description,
      section_title_2: content2.title || 'Türkiye Perspektifi',
      bullets2: content2.bullets || [
        'Dördüncü önemli nokta',
        'Beşinci önemli nokta',
        'Altıncı önemli nokta'
      ]
    };
  }

  // Fallback: construct from blog metadata
  const parsed = parseBlogHtml(blogPost);
  return {
    id: 1,
    icon: blogPost.categoryIcon || '🧠',
    title: blogPost.title,
    accent: extractAccent(blogPost.title),
    title_after: '',
    subtitle: blogPost.description,
    category: blogPost.categoryName || blogPost.category || 'Tıpta AI',
    section_title: 'Temel Bulgular',
    bullets: parsed && parsed.keyPoints.length >= 3
      ? parsed.keyPoints.slice(0, 3)
      : ['AI destekli analiz', 'Yüksek doğruluk oranı', 'Hızlı sonuç'],
    stat_number: extractStatNumber(blogPost),
    stat_text: extractStatText(blogPost),
    source: 'Bilimsel Çalışma',
    detail: blogPost.description,
    section_title_2: 'Türkiye\'de Uygulama',
    bullets2: parsed && parsed.keyPoints.length >= 6
      ? parsed.keyPoints.slice(3, 6)
      : ['Klinik entegrasyon fırsatları', 'Eğitim ve araştırma potansiyeli', 'Regülasyon süreçleri devam ediyor']
  };
}

// Extract a potential accent phrase from title
function extractAccent(title) {
  if (!title) return 'Yapay Zeka';
  // Try to find key terms
  const patterns = [
    /(\d+[^,\s]*\s+\w+)/,        // "14 Akut Bulgu"
    /(AI\s+\w+)/i,                // "AI Sistemleri"
    /(FDA\s+\w+)/i,               // "FDA Onaylı"
    /:\s*(.{5,30})$/,             // text after colon
  ];
  for (const p of patterns) {
    const m = title.match(p);
    if (m) return m[1];
  }
  // Last resort: last 2-3 words
  const words = title.split(' ');
  return words.slice(-3).join(' ');
}

// Extract a stat number from blog metadata
function extractStatNumber(blogPost) {
  const desc = blogPost.description || '';
  const match = desc.match(/%\d+|\d+%/) || desc.match(/\d{2,}\+?/);
  return match ? match[0] : '1000+';
}

// Extract stat text
function extractStatText(blogPost) {
  if (blogPost.description && blogPost.description.includes('doğruluk')) return 'Doğruluk oranı';
  if (blogPost.description && blogPost.description.includes('sensitivite')) return 'Sensitivite oranı';
  if (blogPost.description && blogPost.description.includes('FDA')) return 'FDA onaylı AI cihaz';
  return 'Performans metriği';
}

// Main
(async () => {
  const opts = parseArgs();
  console.log('🎬 TYZD Reel Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━');

  // 1. Find the blog post
  const posts = loadBlogPosts();
  const blogPost = findPost(posts, opts);
  console.log(`📝 Blog: "${blogPost.title}"`);
  console.log(`   Category: ${blogPost.categoryName || blogPost.category}`);
  console.log(`   Date: ${blogPost.date}`);

  // 2. Convert to reel post format
  const reelPost = blogToReelPost(blogPost);
  console.log(`\n📋 Reel data prepared:`);
  console.log(`   Title: ${reelPost.title}`);
  console.log(`   Accent: ${reelPost.accent}`);
  console.log(`   Stat: ${reelPost.stat_number} — ${reelPost.stat_text}`);

  // 3. Write temporary posts.json
  const tmpPostsPath = path.join(DIR, 'output', '_current-post.json');
  if (!fs.existsSync(path.join(DIR, 'output'))) {
    fs.mkdirSync(path.join(DIR, 'output'), { recursive: true });
  }
  fs.writeFileSync(tmpPostsPath, JSON.stringify([reelPost], null, 2));
  console.log(`   Saved to: ${tmpPostsPath}`);

  // 4. Render slides
  console.log('\n🖼️  Rendering slides...');
  try {
    execSync(`node "${path.join(DIR, 'render.js')}" --post "${tmpPostsPath}"`, {
      stdio: 'inherit',
      cwd: DIR
    });
  } catch (err) {
    console.error('❌ Render failed:', err.message);
    process.exit(1);
  }

  // 5. Assemble video
  console.log('\n🎬 Assembling video...');
  try {
    execSync(`bash "${path.join(DIR, 'assemble.sh')}"`, {
      stdio: 'inherit',
      cwd: DIR
    });
  } catch (err) {
    console.error('❌ Assembly failed:', err.message);
    process.exit(1);
  }

  console.log('\n✨ Reel generation complete!');
  console.log(`   Video: ${path.join(DIR, 'output', 'tyzd-reel.mp4')}`);
})();
