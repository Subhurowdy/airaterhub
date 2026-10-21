
"use strict";

/* ==========================================
   AIRATERHUB — FRONTEND CONTROLLER
   Creator: @subhurowdy
   Backend: Node.js / Express
   ========================================== */

const API_BASE_URL = "https://airaterhub-api.onrender.com";
const API_ANALYZE_URL = `${API_BASE_URL}/analyze`;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
  Array.from(root.querySelectorAll(selector));

const state = {
  analyzing: false,
  history: [],
  currentReport: null,
  toastTimer: null
};

const elements = {
  sidebar: $("#sidebar"),
  mobileMenu: $("#mobileMenu"),
  mobileOverlay: $("#mobileOverlay"),
  analyzeForm: $("#analyzeForm"),
  urlInput: $("#urlInput"),
  analyzeBtn: $("#analyzeBtn"),
  pasteBtn: $("#pasteBtn"),
  formMessage: $("#formMessage"),
  overallScore: $("#overallScore"),
  scoreRing: $("#scoreRing"),
  scoreMessage: $("#scoreMessage"),
  confidence: $("#confidence"),
  analyzedUrl: $("#analyzedUrl"),
  pipelineStatus: $("#pipelineStatus"),
  suggestionList: $("#suggestionList"),
  hashtagList: $("#hashtagList"),
  copyHashtags: $("#copyHashtags"),
  pageTitle: $("#pageTitle"),
  pageDescription: $("#pageDescription"),
  wordCount: $("#wordCount"),
  headingCount: $("#headingCount"),
  themeBtn: $("#themeBtn"),
  notificationBtn: $("#notificationBtn"),
  upgradeBtn: $("#upgradeBtn"),
  profile: $("#profile"),
  profileDropdown: $("#profileDropdown"),
  toast: $("#toast"),
  toastText: $("#toastText")
};

const METRIC_KEYS = [
  "quality",
  "viral",
  "engagement",
  "trust",
  "seo",
  "readability"
];

/* ---------- General helpers ---------- */

function safeText(value, fallback = "Not available") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  if (typeof value === "object") {
    return fallback;
  }

  return String(value);
}

function toScore(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

function getFirst(object, keys, fallback = undefined) {
  if (!object || typeof object !== "object") {
    return fallback;
  }

  for (const key of keys) {
    const value = object[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function showToast(message) {
  if (!elements.toast || !elements.toastText) return;

  elements.toastText.textContent = message;
  elements.toast.classList.add("show");

  clearTimeout(state.toastTimer);

  state.toastTimer = setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2800);
}

function setFormMessage(message, type = "") {
  if (!elements.formMessage) return;

  elements.formMessage.textContent = message;
  elements.formMessage.className = type;
}

function refreshIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

/* ---------- Sidebar / mobile menu ---------- */

function openMobileMenu() {
  elements.sidebar?.classList.add("mobile-open");
  elements.mobileOverlay?.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeMobileMenu() {
  elements.sidebar?.classList.remove("mobile-open");
  elements.mobileOverlay?.classList.remove("show");
  document.body.style.overflow = "";
}

elements.mobileMenu?.addEventListener("click", () => {
  const isOpen = elements.sidebar?.classList.contains("mobile-open");

  if (isOpen) {
    closeMobileMenu();
  } else {
    openMobileMenu();
  }
});

elements.mobileOverlay?.addEventListener("click", closeMobileMenu);

$$(".nav-item").forEach((link) => {
  link.addEventListener("click", () => {
    $$(".nav-item").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    closeMobileMenu();
  });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeMobileMenu();
    elements.profileDropdown?.classList.remove("open");
  }
});

/* ---------- Theme toggle ---------- */

function setTheme(theme) {
  const isLight = theme === "light";

  document.body.classList.toggle("light-theme", isLight);

  if (elements.themeBtn) {
    elements.themeBtn.innerHTML = isLight
      ? '<i data-lucide="moon"></i>'
      : '<i data-lucide="sun"></i>';

    elements.themeBtn.setAttribute(
      "aria-label",
      isLight ? "Switch to dark theme" : "Switch to light theme"
    );
  }

  refreshIcons();
}

elements.themeBtn?.addEventListener("click", () => {
  const isLight = document.body.classList.contains("light-theme");

  setTheme(isLight ? "dark" : "light");
});

/* ---------- Profile dropdown ---------- */

elements.profile?.addEventListener("click", (event) => {
  if (event.target.closest(".profile-dropdown")) return;

  event.stopPropagation();
  elements.profileDropdown?.classList.toggle("open");
});

elements.profileDropdown?.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.addEventListener("click", () => {
  elements.profileDropdown?.classList.remove("open");
});

/* ---------- URL validation ---------- */

function validatePublicUrl(rawValue) {
  let value = String(rawValue || "").trim();

  if (!value) {
    return {
      valid: false,
      message: "Please enter a webpage URL."
    };
  }

  if (!/^https?:\/\//i.test(value)) {
    value = "https://" + value;
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    return {
      valid: false,
      message: "Enter a valid URL, for example https://example.com/article"
    };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return {
      valid: false,
      message: "Only HTTP and HTTPS webpage URLs are supported."
    };
  }

  if (!url.hostname.includes(".")) {
    return {
      valid: false,
      message: "Please enter a complete public website URL."
    };
  }

  if (url.username || url.password) {
    return {
      valid: false,
      message: "URLs containing embedded login credentials are not supported."
    };
  }

  return {
    valid: true,
    url: url.href
  };
}

/* ---------- Paste URL ---------- */

elements.pasteBtn?.addEventListener("click", async () => {
  try {
    if (!navigator.clipboard?.readText) {
      throw new Error("Clipboard access is unavailable.");
    }

    const clipboardText = await navigator.clipboard.readText();

    if (!clipboardText.trim()) {
      showToast("Clipboard is empty.");
      return;
    }

    if (elements.urlInput) {
      elements.urlInput.value = clipboardText.trim();
      elements.urlInput.focus();
    }

    showToast("URL pasted.");
  } catch {
    showToast("Clipboard access blocked. Paste with Ctrl + V.");
    elements.urlInput?.focus();
  }
});

/* ---------- Loading and pipeline ---------- */

function setLoading(isLoading) {
  state.analyzing = isLoading;

  if (!elements.analyzeBtn) return;

  elements.analyzeBtn.disabled = isLoading;

  elements.analyzeBtn.innerHTML = isLoading
    ? '<i data-lucide="loader-circle" class="spin"></i> Analyzing...'
    : '<i data-lucide="scan-line"></i> Analyze Content <i data-lucide="arrow-right"></i>';

  refreshIcons();
}

function updatePipeline(completedStep = -1, activeStep = -1) {
  const steps = $$(".pipeline-item");

  steps.forEach((item, index) => {
    const check = $(".pipeline-check", item);
    const description = $(".pipeline-text span", item);

    item.classList.toggle("done", index <= completedStep);
    item.classList.toggle("active", index === activeStep);

    if (check) {
      check.setAttribute(
        "data-lucide",
        index <= completedStep ? "check-circle-2" :
        index === activeStep ? "loader-circle" : "circle"
      );

      check.classList.toggle("spin", index === activeStep);
    }

    if (description) {
      if (index <= completedStep) {
        description.textContent = "Completed";
      } else if (index === activeStep) {
        description.textContent = "In progress...";
      } else {
        description.textContent = "Waiting";
      }
    }
  });

  if (elements.pipelineStatus) {
    if (completedStep >= steps.length - 1) {
      elements.pipelineStatus.textContent = "Complete";
    } else if (activeStep >= 0) {
      elements.pipelineStatus.textContent = "Processing";
    } else {
      elements.pipelineStatus.textContent = "Waiting";
    }
  }

  refreshIcons();
}

/* ---------- Normalize backend response ---------- */

/*
  Supports common response formats:
  { score, scores, title, description, wordCount, headings, suggestions }
  { overallScore, metrics: { quality, seo, ... } }
  { success: true, data: { ...report } }

  If server.js uses different field names, adjust this mapping
  to match the actual server response.
*/

function normalizeReport(payload, submittedUrl) {
  if (!payload || typeof payload !== "object") {
    throw new Error("The server returned an invalid response.");
  }

  if (payload.success === false || payload.error) {
    throw new Error(
      safeText(payload.error || payload.message, "Analysis failed.")
    );
  }

  const report =
    payload.data && typeof payload.data === "object"
      ? payload.data
      : payload.report && typeof payload.report === "object"
        ? payload.report
        : payload;

  const metricsSource =
    report.metrics ||
    report.scores ||
    report.breakdown ||
    {};

  const aliases = {
    quality: ["quality", "qualityScore", "contentQuality"],
    viral: ["viral", "viralPotential", "viralScore", "virality"],
    engagement: ["engagement", "engagementScore"],
    trust: ["trust", "trustScore", "credibility"],
    seo: ["seo", "seoScore"],
    readability: ["readability", "readabilityScore"]
  };

  const metrics = {};

  METRIC_KEYS.forEach((key) => {
    const rawMetric = getFirst(metricsSource, aliases[key]);

    metrics[key] = toScore(rawMetric, 0);
  });

  const overallRaw = getFirst(
    report,
    ["overallScore", "overall", "score", "rating"],
    getFirst(metricsSource, ["overall", "overallScore"], null)
  );

  let overall;

  if (overallRaw === null) {
    const availableScores = METRIC_KEYS
      .map((key) => metrics[key])
      .filter((score) => score > 0);

    overall = availableScores.length
      ? Math.round(
          availableScores.reduce((sum, score) => sum + score, 0) /
          availableScores.length
        )
      : 0;
  } else {
    overall = toScore(overallRaw, 0);
  }

  const rawSuggestions = getFirst(
    report,
    ["suggestions", "recommendations", "improvements", "aiSuggestions"],
    []
  );

  const rawHashtags = getFirst(
    report,
    ["hashtags", "recommendedHashtags", "tags"],
    []
  );

  const title = getFirst(
    report,
    ["title", "pageTitle", "page_title", "ogTitle"],
    ""
  );

  const description = getFirst(
    report,
    ["description", "metaDescription", "meta_description", "pageDescription"],
    ""
  );

  const words = getFirst(
    report,
    ["wordCount", "word_count", "words"],
    null
  );

  const headings = getFirst(
    report,
    ["headingCount", "headingsCount", "heading_count", "headings"],
    null
  );

  const rawConfidence = getFirst(
    report,
    ["confidence", "confidenceScore", "analysisConfidence"],
    null
  );

  let confidence = 0;

  if (rawConfidence !== null) {
    confidence = toScore(rawConfidence, 0);
  } else {
    const metricCount = METRIC_KEYS.filter(
      (key) => metrics[key] > 0
    ).length;

    confidence = metricCount ? Math.round((metricCount / 6) * 100) : 0;
  }

  return {
    url: safeText(
      getFirst(report, ["url", "analyzedUrl", "sourceUrl"]),
      submittedUrl
    ),
    title: safeText(title, "No page title found"),
    description: safeText(description, "No meta description found"),
    wordCount: words,
    headingCount: Array.isArray(headings)
      ? headings.length
      : headings,
    overall,
    metrics,
    confidence,
    suggestions: Array.isArray(rawSuggestions) ? rawSuggestions : [],
    hashtags: Array.isArray(rawHashtags) ? rawHashtags : [],
    raw: report
  };
}

/* ---------- Render scores ---------- */

function verdictForScore(score) {
  if (score >= 85) return "Strong content signals detected.";
  if (score >= 70) return "Good potential, with room to improve.";
  if (score >= 50) return "Several areas may need improvement.";
  if (score > 0) return "Review the recommendations below.";
  return "No usable score was returned by the server.";
}

function renderScores(report) {
  if (elements.overallScore) {
    elements.overallScore.textContent = report.overall;
  }

  if (elements.scoreRing) {
    elements.scoreRing.style.background =
      `conic-gradient(var(--primary) ${report.overall * 3.6}deg, #252b40 0deg)`;
  }

  if (elements.scoreMessage) {
    elements.scoreMessage.textContent = verdictForScore(report.overall);
  }

  if (elements.confidence) {
    elements.confidence.textContent = `${report.confidence}%`;
  }

  if (elements.analyzedUrl) {
    elements.analyzedUrl.textContent = report.url;
    elements.analyzedUrl.title = report.url;
  }

  METRIC_KEYS.forEach((key) => {
    const scoreElement = $(`[data-score="${key}"]`);
    const progressElement = $(`[data-progress="${key}"]`);
    const score = report.metrics[key];

    if (scoreElement) {
      scoreElement.textContent = score;
    }

    if (progressElement) {
      progressElement.style.width = `${score}%`;
    }
  });


  
  // Sync the existing viral score to Content Potential.
  const contentPotentialScore = document.getElementById("contentPotentialScore");
  const contentPotentialProgress = document.getElementById("contentPotentialProgress");

  if (contentPotentialScore) {
    contentPotentialScore.textContent = report.metrics.viral ?? 0;
  }

  if (contentPotentialProgress) {
    contentPotentialProgress.style.width =
      `${report.metrics.viral ?? 0}%`;
  }

  if (elements.pageTitle) {
    elements.pageTitle.textContent = report.title;
  }

  if (elements.pageDescription) {
    elements.pageDescription.textContent = report.description;
  }

  if (elements.wordCount) {
    elements.wordCount.textContent =
      report.wordCount === null || report.wordCount === undefined
        ? "Not provided by server"
        : safeText(report.wordCount);
  }

  if (elements.headingCount) {
    elements.headingCount.textContent =
      report.headingCount === null || report.headingCount === undefined
        ? "Not provided by server"
        : safeText(report.headingCount);
  }
}


/* ---------- Suggestions ---------- */

function renderSuggestions(suggestions) {
  if (!elements.suggestionList) return;

  // Lock AI Suggestions for Free members.
  if (!airaterHubPro.isPro) {
    elements.suggestionList.replaceChildren();

    const lockCard = document.createElement("div");
    lockCard.className = "pro-feature pro-locked";

    const icon = document.createElement("div");
    icon.className = "pro-feature-icon";

    const iconElement = document.createElement("i");
    iconElement.setAttribute("data-lucide", "lock");
    icon.appendChild(iconElement);

    const title = document.createElement("h3");
    title.textContent = "AI Suggestions — Pro Feature";

    const message = document.createElement("p");
    message.textContent =
      "Upgrade to Pro to unlock personalized content recommendations and improvement tips.";

    const badge = document.createElement("span");
    badge.className = "pro-badge";
    badge.textContent = "PRO FEATURE";

    lockCard.append(icon, title, message, badge);
    elements.suggestionList.appendChild(lockCard);

    refreshIcons();
    return;
  }

  elements.suggestionList.replaceChildren();

  if (!suggestions.length) {
    const empty = document.createElement("div");
    empty.className = "empty-suggestion";

    const icon = document.createElement("i");
    icon.setAttribute("data-lucide", "lightbulb");

    const title = document.createElement("strong");
    title.textContent = "No suggestions returned";

    const message = document.createElement("p");
    message.textContent =
      "The server did not return recommendations for this page.";

    empty.append(icon, title, message);
    elements.suggestionList.appendChild(empty);

    refreshIcons();
    return;
  }

  suggestions.slice(0, 12).forEach((item) => {
    const suggestion =
      typeof item === "string"
        ? { title: item, description: "" }
        : item;

    const card = document.createElement("article");
    card.className = "suggestion-item";

    const heading = document.createElement("h4");
    heading.textContent = safeText(
      getFirst(suggestion, ["title", "heading", "name", "suggestion", "text"]),
      "Recommendation"
    );

    const description = document.createElement("p");
    description.textContent = safeText(
      getFirst(suggestion, ["description", "details", "reason", "action"]),
      ""
    );

    card.appendChild(heading);

    if (description.textContent) {
      card.appendChild(description);
    }

    elements.suggestionList.appendChild(card);
  });

  refreshIcons();
}


/* ---------- Hashtags ---------- */

function cleanHashtag(value) {
  if (typeof value !== "string") return "";

  const trimmed = value.trim();
  if (!trimmed) return "";

  const normalized = trimmed
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N}_]/gu, "");

  return normalized ? `#${normalized}` : "";
}

function renderHashtags(hashtags) {
  if (!elements.hashtagList) return;

  elements.hashtagList.replaceChildren();

  const normalized = hashtags
    .map((item) => {
      if (typeof item === "string") return cleanHashtag(item);

      return cleanHashtag(
        getFirst(item, ["tag", "hashtag", "name", "text"], "")
      );
    })
    .filter(Boolean)
    .filter((tag, index, array) => array.indexOf(tag) === index)
    .slice(0, 30);

  const finalTags = normalized.length
    ? normalized
    : ["#AiraterHub", "#ContentAnalysis"];

  finalTags.forEach((tag) => {
    const span = document.createElement("span");
    span.className = "hashtag";
    span.textContent = tag;
    elements.hashtagList.appendChild(span);
  });
}

elements.copyHashtags?.addEventListener("click", async () => {
  const tags = $$(".hashtag", elements.hashtagList)
    .map((element) => element.textContent.trim())
    .filter(Boolean);

  if (!tags.length) {
    showToast("There are no hashtags to copy.");
    return;
  }

  try {
    await navigator.clipboard.writeText(tags.join(" "));
    showToast("Hashtags copied!");
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = tags.join(" ");
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    textarea.remove();

    showToast(copied ? "Hashtags copied!" : "Copy failed. Select and copy manually.");
  }
});

/* ---------- Analysis history ---------- */

function saveHistory(report) {
  const entry = {
    url: report.url,
    title: report.title,
    score: report.overall,
    analyzedAt: new Date().toISOString()
  };

  state.history.unshift(entry);
  state.history = state.history.slice(0, 20);
}

/* ---------- Main backend request ---------- */

async function analyzeUrl(url) {
  if (state.analyzing) return;

  setLoading(true);
  setFormMessage("Connecting to the AiraterHub analysis server...");
  updatePipeline(-1, 0);

  if (elements.analyzedUrl) {
    elements.analyzedUrl.textContent = "Analysis in progress...";
  }

  try {
    const response = await fetch(API_ANALYZE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(45000)
    });

    updatePipeline(0, 1);

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      throw new Error(
        "Server did not return JSON. Check that server.js is running on port 3000."
      );
    }

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        safeText(
          payload.error || payload.message,
          `Server returned HTTP ${response.status}.`
        )
      );
    }

    updatePipeline(1, 2);

    const report = normalizeReport(payload, url);

    updatePipeline(2, 3);
    renderScores(report);
    renderSuggestions(report.suggestions);
    renderHashtags(report.hashtags);

    updatePipeline(4, -1);

    state.currentReport = report;
    saveHistory(report);
saveHistoryToStorage(report);

    setFormMessage("Analysis completed using the server response.", "success");
    showToast("Analysis completed successfully.");

    $("#results")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  } catch (error) {
    console.error("[AiraterHub] Analysis error:", error);

    updatePipeline(-1, -1);

    let message = error.message || "An unexpected error occurred.";

    if (
      error.name === "TimeoutError" ||
      error.name === "AbortError"
    ) {
      message = "The request timed out. Try again with another public webpage.";
    } else if (error instanceof TypeError) {
      message =
        "Cannot connect to the backend. Start server.js and check the API URL and CORS settings.";
    }

    setFormMessage(message, "error");
    showToast("Analysis failed. Check the message above.");
  } finally {
    setLoading(false);
  }
}

elements.analyzeForm?.addEventListener("submit", (event) => {
  event.preventDefault();

  const result = validatePublicUrl(elements.urlInput?.value);

  if (!result.valid) {
    setFormMessage(result.message, "error");
    elements.urlInput?.focus();
    return;
  }

  setFormMessage("");
  analyzeUrl(result.url);
});

/* ---------- Header buttons ---------- */

elements.notificationBtn?.addEventListener("click", () => {
  showToast("You're all caught up.");
});

elements.upgradeBtn?.addEventListener("click", () => {
  showToast("Pro subscription and payments are not connected yet.");
});

/* ---------- Initial page setup ---------- */

function initializeDashboard() {
  updatePipeline(-1, -1);

  METRIC_KEYS.forEach((key) => {
    const scoreElement = $(`[data-score="${key}"]`);
    const progressElement = $(`[data-progress="${key}"]`);

    if (scoreElement) scoreElement.textContent = "0";
    if (progressElement) progressElement.style.width = "0%";
  });

  renderHashtags([
    "#AiraterHub",
    "#ContentAnalysis",
    "#ContentCreator",
    "#DigitalContent"
  ]);

  setTheme("dark");
  refreshIcons();

  console.info(
    "[AiraterHub] Frontend initialized. Creator: @subhurowdy"
  );
}

initializeDashboard();






/* ===== AIRATERHUB ANALYSIS HISTORY ===== */

const HISTORY_STORAGE_KEY = "airaterhub_analysis_history";
const historyListElement = document.getElementById("historyList");
const clearHistoryButton = document.getElementById("clearHistoryBtn");

function loadSavedHistory() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(HISTORY_STORAGE_KEY) || "[]"
    );

    return Array.isArray(saved) ? saved.slice(0, 20) : [];
  } catch {
    return [];
  }
}



async function loadDatabaseHistory() {
  try {
    const response = await fetch(`${API_BASE_URL}/analyses`);

    if (!response.ok) {
      throw new Error(`History request failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success || !Array.isArray(data.analyses)) {
      throw new Error("Invalid history response.");
    }

    return data.analyses.map((item) => {
      let report = null;

      try {
        report = typeof item.report_json === "string"
          ? JSON.parse(item.report_json)
          : item.report_json;
      } catch (error) {
        console.error("Could not parse saved report:", error);
      }

      return {
        id: item.id,
        url: item.url || "",
        title: report?.title || "Untitled analysis",
        score: Number(item.overall_score) || 0,
        analyzedAt: item.created_at || "",
        report: report
      };
    });
  } catch (error) {
    console.error("Could not load database history:", error);
    return null;
  }
}


function saveHistoryToStorage(report) {
  try {
    const history = loadSavedHistory();

    history.unshift({
      url: report.url || "",
      title: report.title || "Untitled analysis",
      score: Number(report.overall) || 0,
      analyzedAt: new Date().toISOString(),
      report: report
    });

    localStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify(history.slice(0, 20))
    );

    renderSavedHistory();
  } catch (error) {
    console.error("Could not save analysis history:", error);
    showToast("History could not be saved in this browser.");
  }
}

 

async function renderSavedHistory() {
  if (!historyListElement) return;

  historyListElement.replaceChildren();

  const databaseHistory = await loadDatabaseHistory();

  const history = databaseHistory !== null
    ? databaseHistory
    : loadSavedHistory();

  if (history.length === 0) {
    const empty = document.createElement("p");
    empty.textContent =
      "No analysis history yet. Analyze a URL to get started.";

    historyListElement.appendChild(empty);
    return;
  }

  history.forEach((item) => {
    const card = document.createElement("article");
    card.className = "history-item";

    const title = document.createElement("h3");
    title.textContent = item.title || "Untitled analysis";

    const url = document.createElement("p");
    url.textContent = item.url || "";

    const score = document.createElement("p");
    score.textContent = `Overall score: ${item.score}/100`;

    const date = document.createElement("p");
    const parsedDate = new Date(item.analyzedAt);

    date.textContent = Number.isNaN(parsedDate.getTime())
      ? ""
      : parsedDate.toLocaleString();

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.textContent = "View Report";

    viewButton.addEventListener("click", () => {
const isPro = localStorage.getItem("airaterhub_is_pro") === "true";

if (!isPro) {
showToast("Pro feature 🔒 Upgrade to Pro to view full reports.");
return;
}

const analysisId = item.id;

if (!analysisId || !/^\d+$/.test(String(analysisId))) {
showToast("Could not open this report. Report ID is missing.");
return;
}

window.location.href = `report.html?id=${encodeURIComponent(analysisId)}`;
});


    card.append(title, url, score, date, viewButton);
    historyListElement.appendChild(card);
  });
}

if (clearHistoryButton) {
  clearHistoryButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Are you sure you want to delete all analysis history?"
    );

    if (!confirmed) return;

    clearHistoryButton.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/analyses`, {
        method: "DELETE"
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Could not clear history.");
      }

      localStorage.removeItem(HISTORY_STORAGE_KEY);

      await renderSavedHistory();

      showToast(
        `Analysis history cleared. Deleted: ${data.deletedCount}`
      );
    } catch (error) {
      console.error("[AiraterHub Clear History]", error);
      showToast("Could not clear history. Please try again.");
    } finally {
      clearHistoryButton.disabled = false;
    }
  });
}

renderSavedHistory();





/* ===== AIRATERHUB HASHTAG ANALYZER ===== */

(() => {
  const topicInput = document.getElementById("hashtagTopic");
  const platformInput = document.getElementById("hashtagPlatform");
  const generateButton = document.getElementById("generateHashtagsBtn");
  const resultsPanel = document.getElementById("hashtagToolResults");
  const chipsContainer = document.getElementById("hashtagToolChips");
  const summary = document.getElementById("hashtagResultSummary");
  const message = document.getElementById("hashtagToolMessage");
  const copyButton = document.getElementById("copyHashtagSetBtn");

  if (
    !topicInput || !platformInput || !generateButton ||
    !resultsPanel || !chipsContainer || !summary ||
    !message || !copyButton
  ) return;

  let generatedHashtags = [];

  const stopWords = new Set([
    "the", "and", "for", "with", "from", "this", "that",
    "your", "you", "are", "was", "how", "what", "why",
    "into", "about", "have", "has", "its", "our", "use",
    "using", "best", "top", "new"
  ]);

  function makeHashtag(word) {
    const cleaned = word
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]/g, "");

    if (!cleaned || !/[a-zA-Z]/.test(cleaned)) return "";
    return "#" + cleaned;
  }

  function generateSuggestions(rawInput, platform) {
    const words = rawInput.match(/[\p{L}\p{N}]+/gu) || [];

    const uniqueWords = [...new Set(
      words
        .filter(word => word.length > 1)
        .filter(word => !stopWords.has(word.toLowerCase()))
    )];

    const existingTags = (
      rawInput.match(/#[\p{L}\p{N}_]+/gu) || []
    ).map(tag => makeHashtag(tag.slice(1)));

    const topicTags = uniqueWords.map(makeHashtag).filter(Boolean);

    const platformTags = {
      instagram: ["Instagram", "InstaDaily", "ContentCreator"],
      youtube: ["YouTube", "VideoCreator", "NewVideo"],
      facebook: ["Facebook", "SocialMedia"],
      x: ["Twitter", "Discussion", "TrendingTopics"]
    };

    const generalTags = ["DigitalContent", "ExploreMore"];

    return [...new Set([
      ...existingTags,
      ...topicTags,
      ...platformTags[platform].map(makeHashtag),
      ...generalTags.map(makeHashtag)
    ])].slice(0, 20);
  }

  generateButton.addEventListener("click", () => {
    const input = topicInput.value.trim();

    if (!input) {
      message.textContent = "Enter a topic or some hashtags first.";
      resultsPanel.hidden = true;
      return;
    }

    generatedHashtags = generateSuggestions(input, platformInput.value);
    chipsContainer.replaceChildren();

    generatedHashtags.forEach(tag => {
      const chip = document.createElement("span");
      chip.className = "hashtag-tool-chip";
      chip.textContent = tag;
      chipsContainer.appendChild(chip);
    });

    const platformName =
      platformInput.options[platformInput.selectedIndex].text;

    summary.textContent =
      `${generatedHashtags.length} hashtag suggestions · ${platformName}`;

    message.textContent = "Hashtag suggestions generated.";
    resultsPanel.hidden = false;
  });

  copyButton.addEventListener("click", async () => {
    if (!generatedHashtags.length) return;

    try {
      await navigator.clipboard.writeText(generatedHashtags.join(" "));
      message.textContent = "Hashtags copied to clipboard.";
    } catch {
      message.textContent =
        "Copy was blocked. Please select and copy the hashtags manually.";
    }
  });
})();





/* ===== AIRATERHUB PRO FEATURE ACCESS ===== */

const airaterHubPro = {
  isPro: false
};

function showProUpgradeMessage(featureName) {
  if (airaterHubPro.isPro) return true;

  alert(`${featureName} is a Pro feature. Upgrade to unlock it.`);
  return false;
}


function updateProFeatures() {
  const isPro = airaterHubPro.isPro;

  // Lock existing Pro feature cards for Free members.
  document.querySelectorAll(".pro-feature").forEach((feature) => {
    feature.classList.toggle("pro-locked", !isPro);
    feature.setAttribute(
      "aria-label",
      isPro ? "Pro feature unlocked" : "Pro feature locked"
    );
  });

  // Lock Content Potential / Viral Potential.
  const viralScore = document.querySelector('[data-score="viral"]');
  const viralCard = viralScore?.closest(".metric-card");

  if (viralCard) {
    viralCard.classList.toggle("pro-locked", !isPro);
    viralCard.setAttribute(
      "aria-label",
      isPro ? "Content Potential" : "Content Potential is a Pro feature"
    );
  }

  // Lock the entire Hashtag Analyzer section.
  const hashtagSection = document.querySelector("#hashtag-analyzer");

  if (hashtagSection) {
    hashtagSection.classList.toggle("pro-locked", !isPro);
    hashtagSection.setAttribute("aria-disabled", String(!isPro));

    let lockMessage = hashtagSection.querySelector(".hashtag-pro-lock");

    if (!isPro && !lockMessage) {
      lockMessage = document.createElement("div");
      lockMessage.className = "hashtag-pro-lock";
      lockMessage.textContent =
        "🔒 Hashtag Analyzer is a Pro feature. Upgrade to unlock it.";
      hashtagSection.prepend(lockMessage);
    } else if (isPro && lockMessage) {
      lockMessage.remove();
    }

    hashtagSection
      .querySelectorAll("input, select, textarea, button")
      .forEach((control) => {
        control.disabled = !isPro;
        control.setAttribute("aria-disabled", String(!isPro));
      });
  }
}

// Run safely whether this script loads before or after DOMContentLoaded.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", updateProFeatures, { once: true });
} else {
  updateProFeatures();
}

// PDF export: Free members cannot print through this button.
const pdfExportButton = document.getElementById("pdfExportButton");

if (pdfExportButton) {
  pdfExportButton.addEventListener("click", () => {
    if (!showProUpgradeMessage("PDF Export")) return;
    window.print();
  });
}

// Give Free users a clear message if they try to use the locked hashtag tool.
const generateHashtagsButton = document.getElementById("generateHashtagsBtn");

if (generateHashtagsButton) {
  generateHashtagsButton.addEventListener("click", (event) => {
    if (!showProUpgradeMessage("Hashtag Analyzer")) {
      event.preventDefault();
    }
  }, true);
}



/* ===== CONTENT POTENTIAL: SYNC EXISTING VIRAL SCORE ===== */


function updateContentPotentialDisplay() {
  const sourceScore = document.querySelector('[data-score="viral"]');
  const sourceProgress = document.querySelector('[data-progress="viral"]');

  const targetScore = document.getElementById("contentPotentialScore");
  const targetProgress = document.getElementById("contentPotentialProgress");
  const description = document.getElementById("contentPotentialDescription");
  const lockMessage = document.getElementById("contentPotentialLock");
  const contentCard = document.getElementById("contentPotentialCard");

  if (!sourceScore || !targetScore) return;

  // Reuse the score from the existing analysis.
  const scoreText = sourceScore.textContent.trim();
  targetScore.textContent = scoreText || "—";

  const scoreValue = Number(scoreText);
  const hasScore = scoreText !== "" && Number.isFinite(scoreValue);

  if (targetProgress) {
    targetProgress.style.width = hasScore
      ? `${Math.max(0, Math.min(100, scoreValue))}%`
      : "0%";
  }

  if (description) {
    description.textContent = hasScore
      ? "Your content engagement indicators are ready. Unlock Pro to view your score."
      : "Analyze a URL to preview your content potential.";
  }

  const isPro = airaterHubPro.isPro;

  if (contentCard) {
    contentCard.classList.toggle("content-potential-locked", !isPro);
  }

  if (lockMessage) {
    lockMessage.hidden = isPro;
    lockMessage.textContent = isPro
      ? ""
      : "🔒 PRO FEATURE — Unlock your Content Potential score and analytics with AiraterHub Pro.";
  }

  // Pro members see the full score; Free members see a blurred preview.
  targetScore.style.filter = isPro ? "none" : "";
  targetScore.style.visibility = "visible";

  if (targetProgress) {
    targetProgress.style.filter = isPro ? "none" : "";
    targetProgress.style.visibility = "visible";
  }

  if (description && isPro && hasScore) {
    description.textContent =
      "This score reflects the content engagement indicators from your analysis.";
  }
}

function initializeContentPotentialSync() {
  updateContentPotentialDisplay();

  const sourceScore = document.querySelector('[data-score="viral"]');

  if (sourceScore) {
    const observer = new MutationObserver(updateContentPotentialDisplay);
    observer.observe(sourceScore, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }

  const sourceProgress = document.querySelector('[data-progress="viral"]');

  if (sourceProgress) {
    const observer = new MutationObserver(updateContentPotentialDisplay);
    observer.observe(sourceProgress, {
      attributes: true,
      attributeFilter: ["style", "class"]
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener(
    "DOMContentLoaded",
    initializeContentPotentialSync,
    { once: true }
  );
} else {
  initializeContentPotentialSync();
}