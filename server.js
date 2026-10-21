
"use strict";

/*
 * AIRATERHUB — CONTENT ANALYSIS API
 * Creator: @subhurowdy
 * Node.js 20+
 *
 * Analysis type: Public HTML heuristic analysis
 * Note: Does not measure real social reach, likes, views or virality.
 */

const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const db = require("./database");
const dns = require("node:dns").promises;
const net = require("node:net");

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "10kb" }));

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; AiraterHubBot/1.1; +https://airaterhub.com)";

const MAX_HTML_BYTES = 2_000_000;
const REQUEST_TIMEOUT_MS = 20000;

/* -------------------- Basic routes -------------------- */

app.get("/", (_req, res) => {
  res.json({
    name: "AiraterHub API",
    status: "online",
    version: "1.1.0",
    creator: "@subhurowdy",
    analysisType: "public-html-heuristic",
    endpoints: {
      health: "GET /health",
      analyze: "POST /analyze"
    }
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

/* -------------------- URL safety checks -------------------- */

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);

  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }

  const [a, b, c] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) ||
    (a === 203 && b === 0) ||
    (a === 255 && b === 255)
  );
}

function isBlockedIP(ip) {
  const version = net.isIP(ip);

  if (version === 4) {
    return isPrivateIPv4(ip);
  }

  if (version === 6) {
    const value = ip.toLowerCase();

    if (
      value === "::" ||
      value === "::1" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      /^fe[89ab]/.test(value) ||
      value.startsWith("2001:db8:")
    ) {
      return true;
    }

    // IPv4-mapped IPv6: reject to avoid bypassing IPv4 checks.
    if (value.startsWith("::ffff:")) {
      const mapped = value.slice(7);

      if (net.isIP(mapped) === 4) {
        return isPrivateIPv4(mapped);
      }

      return true;
    }

    return false;
  }

  return true;
}

async function validatePublicUrl(rawUrl) {
  let url;

  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Enter a valid webpage URL.");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }

  if (url.username || url.password) {
    throw new Error("URLs containing login credentials are not supported.");
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "");

  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".test")
  ) {
    throw new Error("Enter a public website URL.");
  }

  if (url.port && !["80", "443"].includes(url.port)) {
    throw new Error("Only standard HTTP/HTTPS ports are supported.");
  }

  const ipVersion = net.isIP(hostname);

  if (ipVersion) {
    if (isBlockedIP(hostname)) {
      throw new Error("Private or reserved IP addresses are not allowed.");
    }
  } else {
    let records;

    try {
      records = await dns.lookup(hostname, {
        all: true,
        verbatim: true
      });
    } catch {
      throw new Error("The website domain could not be resolved.");
    }

    if (
      !records.length ||
      records.some((record) => isBlockedIP(record.address))
    ) {
      throw new Error(
        "This domain does not resolve exclusively to public IP addresses."
      );
    }
  }

  return url;
}

/*
 * Development safeguard only.
 * Before public deployment, add stronger SSRF protection, DNS pinning,
 * rate limits, request quotas and an outbound network policy.
 */

/* -------------------- Fetch public HTML -------------------- */

async function fetchPublicPage(url) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(url.href, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    if (!response.ok) {
      throw new Error(`The webpage returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") || "";

    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new Error("This URL did not return an HTML webpage.");
    }

    const declaredLength = Number(
      response.headers.get("content-length") || 0
    );

    if (declaredLength > MAX_HTML_BYTES) {
      throw new Error("The webpage is too large to analyze.");
    }

    if (!response.body) {
      throw new Error("The webpage returned an empty response.");
    }

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      totalBytes += value.byteLength;

      if (totalBytes > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new Error("The webpage exceeds the 2 MB analysis limit.");
      }

      chunks.push(value);
    }

    const bytes = new Uint8Array(totalBytes);
    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return new TextDecoder("utf-8").decode(bytes);
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------- Text helpers -------------------- */

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countWords(text) {
  return (text.match(/[\p{L}\p{N}]+(?:['’_-][\p{L}\p{N}]+)*/gu) || [])
    .length;
}

function extractPageData(html, url) {
  const $ = cheerio.load(html);
  const isInstagram = url.hostname === "www.instagram.com" ||
                    url.hostname === "instagram.com";

  const title = (
    $('meta[property="og:title"]').attr("content") ||
    $("title").first().text() ||
    ""
  ).trim().slice(0, 300);

  const description = (
    $('meta[name="description"]').attr("content") ||
    $('meta[property="og:description"]').attr("content") ||
    ""
  ).trim().slice(0, 1000);

  const metaRobots = (
    $('meta[name="robots"]').attr("content") || ""
  ).trim();

  const canonical = (
    $('link[rel="canonical"]').attr("href") || ""
  ).trim();

  const h1Count = $("h1").length;

  const headings = $("h1, h2, h3, h4")
    .map((_index, element) => $(element).text().trim())
    .get()
    .filter(Boolean)
    .slice(0, 100);

  // Capture paragraph text before removing non-content elements.
  const paragraphs = $("p")
    .map((_index, element) => $(element).text().trim())
    .get()
    .filter((paragraph) => paragraph.length > 0);

  $("script, style, noscript, iframe, svg, canvas").remove();
  $("nav, footer, header").remove();

  
const bodyText = $("body").text();

const text = bodyText
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 100_000);



const wordCount = countWords(text);
  const paragraphCount = paragraphs.length;
  console.log("AiraterHub extraction check:", {
  title,
  descriptionLength: description.length,
  h1Count,
  headingCount: headings.length,
  paragraphCount,
  wordCount,
  textPreview: text.slice(0, 300)
});
  const imageCount = $("img").length;
  const imagesWithAlt = $("img[alt]")
    .filter((_index, element) => {
      return Boolean($(element).attr("alt").trim());
    })
    .length;

  const internalLinks = $("a[href]")
    .map((_index, element) => $(element).attr("href"))
    .get()
    .filter((href) => {
      if (!href) return false;

      try {
        const linkUrl = new URL(href, url.href);
        return (
          ["http:", "https:"].includes(linkUrl.protocol) &&
          linkUrl.hostname === url.hostname
        );
      } catch {
        return href.startsWith("/") && !href.startsWith("//");
      }
    }).length;

  const externalLinks = $("a[href]")
    .map((_index, element) => $(element).attr("href"))
    .get()
    .filter((href) => {
      try {
        const linkUrl = new URL(href, url.href);

        return (
          ["http:", "https:"].includes(linkUrl.protocol) &&
          linkUrl.hostname !== url.hostname
        );
      } catch {
        return false;
      }
    }).length;

  const scores = calculateScores({
    title,
    description,
    headings,
    h1Count,
    text,
    paragraphs,
    wordCount,
    imageCount,
    imagesWithAlt,
    internalLinks,
    externalLinks
  });

  const confidence = calculateConfidence({
    title,
    description,
    headings,
    text,
    wordCount
  });

  const suggestions = buildSuggestions({
    title,
    description,
    headings,
    h1Count,
    wordCount,
    paragraphCount,
    imageCount,
    imagesWithAlt,
    metaRobots,
    canonical,
    isInstagram
  });

  return {
    success: true,
    url: url.href,
    title,
    description,
    wordCount,
    headingCount: headings.length,
    h1Count,
    headings,
    paragraphCount,
    imageCount,
    imagesWithAlt,
    internalLinks,
    externalLinks,
    overallScore: scores.overall,
    metrics: scores.metrics,
    confidence,
    confidenceMeaning: "Estimated coverage of extractable HTML signals, not score accuracy.",
    suggestions,
    hashtags: [],
    analysisType: "public-html-heuristic",
    socialMetrics: {
      available: false,
      likes: null,
      views: null,
      comments: null,
      shares: null,
      message:
        "Actual social metrics were not available from this HTML analysis."
    },
    disclaimer:
      "Scores are heuristic estimates from accessible HTML. They do not verify factual accuracy, originality, actual reach, likes, views, shares, or viral probability."
  };
}

/* -------------------- Scoring engine -------------------- */


/* -------------------- Scoring engine -------------------- */

function calculateScores({
  title,
  description,
  headings,
  h1Count,
  text,
  paragraphs,
  wordCount,
  imageCount,
  imagesWithAlt,
  internalLinks,
  externalLinks
}) {
  const titleLength = title.length;
  const descriptionLength = description.length;

  const hasTitle = titleLength > 0;
  const hasDescription = descriptionLength > 0;
  const hasHeadings = headings.length > 0;
  const hasMultipleSections = headings.length >= 3;
  const hasUsefulLength = wordCount >= 300;
  const hasLongText = wordCount >= 600;

  const substantialParagraphs = paragraphs.filter(
    (paragraph) => countWords(paragraph) >= 20
  ).length;

  const hasReadableParagraphs = substantialParagraphs >= 3;
  const hasQuestion = /\?/.test(text);

  const hasAction =
    /\b(subscribe|learn more|read more|sign up|contact|download|discover|try now|buy now)\b/i
      .test(text);

  // Content quality
  const quality = clamp(
    15 +
    (wordCount >= 100 ? 10 : 0) +
    (hasUsefulLength ? 15 : 0) +
    (hasLongText ? 10 : 0) +
    (hasTitle ? 5 : 0) +
    (hasDescription ? 5 : 0) +
    (hasHeadings ? 10 : 0) +
    (hasMultipleSections ? 10 : 0) +
    (hasReadableParagraphs ? 15 : 0) +
    (imageCount > 0 ? 5 : 0) -
    (wordCount < 50 ? 15 : 0)
  );

  // SEO signals available in fetched HTML
  const seo = clamp(
    (hasTitle ? 15 : 0) +
    (titleLength >= 20 && titleLength <= 65 ? 15 : 0) +
    (hasDescription ? 15 : 0) +
    (descriptionLength >= 70 && descriptionLength <= 170 ? 15 : 0) +
    (h1Count === 1 ? 15 : 0) +
    (hasHeadings ? 10 : 0) +
    (hasMultipleSections ? 5 : 0) +
    (internalLinks > 0 ? 5 : 0) +
    (imageCount === 0 || imagesWithAlt === imageCount ? 5 : 0)
  );

  // Structural readability proxy
  const readability = clamp(
    20 +
    (hasTitle ? 5 : 0) +
    (hasHeadings ? 15 : 0) +
    (hasMultipleSections ? 15 : 0) +
    (hasReadableParagraphs ? 20 : 0) +
    (wordCount >= 100 && wordCount <= 2500 ? 15 : 0) +
    (hasUsefulLength ? 10 : 0)
  );

  // Page-level interaction cues, not measured user engagement
  const engagement = clamp(
    20 +
    (hasQuestion ? 10 : 0) +
    (hasAction ? 15 : 0) +
    (hasMultipleSections ? 15 : 0) +
    (internalLinks > 0 ? 10 : 0) +
    (externalLinks > 0 ? 10 : 0) +
    (hasReadableParagraphs ? 10 : 0)
  );

  // Basic trust-related presentation signals
  const trust = clamp(
    20 +
    (hasTitle ? 10 : 0) +
    (hasDescription ? 10 : 0) +
    (hasUsefulLength ? 10 : 0) +
    (hasHeadings ? 10 : 0) +
    (internalLinks > 0 ? 10 : 0) +
    (externalLinks > 0 ? 10 : 0) +
    (hasMultipleSections ? 5 : 0)
  );

  // Content-structure proxy; not a real virality prediction
  const viral = clamp(
    20 +
    (hasTitle ? 10 : 0) +
    (hasQuestion ? 10 : 0) +
    (hasAction ? 15 : 0) +
    (hasMultipleSections ? 10 : 0) +
    (hasUsefulLength ? 10 : 0) +
    (hasReadableParagraphs ? 5 : 0)
  );

  const metrics = {
    quality,
    seo,
    readability,
    engagement,
    trust,
    viral
  };

  const overall = Math.round(
    Object.values(metrics).reduce((sum, score) => sum + score, 0) /
    Object.keys(metrics).length
  );

  return { overall, metrics };
}

/* -------------------- Confidence estimate -------------------- */

function calculateConfidence({
  title,
  description,
  headings,
  text,
  wordCount
}) {
  let confidence = 10;

  if (title) confidence += 15;
  if (description) confidence += 15;
  if (headings.length > 0) confidence += 15;
  if (wordCount >= 50) confidence += 10;
  if (wordCount >= 300) confidence += 10;
  if (wordCount >= 600) confidence += 10;
  if (text.length >= 500) confidence += 10;

  return Math.min(95, confidence);
}

/* -------------------- Suggestions -------------------- */

function buildSuggestions({
  title,
  description,
  headings,
  h1Count,
  wordCount,
  paragraphCount,
  imageCount,
  imagesWithAlt,
  metaRobots,
  canonical,
   isInstagram
})
 {
  const suggestions = [];

  if (!title) {
    suggestions.push({
      title: "Add a descriptive page title",
      description: "The fetched HTML does not expose a title element or Open Graph title.",
      priority: "high",
      type: "SEO"
    });
  } else if (title.length < 20 || title.length > 65) {
    suggestions.push({
      title: "Review the page title length",
      description: "Consider a concise title that accurately describes the page.",
      priority: "medium",
      type: "SEO"
    });
  }

  if (!description) {
    suggestions.push({
      title: "Add a meta description",
      description: "Provide a relevant summary of the page for search-result snippets.",
      priority: "high",
      type: "SEO"
    });
  } else if (description.length < 70 || description.length > 170) {
    suggestions.push({
      title: "Review the meta description",
      description: "Consider a clear summary of an appropriate length.",
      priority: "medium",
      type: "SEO"
    });
  }

 
if (!isInstagram) {
  if (h1Count === 0) {
    suggestions.push({
      title: "Add a main heading",
      description: "No H1 heading was found in the fetched HTML.",
      priority: "medium",
      type: "Structure"
    });
  } else if (h1Count > 1) {
    suggestions.push({
      title: "Review the main heading structure",
      description: "Multiple H1 headings were found. Check that the page hierarchy is clear.",
      priority: "low",
      type: "Structure"
    });
  }
}

 
  if (!isInstagram && headings.length < 3 && wordCount >= 100) {
    suggestions.push({
      title: "Improve heading structure",
      description: "Use descriptive section headings where they help readers navigate the content.",
      priority: "medium",
      type: "Readability"
    });
  }

  if (wordCount < 100) {
    suggestions.push({
      title: isInstagram ? "Limited Instagram data available" : "Limited text was available",
      description: isInstagram
        ? "Only a small amount of public Instagram text was extractable. The full caption or media details may not be available."
        : "This page exposes very little text to the analyzer. It may be a short page, or content may load dynamically.",
      priority: "medium",
      type: "Content"
    });
  } else if (!isInstagram && wordCount < 300) {
    suggestions.push({
      title: "Review content depth",
      description: "Check whether the page provides enough useful detail for its purpose. Short pages are not automatically low quality.",
      priority: "low",
      type: "Content"
    });
  }

  if (!isInstagram && paragraphCount < 3 && wordCount >= 100) {
    suggestions.push({
      title: "Review paragraph structure",
      description: "The page exposes few paragraph elements. Clear paragraph breaks can improve scanning.",
      priority: "low",
      type: "Readability"
    });
  }

  if (imageCount > 0 && imagesWithAlt < imageCount) {
    suggestions.push({
      title: "Review image alternative text",
      description: `${imageCount - imagesWithAlt} image(s) do not have non-empty alt text in the fetched HTML.`,
      priority: "medium",
      type: "Accessibility"
    });
  }

  if (!canonical) {
    suggestions.push({
      title: "Check the canonical URL",
      description: "No canonical link was found in the fetched HTML. Confirm whether this page needs one.",
      priority: "low",
      type: "SEO"
    });
  }

  if (/\bnoindex\b/i.test(metaRobots)) {
    suggestions.push({
      title: "A noindex directive was detected",
      description: "The page's robots meta tag includes noindex. Confirm this is intentional if you want search engines to index it.",
      priority: "high",
      type: "SEO"
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: "Review usefulness and accuracy",
      description: "Automated HTML signals cannot determine whether content is original, accurate, or fully satisfies reader intent.",
      priority: "low",
      type: "Content"
    });
  }

  return suggestions.slice(0, 12);
}

/* -------------------- Analysis endpoint -------------------- */

app.post("/analyze", async (req, res) => {
  try {
    const rawUrl = req.body?.url;

    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return res.status(400).json({
        success: false,
        error: "A webpage URL is required."
      });
    }

    if (rawUrl.length > 2048) {
      return res.status(400).json({
        success: false,
        error: "The URL is too long."
      });
    }
    
const url = await validatePublicUrl(rawUrl.trim());
    
const html = await fetchPublicPage(url);
const report = extractPageData(html, url);

console.log("AiraterHub test:", {
  url: report.url,
  title: report.title,
  wordCount: report.wordCount,
  headingCount: report.headingCount,
  overallScore: report.overallScore,
  metrics: report.metrics
});

const saveAnalysis = db.prepare(`
  INSERT INTO analyses (url, overall_score, report_json)
  VALUES (?, ?, ?)
`);

saveAnalysis.run(
  report.url,
  Number.isFinite(Number(report.overallScore))
    ? Number(report.overallScore)
    : null,
  JSON.stringify(report)
);

console.log("Analysis saved to SQLite database.");
return res.json(report);

  } catch (error) {
    console.error("[AiraterHub API]", error.message);

    const message =
      error.name === "AbortError"
        ? "The webpage request timed out. Try another public webpage."
        : error.message || "Unable to analyze this webpage.";

    return res.status(400).json({
      success: false,
      error: message
    });
  }
});




/* -------------------- Analysis History endpoint -------------------- */

app.get("/analyses", (req, res) => {
  try {
    const analyses = db.prepare(`
     SELECT id, url, overall_score, report_json, created_at
      FROM analyses
      ORDER BY id DESC
      LIMIT 20
    `).all();

    return res.json({
      success: true,
      count: analyses.length,
      analyses
    });
  } catch (error) {
    console.error("[AiraterHub History]", error.message);

    return res.status(500).json({
      success: false,
      error: "Unable to load analysis history."
    });
  }
});

/* -------------------- Clear Analysis History endpoint -------------------- */

app.delete("/analyses", (req, res) => {
  try {
    const result = db.prepare("DELETE FROM analyses").run();

    return res.json({
      success: true,
      deletedCount: result.changes,
      message: "Analysis history cleared successfully."
    });
  } catch (error) {
    console.error("[AiraterHub Clear History]", error.message);

    return res.status(500).json({
      success: false,
      error: "Unable to clear analysis history."
    });
  }
});

/* -------------------- Single Analysis Report endpoint -------------------- */

app.get("/analyses/:id", (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid analysis ID."
      });
    }

    const analysis = db.prepare(`
      SELECT id, url, overall_score, report_json, created_at
      FROM analyses
      WHERE id = ?
    `).get(id);

    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: "Analysis report not found."
      });
    }

    let report;

    try {
      report = JSON.parse(analysis.report_json);
    } catch {
      return res.status(500).json({
        success: false,
        error: "Saved report data is invalid."
      });
    }

    return res.json({
      success: true,
      analysis: {
        id: analysis.id,
        url: analysis.url,
        overall_score: analysis.overall_score,
        created_at: analysis.created_at,
        report
      }
    });
  } catch (error) {
    console.error("[AiraterHub Single Report]", error.message);

    return res.status(500).json({
      success: false,
      error: "Unable to load this report."
    });
  }
});

/* -------------------- 404 handler -------------------- */

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: "API endpoint not found."
  });
});

/* -------------------- Start server -------------------- */

app.listen(PORT, () => {
  console.log(`AiraterHub API running at http://localhost:${PORT}`);
  console.log("Creator: @subhurowdy");
});