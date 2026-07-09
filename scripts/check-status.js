const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data");
const statusPath = path.join(dataDir, "status.json");
const incidentsPath = path.join(dataDir, "incidents.json");

const now = new Date();
const nowIso = now.toISOString();

const services = {
  personal: {
    label: "WhatsApp común",
    query: '"whatsapp down" OR "whatsapp outage" OR "se cayo whatsapp" OR "caida whatsapp" OR "whatsapp no funciona"',
    keywords: ["whatsapp down", "whatsapp outage", "se cayo whatsapp", "se cayó whatsapp", "caida whatsapp", "caída whatsapp", "whatsapp no funciona", "problemas whatsapp"]
  },
  business: {
    label: "WhatsApp Business",
    query: '"whatsapp business down" OR "whatsapp business outage" OR "whatsapp business platform outage" OR "whatsapp business no funciona"',
    keywords: ["whatsapp business down", "whatsapp business outage", "whatsapp business platform outage", "whatsapp business no funciona", "whatsapp business caída", "whatsapp business caida"]
  }
};

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeXml(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRssItems(xml) {
  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  for (const match of itemMatches) {
    const itemXml = match[1];
    const title = stripHtml((itemXml.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const link = decodeXml((itemXml.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || "");
    const pubDateRaw = stripHtml((itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    const pubDate = pubDateRaw ? new Date(pubDateRaw) : null;
    if (title) items.push({ title, link, pubDate: pubDate && !Number.isNaN(pubDate) ? pubDate.toISOString() : null });
  }
  return items;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "whatsapp-monitor-github-actions/1.0"
    }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function checkGoogleNews(serviceKey, config) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(config.query + " when:1d")}&hl=es-419&gl=AR&ceid=AR:es-419`;
  const xml = await fetchText(url);
  const items = parseRssItems(xml);
  const recentWindowMs = 2 * 60 * 60 * 1000;
  const recentMatches = items.filter(item => {
    const title = item.title.toLowerCase();
    const published = item.pubDate ? new Date(item.pubDate).getTime() : 0;
    const isRecent = published && now.getTime() - published <= recentWindowMs;
    const hasKeyword = config.keywords.some(keyword => title.includes(keyword));
    return isRecent && hasKeyword;
  });

  return {
    service: serviceKey,
    source: "Google Noticias RSS",
    checkedAt: nowIso,
    status: recentMatches.length >= 2 ? "outage" : "normal",
    confidence: recentMatches.length >= 2 ? "media" : "baja",
    matches: recentMatches.slice(0, 5),
    url
  };
}

async function checkWhatsAppSite() {
  try {
    await fetch("https://www.whatsapp.com/", {
      method: "HEAD",
      headers: { "user-agent": "whatsapp-monitor-github-actions/1.0" }
    });
    return {
      service: "personal",
      source: "Sitio público de WhatsApp",
      checkedAt: nowIso,
      status: "normal",
      confidence: "baja",
      matches: []
    };
  } catch (error) {
    return {
      service: "personal",
      source: "Sitio público de WhatsApp",
      checkedAt: nowIso,
      status: "outage",
      confidence: "baja",
      matches: [{ title: `No respondió whatsapp.com: ${error.message}` }]
    };
  }
}

function activeIncident(incidents, service) {
  return incidents.find(item => item.status === "caida" && (item.service === service || item.service === "both"));
}

function serviceIsDown(service, signals) {
  const serviceSignals = signals.filter(signal => signal.service === service);
  const strongNewsSignal = serviceSignals.some(signal => signal.source === "Google Noticias RSS" && signal.status === "outage");
  const ownCheckSignal = serviceSignals.some(signal => signal.source === "Sitio público de WhatsApp" && signal.status === "outage");
  return strongNewsSignal || ownCheckSignal;
}

function updateIncidents(previousStatus, incidents, signals) {
  const nextIncidents = [...incidents];

  for (const [service, config] of Object.entries(services)) {
    const isDown = serviceIsDown(service, signals);
    const current = activeIncident(nextIncidents, service);
    const problemSignal = signals.find(signal => signal.service === service && signal.status === "outage");

    if (isDown && !current) {
      nextIncidents.push({
        id: `${service}-${now.getTime()}`,
        service,
        problem: problemSignal?.matches?.[0]?.title || "Posible caída detectada por fuentes gratuitas",
        source: problemSignal?.source || "Chequeo automático",
        status: "caida",
        startedAt: nowIso,
        endedAt: null
      });
    }

    if (!isDown && current) {
      current.status = "restablecido";
      current.endedAt = nowIso;
      current.resolvedSource = "Chequeo automático";
    }
  }

  return nextIncidents;
}

function buildStatus(incidents, signals) {
  const status = {
    updatedAt: nowIso,
    summary: "Chequeo automático ejecutado",
    services: {},
    sources: signals.map(signal => ({
      source: signal.source,
      service: signal.service,
      checkedAt: signal.checkedAt,
      status: signal.status,
      confidence: signal.confidence,
      url: signal.url || null
    })),
    signals
  };

  for (const [service, config] of Object.entries(services)) {
    const current = activeIncident(incidents, service);
    status.services[service] = {
      label: config.label,
      status: current ? "caida" : "normal",
      problem: current?.problem || null,
      startedAt: current?.startedAt || null,
      durationMs: current ? now.getTime() - new Date(current.startedAt).getTime() : null
    };
  }

  return status;
}

async function main() {
  ensureDataDir();
  const previousStatus = readJson(statusPath, {});
  const previousIncidents = readJson(incidentsPath, { incidents: [] }).incidents || [];
  const signals = [];

  for (const [service, config] of Object.entries(services)) {
    try {
      signals.push(await checkGoogleNews(service, config));
    } catch (error) {
      signals.push({
        service,
        source: "Google Noticias RSS",
        checkedAt: nowIso,
        status: "unknown",
        confidence: "baja",
        error: error.message,
        matches: []
      });
    }
  }

  signals.push(await checkWhatsAppSite());

  const incidents = updateIncidents(previousStatus, previousIncidents, signals);
  const status = buildStatus(incidents, signals);

  writeJson(statusPath, status);
  writeJson(incidentsPath, { updatedAt: nowIso, incidents });

  console.log(status.summary);
  console.log(JSON.stringify(status.services, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
