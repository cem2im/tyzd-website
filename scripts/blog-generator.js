/**
 * TYZD Blog Content Generator
 * Tıpta Yapay Zeka Derneği - Blog Yazısı Oluşturucu
 * 
 * UzunYaşa blog-generator.js'den uyarlanmıştır.
 * 
 * Kullanım:
 * ANTHROPIC_API_KEY=xxx node blog-generator.js --topic "Endoskopide yapay zeka"
 */

const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  outputDir: path.join(__dirname, '../blog'),
  postsJson: path.join(__dirname, '../blog-posts.json'),
  siteUrl: 'https://tyzd.org',
  categories: {
    'endoskopi':    { icon: '🔬', color: '#14b8a6' },
    'radyoloji':    { icon: '📡', color: '#06b6d4' },
    'etik':         { icon: '⚖️', color: '#0ea5e9' },
    'llm':          { icon: '🤖', color: '#14b8a6' },
    'egitim':       { icon: '🎓', color: '#06b6d4' },
    'politika':     { icon: '🏛️', color: '#0ea5e9' },
    'patoloji':     { icon: '🧬', color: '#14b8a6' },
    'arastirma':    { icon: '📊', color: '#06b6d4' },
    'genel':        { icon: '🧠', color: '#0ea5e9' }
  }
};

// Blog Post Template — TYZD Dark Theme
const BLOG_TEMPLATE = `<!DOCTYPE html>
<html lang="tr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{{title}} | TYZD Blog</title>
    <meta name="description" content="{{description}}">
    <meta property="og:title" content="{{title}} | TYZD">
    <meta property="og:description" content="{{description}}">
    <meta property="og:type" content="article">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #000000;
            --bg-card: #0a0a0a;
            --bg-elevated: #111111;
            --border: rgba(255,255,255,0.08);
            --border-hover: rgba(255,255,255,0.15);
            --text: #ffffff;
            --text-secondary: #a1a1aa;
            --text-tertiary: #71717a;
            --accent: #14b8a6;
            --accent-secondary: #06b6d4;
            --gradient: linear-gradient(135deg, #14b8a6 0%, #06b6d4 50%, #0ea5e9 100%);
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html { scroll-behavior: smooth; }
        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.8;
            -webkit-font-smoothing: antialiased;
        }
        ::selection { background: var(--accent); color: white; }
        a { color: var(--accent); text-decoration: none; }
        a:hover { color: var(--accent-secondary); }

        /* Header */
        .header {
            position: fixed;
            top: 0; left: 0; right: 0;
            z-index: 100;
            background: rgba(0,0,0,0.8);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-bottom: 1px solid var(--border);
            padding: 0 2rem;
        }
        .header-inner {
            max-width: 1200px;
            margin: 0 auto;
            height: 64px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .logo {
            display: flex;
            align-items: center;
            gap: 10px;
            font-weight: 600;
            font-size: 15px;
            color: var(--text);
        }
        .logo-mark {
            width: 32px;
            height: 32px;
            background: var(--gradient);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .logo-mark svg { width: 18px; height: 18px; color: white; }
        .back-link {
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
            transition: color 0.2s;
        }
        .back-link:hover { color: var(--text); }

        /* Article */
        article {
            max-width: 800px;
            margin: 0 auto;
            padding: 7rem 2rem 4rem;
        }
        .post-header { margin-bottom: 2rem; }
        .post-category {
            display: inline-block;
            background: rgba(20,184,166,0.1);
            border: 1px solid rgba(20,184,166,0.2);
            color: var(--accent);
            padding: 0.3rem 0.8rem;
            border-radius: 100px;
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 1rem;
        }
        h1 {
            font-size: clamp(1.8rem, 4vw, 2.5rem);
            font-weight: 600;
            line-height: 1.2;
            letter-spacing: -0.02em;
            margin-bottom: 1rem;
        }
        .post-meta {
            color: var(--text-tertiary);
            font-size: 0.85rem;
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
        }
        .post-image {
            width: 100%;
            height: 360px;
            background: linear-gradient(135deg, rgba(20,184,166,0.15), rgba(6,182,212,0.1));
            border: 1px solid var(--border);
            border-radius: 16px;
            margin: 2rem 0;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 4rem;
        }

        /* Content */
        .post-content { font-size: 1.05rem; line-height: 1.85; }
        .post-content h2 {
            font-size: 1.4rem;
            font-weight: 600;
            margin: 2.5rem 0 1rem;
            letter-spacing: -0.01em;
            background: var(--gradient);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .post-content h3 {
            font-size: 1.15rem;
            font-weight: 600;
            margin: 1.5rem 0 0.75rem;
        }
        .post-content p {
            margin-bottom: 1.25rem;
            color: var(--text-secondary);
        }
        .post-content strong { color: var(--text); }
        .post-content ul, .post-content ol {
            margin: 1rem 0 1.5rem 1.5rem;
            color: var(--text-secondary);
        }
        .post-content li { margin-bottom: 0.5rem; }
        .post-content blockquote {
            border-left: 3px solid var(--accent);
            padding: 1rem 1.5rem;
            margin: 1.5rem 0;
            background: rgba(20,184,166,0.05);
            border-radius: 0 8px 8px 0;
            color: var(--text-secondary);
            font-style: italic;
        }

        /* Key Points Box */
        .key-points {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 1.5rem 2rem;
            margin: 2rem 0;
        }
        .key-points h4 {
            color: var(--accent);
            margin-bottom: 1rem;
            font-size: 1rem;
        }
        .key-points ul { margin: 0; padding-left: 1.2rem; }
        .key-points li { color: var(--text-secondary); margin-bottom: 0.4rem; }

        /* Sources */
        .sources {
            margin-top: 3rem;
            padding-top: 2rem;
            border-top: 1px solid var(--border);
        }
        .sources h4 { font-size: 0.95rem; margin-bottom: 0.75rem; color: var(--text-secondary); }
        .sources ul { list-style: none; margin: 0; padding: 0; }
        .sources li { font-size: 0.85rem; color: var(--text-tertiary); margin-bottom: 0.4rem; }

        /* Share */
        .share-section {
            margin-top: 3rem;
            padding: 2rem;
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: 16px;
            text-align: center;
        }
        .share-section p { color: var(--text-secondary); margin-bottom: 1rem; }
        .share-buttons { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
        .share-btn {
            padding: 0.6rem 1.2rem;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            font-size: 0.85rem;
            transition: transform 0.2s, opacity 0.2s;
        }
        .share-btn:hover { transform: translateY(-2px); opacity: 0.9; color: white; }
        .share-btn.twitter { background: #1DA1F2; }
        .share-btn.linkedin { background: #0A66C2; }
        .share-btn.whatsapp { background: #25D366; }

        /* Footer */
        footer {
            padding: 2rem;
            border-top: 1px solid var(--border);
            text-align: center;
            margin-top: 4rem;
        }
        footer p { font-size: 0.85rem; color: var(--text-tertiary); }
        footer a { color: var(--accent); }

        @media (max-width: 640px) {
            h1 { font-size: 1.5rem; }
            article { padding: 5rem 1rem 2rem; }
            .post-image { height: 200px; font-size: 3rem; }
        }
    </style>
</head>
<body>
    <header class="header">
        <div class="header-inner">
            <a href="{{rootPath}}index.html" class="logo">
                <div class="logo-mark">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                    </svg>
                </div>
                <span>TYZD</span>
            </a>
            <a href="{{rootPath}}index.html#blog" class="back-link">← Blog'a Dön</a>
        </div>
    </header>

    <article>
        <div class="post-header">
            <span class="post-category">{{categoryIcon}} {{categoryName}}</span>
            <h1>{{title}}</h1>
            <div class="post-meta">
                <span>📅 {{date}}</span>
                <span>⏱️ {{readTime}} dk okuma</span>
                <span>✍️ {{author}}</span>
            </div>
        </div>

        <div class="post-image">{{categoryIcon}}</div>

        <div class="post-content">
            {{content}}
        </div>

        <div class="key-points">
            <h4>📌 Önemli Noktalar</h4>
            {{keyPoints}}
        </div>

        <div class="sources">
            <h4>📚 Kaynaklar</h4>
            {{sources}}
        </div>

        <div class="share-section">
            <p><strong>Bu yazıyı paylaşın</strong></p>
            <div class="share-buttons">
                <a href="https://twitter.com/intent/tweet?text={{encodedTitle}}&url={{url}}" class="share-btn twitter" target="_blank">Twitter</a>
                <a href="https://www.linkedin.com/shareArticle?mini=true&url={{url}}&title={{encodedTitle}}" class="share-btn linkedin" target="_blank">LinkedIn</a>
                <a href="https://wa.me/?text={{encodedTitle}}%20{{url}}" class="share-btn whatsapp" target="_blank">WhatsApp</a>
            </div>
        </div>
    </article>

    <footer>
        <p>© 2026 <a href="{{rootPath}}index.html">Tıpta Yapay Zeka Derneği</a> · Tüm hakları saklıdır.</p>
    </footer>
</body>
</html>`;

// TYZD-specific system prompt
const SYSTEM_PROMPT = `Sen TYZD (Tıpta Yapay Zeka Derneği) için blog yazarısın. Tıpta yapay zeka konusunda Türkçe, bilimsel, anlaşılır ve SEO-uyumlu blog yazıları yazıyorsun.

KURALLAR:
1. Her zaman Türkçe yaz
2. Bilimsel kaynaklara (PubMed, Nature, Lancet, NEJM vb.) dayalı ol
3. Anlaşılır ve akıcı bir dil kullan — hem hekimler hem mühendisler okuyacak
4. Alt başlıklar (h2, h3) kullan
5. Bullet point'ler ve listeler kullan
6. 1000-2000 kelime arası yaz
7. Klinik uygulamalar ve Türkiye perspektifini vurgula
8. Tıbbi tavsiye verme, bilgi amaçlı olduğunu belirt
9. Yapay zeka terimlerini açıkla (CNN, transformer, LLM vb.)

ÇIKTI FORMATI (JSON):
{
  "title": "Başlık (70 karakter max)",
  "description": "Meta açıklama (155 karakter max)",
  "category": "endoskopi|radyoloji|etik|llm|egitim|politika|patoloji|arastirma|genel",
  "content": "HTML formatında içerik (h2, h3, p, ul, li, blockquote kullan)",
  "keyPoints": ["Önemli nokta 1", "Önemli nokta 2", "..."],
  "sources": [{"title": "Kaynak adı", "url": "https://..."}],
  "readTime": 8
}`;

// Category name mapping
const CATEGORY_NAMES = {
  'endoskopi': 'Endoskopi',
  'radyoloji': 'Radyoloji',
  'etik': 'Etik',
  'llm': 'Büyük Dil Modelleri',
  'egitim': 'Eğitim',
  'politika': 'Politika',
  'patoloji': 'Patoloji',
  'arastirma': 'Araştırma',
  'genel': 'Genel'
};

// Generate blog post via Anthropic API
async function generateBlogPost(topic, sourceInfo = '') {
  const userPrompt = `Konu: ${topic}

${sourceInfo ? `Kaynak bilgiler:\n${sourceInfo}\n\n` : ''}

Bu konuda kapsamlı bir blog yazısı yaz. Güncel bilimsel araştırmalara değin. Tıp ve yapay zeka kesişim noktasına odaklan. Türkiye'deki okuyucular (hekimler, mühendisler, araştırmacılar) için uygun olsun.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CONFIG.anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  const data = await response.json();
  const content = data.content[0].text;
  
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse blog content');
  
  return JSON.parse(jsonMatch[0]);
}

// Create slug from Turkish title
function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 60);
}

// Save blog post as HTML
function saveBlogPost(post, customDate = null) {
  const slug = createSlug(post.title);
  const category = CONFIG.categories[post.category] || CONFIG.categories['genel'];
  const categoryName = CATEGORY_NAMES[post.category] || 'Genel';
  
  const date = customDate || new Date().toLocaleDateString('tr-TR', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  const postUrl = `${CONFIG.siteUrl}/blog/${slug}.html`;

  let html = BLOG_TEMPLATE
    .replace(/\{\{title\}\}/g, post.title)
    .replace(/\{\{description\}\}/g, post.description)
    .replace(/\{\{categoryName\}\}/g, categoryName)
    .replace(/\{\{categoryIcon\}\}/g, category.icon)
    .replace(/\{\{categoryColor\}\}/g, category.color)
    .replace(/\{\{date\}\}/g, date)
    .replace(/\{\{readTime\}\}/g, post.readTime)
    .replace(/\{\{author\}\}/g, 'TYZD Editör')
    .replace(/\{\{content\}\}/g, post.content)
    .replace(/\{\{keyPoints\}\}/g, `<ul>${post.keyPoints.map(p => `<li>${p}</li>`).join('\n            ')}</ul>`)
    .replace(/\{\{sources\}\}/g, `<ul>${post.sources.map(s => `<li><a href="${s.url}" target="_blank">${s.title}</a></li>`).join('\n            ')}</ul>`)
    .replace(/\{\{encodedTitle\}\}/g, encodeURIComponent(post.title))
    .replace(/\{\{url\}\}/g, encodeURIComponent(postUrl))
    .replace(/\{\{rootPath\}\}/g, '../');

  if (!fs.existsSync(CONFIG.outputDir)) {
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  }

  const filepath = path.join(CONFIG.outputDir, `${slug}.html`);
  fs.writeFileSync(filepath, html);
  
  // Update blog-posts.json
  let posts = [];
  if (fs.existsSync(CONFIG.postsJson)) {
    posts = JSON.parse(fs.readFileSync(CONFIG.postsJson, 'utf8'));
  }
  
  posts.unshift({
    slug,
    title: post.title,
    description: post.description,
    category: post.category,
    categoryName,
    categoryIcon: category.icon,
    categoryColor: category.color,
    date: customDate || new Date().toISOString().split('T')[0],
    readTime: post.readTime,
    url: `blog/${slug}.html`
  });
  
  fs.writeFileSync(CONFIG.postsJson, JSON.stringify(posts, null, 2));
  
  console.log(`✅ Blog yazısı kaydedildi: ${filepath}`);
  return { slug, filepath, url: postUrl };
}

// Main CLI
async function main() {
  const args = process.argv.slice(2);
  const topicIndex = args.indexOf('--topic');
  const dateIndex = args.indexOf('--date');
  
  if (topicIndex === -1 || !args[topicIndex + 1]) {
    console.log(`
TYZD Blog Generator — Tıpta Yapay Zeka Derneği

Kullanım:
  ANTHROPIC_API_KEY=xxx node blog-generator.js --topic "Konu" [--date "1 Ocak 2026"]

Kategoriler:
  endoskopi, radyoloji, etik, llm, egitim, politika, patoloji, arastirma, genel

Örnekler:
  node blog-generator.js --topic "Kolonoskopide yapay zeka polip tespiti"
  node blog-generator.js --topic "GPT-4 klinik karar destek" --date "15 Şubat 2026"
  node blog-generator.js --topic "Tıp eğitiminde AI müfredatı"
    `);
    return;
  }

  const topic = args[topicIndex + 1];
  const customDate = dateIndex !== -1 ? args[dateIndex + 1] : null;
  
  console.log(`📝 Blog yazısı oluşturuluyor: ${topic}`);
  
  try {
    const post = await generateBlogPost(topic);
    const result = saveBlogPost(post, customDate);
    console.log(`\n🎉 Tamamlandı!`);
    console.log(`   Başlık: ${post.title}`);
    console.log(`   Kategori: ${post.category}`);
    console.log(`   Dosya: ${result.filepath}`);
    console.log(`   URL: ${result.url}`);
  } catch (error) {
    console.error('❌ Hata:', error.message);
  }
}

module.exports = { generateBlogPost, saveBlogPost, createSlug, BLOG_TEMPLATE, CONFIG };

if (require.main === module) {
  main();
}
