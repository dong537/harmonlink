import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadState, releaseState, saveState } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const runtimeCache = {
  businessTypes: [],
  locations: [],
  locationOptions: [],
  lines: [],
  linesFetchedAt: "",
  instances: [],
  instancesFetchedAt: ""
};

const ISP_TYPES = { 0: "不限", 1: "广播", 2: "原生" };
const DEFAULT_UPSTREAM = {
  baseUrl: "https://api.ipipd.cn",
  mode: "mock",
  appId: "",
  appSecret: "",
  username: "",
  password: ""
};

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || "").split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), actual);
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 1000 * 60 * 60 * 24 * 7 })).toString("base64url");
  const secret = process.env.APP_SECRET || "change-me-in-production";
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const secret = process.env.APP_SECRET || "change-me-in-production";
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  return payload.exp > Date.now() ? payload : null;
}

async function loadDb() {
  const db = await loadState();
  if (db.__storage?.type === "mysql") {
    db.upstreamCache = {
      ...db.upstreamCache,
      ...runtimeCache,
      businessTypes: runtimeCache.businessTypes.length ? runtimeCache.businessTypes : db.upstreamCache.businessTypes,
      locations: runtimeCache.locations.length ? runtimeCache.locations : db.upstreamCache.locations,
      locationOptions: runtimeCache.locationOptions.length ? runtimeCache.locationOptions : db.upstreamCache.locationOptions,
      lines: runtimeCache.lines.length ? runtimeCache.lines : db.upstreamCache.lines,
      instances: runtimeCache.instances.length ? runtimeCache.instances : db.upstreamCache.instances
    };
  }
  return db;
}

async function saveDb(db) {
  if (db?.upstreamCache) {
    runtimeCache.businessTypes = db.upstreamCache.businessTypes || [];
    runtimeCache.locations = db.upstreamCache.locations || [];
    runtimeCache.locationOptions = db.upstreamCache.locationOptions || [];
    runtimeCache.lines = db.upstreamCache.lines || [];
    runtimeCache.linesFetchedAt = db.upstreamCache.linesFetchedAt || "";
    runtimeCache.instances = db.upstreamCache.instances || [];
    runtimeCache.instancesFetchedAt = db.upstreamCache.instancesFetchedAt || "";
  }
  return saveState(db);
}

async function releaseDb(db) {
  return releaseState(db);
}

function isMySqlState(db) {
  return db?.__storage?.type === "mysql";
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  let db;
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error("请求体不是有效 JSON");
    err.status = 400;
    throw err;
  }
}

function send(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders()
  });
  res.end(JSON.stringify(data));
}

function corsHeaders() {
  return {
    "access-control-allow-origin": process.env.CORS_ORIGIN || "*",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    "access-control-max-age": "86400"
  };
}

function sendOptions(res) {
  res.writeHead(204, corsHeaders());
  res.end();
}

function ok(res, data = null) {
  send(res, 200, { success: true, data });
}

function fail(res, status, message) {
  send(res, status, { success: false, message });
}

function publicUser(user) {
  const { passwordHash, ...safe } = user;
  return safe;
}

function getAuth(req, db) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const payload = readToken(token);
  if (!payload) return null;
  const user = db.users.find((item) => item.id === payload.sub && item.status !== "disabled");
  return user || null;
}

function requireUser(req, db) {
  const user = getAuth(req, db);
  if (!user) {
    const err = new Error("请先登录");
    err.status = 401;
    throw err;
  }
  return user;
}

function requireAdmin(req, db) {
  const user = requireUser(req, db);
  if (user.role !== "admin") {
    const err = new Error("需要管理员权限");
    err.status = 403;
    throw err;
  }
  return user;
}

function routeKey(method, pathname) {
  return `${method.toUpperCase()} ${pathname}`;
}

function skuKey(input) {
  return [
    input.businessType || "WEB",
    input.countryCode || "*",
    input.cityCode || "*",
    String(input.ispType ?? "*"),
    input.tag || "STANDARD"
  ].join("|");
}

function cleanObject(input, allowedKeys) {
  const output = {};
  for (const key of allowedKeys) {
    const value = input[key];
    if (value === undefined || value === null || value === "") continue;
    output[key] = value;
  }
  return output;
}

function buildLineSearchPayload(input) {
  const payload = cleanObject(input, ["countryCode", "cityCode", "businessType", "tag", "ispType", "lineId", "current", "size"]);
  payload.current = Number(payload.current ?? 0);
  payload.size = Number(payload.size ?? 50);
  if (payload.ispType !== undefined) payload.ispType = Number(payload.ispType);
  return payload;
}

async function fetchAllUpstreamLines(db, input = {}, options = {}) {
  const pageSize = Number(options.pageSize || input.size || 200);
  const maxPages = Number(options.maxPages || 100);
  const firstPayload = buildLineSearchPayload({ ...input, current: 0, size: pageSize });
  const first = await upstreamRequest(db, "POST", "/openapi/v2/static/lines", firstPayload);
  const firstData = first.data || {};
  const records = [...(firstData.records || [])];
  const total = Number(firstData.total || records.length || 0);

  let current = Number(firstData.current ?? 0);
  let pagesFetched = 1;
  while (records.length < total && pagesFetched < maxPages) {
    current += 1;
    const payload = buildLineSearchPayload({ ...input, current, size: pageSize });
    const page = await upstreamRequest(db, "POST", "/openapi/v2/static/lines", payload);
    const pageRecords = page.data?.records || [];
    if (!pageRecords.length) break;
    records.push(...pageRecords);
    pagesFetched += 1;
  }

  return {
    ...firstData,
    current: 0,
    size: pageSize,
    total: Math.max(total, records.length),
    records
  };
}

async function fetchAllUpstreamInstances(db, input = {}, options = {}) {
  const pageSize = Number(options.pageSize || input.size || 200);
  const maxPages = Number(options.maxPages || 100);
  const firstPayload = buildInstanceSearchPayload({ ...input, current: 0, size: pageSize });
  const first = await upstreamRequest(db, "POST", "/openapi/v2/static/instances", firstPayload);
  const firstData = first.data || {};
  const records = [...(firstData.records || [])];
  const total = Number(firstData.total || records.length || 0);

  let current = Number(firstData.current ?? 0);
  let pagesFetched = 1;
  while (records.length < total && pagesFetched < maxPages) {
    current += 1;
    const payload = buildInstanceSearchPayload({ ...input, current, size: pageSize });
    const page = await upstreamRequest(db, "POST", "/openapi/v2/static/instances", payload);
    const pageRecords = page.data?.records || [];
    if (!pageRecords.length) break;
    records.push(...pageRecords);
    pagesFetched += 1;
  }

  return {
    ...firstData,
    current: 0,
    size: pageSize,
    total: Math.max(total, records.length),
    records
  };
}

function buildCreateOrderPayload(input, localOrderNo, currency) {
  const quantity = Number(input.quantity || 1);
  const days = Number(input.days || 1);
  const payload = {
    quantity,
    days,
    currency,
    orderNo: localOrderNo,
    sync: input.sync !== undefined ? Boolean(input.sync) : true
  };
  if (input.lineId) {
    payload.lineId = input.lineId;
  } else {
    Object.assign(payload, cleanObject(input, ["countryCode", "cityCode", "businessType", "tag"]));
    if (input.ispType !== undefined && input.ispType !== "") payload.ispType = Number(input.ispType);
  }
  if (input.discountPackageId) payload.discountPackageId = input.discountPackageId;
  return payload;
}

function buildInstanceSearchPayload(input) {
  const payload = cleanObject(input, ["status", "proxyIds", "countryCode", "cityCode", "ispType", "orderNo", "ip", "expiringSoon", "current", "size"]);
  payload.current = Number(payload.current ?? 0);
  payload.size = Number(payload.size ?? 50);
  if (payload.status !== undefined) payload.status = Number(payload.status);
  if (payload.ispType !== undefined) payload.ispType = Number(payload.ispType);
  return payload;
}

function priceForUser(db, user, key) {
  const base = db.prices.find((item) => item.skuKey === key && item.active);
  if (!base) return null;
  const override = user.priceOverrides?.[key];
  return { ...base, effectiveUnitPrice: Number(override ?? base.unitPrice) };
}

function orderStatusFromUpstream(status) {
  return {
    0: "pending_payment",
    1: "paid",
    2: "processing",
    3: "completed",
    4: "failed",
    5: "cancelled",
    6: "refunded"
  }[Number(status)] || "processing";
}

function instanceStatusFromUpstream(status) {
  return {
    0: "creating",
    1: "activating",
    2: "active",
    3: "expired",
    4: "disabled"
  }[Number(status)] || "unknown";
}

function mergeInstances(db, order, upstreamInstances = []) {
  for (const item of upstreamInstances || []) {
    if (!item?.proxyId) continue;
    let instance = db.instances.find((record) => record.proxyId === item.proxyId);
    if (!instance) {
      instance = {
        id: id("ins"),
        proxyId: item.proxyId,
        userId: order.userId,
        username: order.username,
        orderId: order.id,
        skuKey: order.skuKey,
        skuName: order.skuName,
        createdAt: now()
      };
      db.instances.push(instance);
    }
    Object.assign(instance, {
      ip: item.ip || instance.ip || "",
      port: item.port ?? instance.port ?? "",
      proxyUsername: item.username || instance.proxyUsername || "",
      proxyPassword: item.password || instance.proxyPassword || "",
      status: instanceStatusFromUpstream(item.status),
      rawStatus: item.status,
      cityCode: item.cityCode || instance.cityCode || order.request?.cityCode || "",
      countryCode: item.countryCode || instance.countryCode || order.request?.countryCode || "",
      ispType: item.ispType ?? instance.ispType ?? order.request?.ispType,
      autoRenew: item.autoRenew ?? instance.autoRenew ?? false,
      activatedAt: item.activatedAt || instance.activatedAt || "",
      expiresAt: item.expiresAt || instance.expiresAt || "",
      updatedAt: now(),
      upstream: item
    });
  }
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items || []) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function importedOrderId(orderNo) {
  return `imp_${String(orderNo).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function resolveImportedOrderKey(item) {
  return item.orderNo || item.externalOrderNo || item.upstreamOrderNo || item.proxyId || id("imp");
}

function deriveCountryCodeFromCity(cityCode = "") {
  const code = String(cityCode || "");
  return code.length >= 3 ? code.slice(0, 3) : "";
}

function buildImportedOrderSummary(group) {
  const first = group[0] || {};
  const businessType = first.businessType || first.businessTypeCode || "";
  const cityCode = first.cityCode || "";
  const countryCode = first.countryCode || deriveCountryCodeFromCity(cityCode);
  const ispType = Number(first.ispType ?? 2);
  const tag = first.tag || first.lineTag || "";
  const key = skuKey({ businessType, countryCode, cityCode, ispType, tag });
  return {
    skuKey: key,
    skuName: `${businessType || "上游已购"} ${countryCode || ""} ${cityCode || ""}`.trim(),
    quantity: group.length,
    days: 30,
    unitPrice: 0,
    totalPrice: 0,
    currency: first.currency || "CNY",
    selectedLine: null
  };
}

function syncImportedInstancesIntoDb(db, ownerUser, upstreamRecords = []) {
  const groups = groupBy(upstreamRecords, (item) => resolveImportedOrderKey(item));
  let createdOrders = 0;
  let createdInstances = 0;

  for (const [orderKey, group] of groups.entries()) {
    const orderId = importedOrderId(orderKey);
    let order = db.orders.find((item) => item.id === orderId);
    const summary = buildImportedOrderSummary(group);
    if (!order) {
      order = {
        id: orderId,
        userId: ownerUser.id,
        username: ownerUser.username,
        skuKey: summary.skuKey,
        skuName: summary.skuName,
        request: {},
        quantity: summary.quantity,
        days: summary.days,
        unitPrice: summary.unitPrice,
        totalPrice: summary.totalPrice,
        currency: summary.currency,
        status: "completed",
        type: "imported",
        importedFromUpstream: true,
        createdAt: now(),
        upstream: { orderNo: orderKey, importedAt: now(), records: group.length }
      };
      db.orders.push(order);
      createdOrders += 1;
    } else {
      Object.assign(order, {
        quantity: summary.quantity,
        currency: summary.currency,
        skuKey: summary.skuKey,
        skuName: summary.skuName,
        status: "completed",
        importedFromUpstream: true,
        upstream: { ...(order.upstream || {}), orderNo: orderKey, importedAt: now(), records: group.length }
      });
    }

    const beforeCount = db.instances.length;
    mergeInstances(db, order, group.map((item) => ({
      ...item,
      countryCode: item.countryCode || deriveCountryCodeFromCity(item.cityCode),
      status: item.status ?? 2
    })));
    createdInstances += Math.max(0, db.instances.length - beforeCount);
  }

  return {
    totalRecords: upstreamRecords.length,
    totalOrders: groups.size,
    createdOrders,
    createdInstances,
    instanceCount: db.instances.length
  };
}

async function ensureUpstreamLineCatalog(db) {
  if (!db.upstreamCache.lines?.length || db.upstreamCache.lines.length < 500) {
    const allLines = await fetchAllUpstreamLines(db, {}, { pageSize: 200, maxPages: 200 });
    db.upstreamCache.lines = (allLines.records || []).map(normalizeLineRecord);
    db.upstreamCache.linesFetchedAt = now();
  }
  return db.upstreamCache.lines || [];
}

function isStale(timestamp, maxAgeMs) {
  if (!timestamp) return true;
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) || (Date.now() - value > maxAgeMs);
}

async function ensureFreshLineCache(db, options = {}) {
  const maxAgeMs = Number(options.maxAgeMs || 1000 * 60 * 10);
  const forceRefresh = Boolean(options.forceRefresh);
  if (forceRefresh || !db.upstreamCache.lines?.length || isStale(db.upstreamCache.linesFetchedAt, maxAgeMs)) {
    const allLines = await fetchAllUpstreamLines(db, {}, { pageSize: 200, maxPages: 200 });
    db.upstreamCache.lines = (allLines.records || []).map(normalizeLineRecord);
    db.upstreamCache.linesFetchedAt = now();
  }
  return db.upstreamCache.lines || [];
}

function filterCachedLines(lines, input = {}) {
  const keyword = String(input.keyword || input.locationKeyword || "").trim().toLowerCase();
  return (lines || []).filter((line) => {
    if (input.lineId && String(line.lineId) !== String(input.lineId)) return false;
    if (input.businessType && line.businessType !== input.businessType && line.businessTypeCode !== input.businessType) return false;
    if (input.countryCode && line.countryCode !== input.countryCode) return false;
    if (input.cityCode && line.cityCode !== input.cityCode) return false;
    if (input.ispType !== undefined && input.ispType !== "" && Number(line.ispType) !== Number(input.ispType)) return false;
    if (input.tag && String(line.tag || "").toLowerCase() !== String(input.tag).toLowerCase()) return false;
    if (!keyword) return true;
    const text = `${line.businessType} ${line.countryCode} ${line.cityCode} ${line.lineId}`.toLowerCase();
    return text.includes(keyword);
  });
}

function lineDisplayName(line) {
  return `${line.businessType || "线路"} ${line.countryCode || ""} ${line.cityCode || ""} ${ISP_TYPES[line.ispType] || line.ispType || ""}`.trim();
}

async function enrichImportedInventory(db) {
  const lines = await ensureUpstreamLineCatalog(db);
  const byLineId = new Map(lines.map((line) => [String(line.lineId), line]));
  const orderById = new Map(db.orders.map((order) => [order.id, order]));

  for (const instance of db.instances) {
    if (!instance.upstream?.lineId) continue;
    const line = byLineId.get(String(instance.upstream.lineId));
    if (!line) continue;
    const key = lineSkuKey(line);
    Object.assign(instance, {
      lineId: line.lineId,
      businessType: line.businessType || instance.businessType || "",
      skuKey: key,
      skuName: lineDisplayName(line),
      countryCode: line.countryCode || instance.countryCode || "",
      cityCode: line.cityCode || instance.cityCode || "",
      ispType: line.ispType ?? instance.ispType,
      tag: line.tag || instance.tag || "",
      lineMeta: line,
      updatedAt: now()
    });
    const order = orderById.get(instance.orderId);
    if (order && order.importedFromUpstream) {
      Object.assign(order, {
        skuKey: key,
        skuName: lineDisplayName(line),
        selectedLine: line,
        updatedAt: now()
      });
    }
  }
}

function sellableInventory(db) {
  return db.instances.filter((item) => item.userId === "usr_admin" && item.status === "active");
}

function inventoryTemplates(db, user) {
  const groups = groupBy(sellableInventory(db), (item) => item.skuKey || lineSkuKey(item.lineMeta || item));
  const result = [];
  for (const [key, items] of groups.entries()) {
    const first = items[0];
    const base = db.prices.find((price) => price.skuKey === key && price.active);
    const override = user?.priceOverrides?.[key];
    const effectiveUnitPrice = Number(override ?? base?.unitPrice ?? base?.upstreamUnitPrice ?? first.lineMeta?.price ?? 0);
    result.push({
      skuKey: key,
      name: base?.name || first.skuName || lineDisplayName(first.lineMeta || first),
      businessType: first.businessType || first.lineMeta?.businessType || "",
      countryCode: first.countryCode || "",
      cityCode: first.cityCode || "",
      ispType: Number(first.ispType ?? first.lineMeta?.ispType ?? 2),
      tag: first.tag || first.lineMeta?.tag || "",
      unitPrice: Number(base?.unitPrice ?? first.lineMeta?.price ?? effectiveUnitPrice),
      effectiveUnitPrice,
      upstreamUnitPrice: Number(base?.upstreamUnitPrice ?? first.lineMeta?.price ?? 0),
      currency: base?.currency || first.lineMeta?.currency || "CNY",
      active: true,
      availableCount: items.length,
      lineId: first.lineId || first.upstream?.lineId || "",
      source: "inventory"
    });
  }
  return result.sort((a, b) => a.effectiveUnitPrice - b.effectiveUnitPrice || b.availableCount - a.availableCount);
}

function inventorySearch(db, user, filters = {}) {
  const normalizedKeyword = String(filters.keyword || "").trim().toLowerCase();
  return inventoryTemplates(db, user).filter((item) => {
    if (filters.businessType && item.businessType !== filters.businessType) return false;
    if (filters.countryCode && item.countryCode !== filters.countryCode) return false;
    if (filters.cityCode && item.cityCode !== filters.cityCode) return false;
    if (filters.ispType !== undefined && filters.ispType !== "" && Number(item.ispType) !== Number(filters.ispType)) return false;
    if (!normalizedKeyword) return true;
    const text = `${item.name} ${item.businessType} ${item.countryCode} ${item.cityCode}`.toLowerCase();
    return text.includes(normalizedKeyword);
  });
}

function inventoryCountBySku(db) {
  const map = new Map();
  for (const item of sellableInventory(db)) {
    const key = item.skuKey || lineSkuKey(item.lineMeta || item);
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

function decorateLinesForUser(db, user, lines) {
  const counts = inventoryCountBySku(db);
  return (lines || []).map((item) => {
    const line = normalizeLineRecord(item);
    const key = lineSkuKey(line);
    const price = priceForUser(db, user, key);
    const inventoryAvailableCount = counts.get(key) || 0;
    return {
      ...line,
      skuKey: key,
      skuName: price?.name || "",
      effectiveUnitPrice: price?.effectiveUnitPrice ?? null,
      currency: price?.currency || line.currency || "CNY",
      availableForOrder: Boolean(price),
      inventoryAvailableCount,
      fulfillmentMode: inventoryAvailableCount > 0 ? "inventory" : "upstream"
    };
  });
}

function assignInventoryInstances(db, user, order, context) {
  const quantity = Number(context.quantity || 1);
  const candidates = sellableInventory(db)
    .filter((item) => item.lineId === context.line?.lineId || item.skuKey === context.key)
    .sort((a, b) => new Date(a.expiresAt || 0).getTime() - new Date(b.expiresAt || 0).getTime());
  if (candidates.length < quantity) {
    const err = new Error(`当前库存不足，剩余 ${candidates.length} 个`);
    err.status = 400;
    throw err;
  }
  const selected = candidates.slice(0, quantity);
  for (const instance of selected) {
    Object.assign(instance, {
      userId: user.id,
      username: user.username,
      orderId: order.id,
      skuKey: context.key,
      skuName: context.price.name,
      updatedAt: now()
    });
  }
  return selected;
}

function rebuildPricesFromInventory(db) {
  const templates = inventoryTemplates(db, null);
  const activeKeys = new Set(templates.map((item) => item.skuKey));
  for (const price of db.prices) {
    if (!activeKeys.has(price.skuKey)) price.active = false;
  }
  for (const template of templates) {
    let price = db.prices.find((item) => item.skuKey === template.skuKey);
    if (!price) {
      price = {
        skuKey: template.skuKey,
        createdAt: now()
      };
      db.prices.push(price);
    }
    Object.assign(price, {
      businessType: template.businessType,
      countryCode: template.countryCode,
      cityCode: template.cityCode,
      ispType: template.ispType,
      tag: template.tag || "",
      name: template.name,
      upstreamUnitPrice: template.upstreamUnitPrice,
      unitPrice: Number(price.unitPrice ?? template.effectiveUnitPrice ?? template.upstreamUnitPrice ?? 0),
      currency: template.currency || "CNY",
      active: true,
      updatedAt: now()
    });
  }
  return templates;
}

function normalizeLineRecord(line) {
  return {
    lineId: line.lineId || line.id || "",
    businessType: line.businessType || line.businessTypeCode || "",
    businessTypeCode: line.businessTypeCode || line.businessType || "",
    countryCode: line.countryCode || "",
    cityCode: line.cityCode || "",
    ispType: line.ispType ?? "",
    tag: line.tag || "",
    availableCount: line.availableCount ?? line.quantity ?? 0,
    price: Number(line.price ?? 0),
    currency: line.currency || "CNY",
    active: line.active ?? true,
    status: line.status,
    upstream: line
  };
}

const LOCATION_ALIAS_BY_CODE = {
  USA: ["美国", "美区", "美国ip"],
  JPN: ["日本", "日区", "日本ip"],
  SGP: ["新加坡", "新加坡ip"],
  HKG: ["香港", "香港ip"],
  KOR: ["韩国", "韩区", "韩国ip"],
  DEU: ["德国"],
  FRA: ["法国"],
  GBR: ["英国"],
  CAN: ["加拿大"],
  AUS: ["澳大利亚", "澳洲"],
  TWN: ["台湾"],
  MYS: ["马来西亚"],
  THA: ["泰国"],
  IDN: ["印度尼西亚", "印尼"],
  VNM: ["越南"],
  PHL: ["菲律宾"],
  NLD: ["荷兰"],
  ITA: ["意大利"],
  ESP: ["西班牙"]
};

const LOCATION_ALIAS_BY_NAME = {
  tokyo: ["东京"],
  osaka: ["大阪"],
  sapporo: ["札幌"],
  yokohama: ["横滨"],
  kyoto: ["京都"],
  seoul: ["首尔"],
  busan: ["釜山"],
  singapore: ["新加坡"],
  hongkong: ["香港"],
  taipei: ["台北"],
  taichung: ["台中"],
  kaohsiung: ["高雄"],
  losangeles: ["洛杉矶", "洛城"],
  newyork: ["纽约"],
  chicago: ["芝加哥"],
  seattle: ["西雅图"],
  houston: ["休斯敦"],
  dallas: ["达拉斯"],
  miami: ["迈阿密"],
  sanfrancisco: ["旧金山", "三藩市"],
  sanjose: ["圣何塞"],
  boston: ["波士顿"],
  lasvegas: ["拉斯维加斯"],
  atlanta: ["亚特兰大"],
  london: ["伦敦"],
  paris: ["巴黎"],
  berlin: ["柏林"],
  frankfurt: ["法兰克福"],
  amsterdam: ["阿姆斯特丹"],
  toronto: ["多伦多"],
  vancouver: ["温哥华"],
  sydney: ["悉尼"],
  melbourne: ["墨尔本"],
  dubai: ["迪拜"],
  bangkok: ["曼谷"],
  jakarta: ["雅加达"],
  manila: ["马尼拉"],
  kualalumpur: ["吉隆坡"],
  hochiminh: ["胡志明"],
  hanoi: ["河内"]
};

function flattenLocations(items, result = []) {
  for (const item of items || []) {
    if (!item || typeof item !== "object") continue;
    result.push({
      code: item.code || "",
      name: item.name || "",
      nameEn: item.nameEn || "",
      type: String(item.type || "").toLowerCase(),
      parentCode: item.parentCode || "",
      active: item.active !== false,
      availableCount: Number(item.availableCount || 0)
    });
    if (Array.isArray(item.children) && item.children.length) flattenLocations(item.children, result);
  }
  return result;
}

function locationAliases(item) {
  const aliases = [...(LOCATION_ALIAS_BY_CODE[item.code] || [])];
  const normalizedName = `${item.name} ${item.nameEn}`.toLowerCase().replace(/[^a-z]/g, "");
  for (const [key, values] of Object.entries(LOCATION_ALIAS_BY_NAME)) {
    if (normalizedName.includes(key)) aliases.push(...values);
  }
  return [...new Set(aliases)];
}

function normalizeLocationOptions(items) {
  const flattened = flattenLocations(items).filter((item) => item.active && ["country", "city"].includes(item.type));
  const byCode = new Map(flattened.map((item) => [item.code, item]));
  const findCountryCode = (item) => {
    if (!item) return "";
    if (item.type === "country") return item.code;
    let cursor = item;
    let safety = 0;
    while (cursor?.parentCode && safety < 8) {
      const parent = byCode.get(cursor.parentCode);
      if (!parent) break;
      if (parent.type === "country") return parent.code;
      cursor = parent;
      safety += 1;
    }
    return item.code.length === 3 ? item.code : "";
  };
  const displayName = (item) => {
    if (item.name && /[\u4e00-\u9fff]/.test(item.name)) return item.name;
    const aliases = locationAliases(item);
    const zhAlias = aliases.find((value) => /[\u4e00-\u9fff]/.test(value));
    return zhAlias || item.nameEn || item.name || item.code;
  };
  return flattened.map((item) => {
    const countryCode = findCountryCode(item);
    const aliases = locationAliases(item);
    const label = displayName(item);
    return {
      code: item.code,
      countryCode,
      name: item.name,
      nameEn: item.nameEn,
      label,
      type: item.type,
      parentCode: item.parentCode,
      aliases,
      searchText: [item.code, item.name, item.nameEn, ...aliases].join(" ").toLowerCase(),
      availableCount: item.availableCount
    };
  });
}

function lineSkuKey(line) {
  return skuKey({
    businessType: line.businessType || line.businessTypeCode || "",
    countryCode: line.countryCode || "",
    cityCode: line.cityCode || "",
    ispType: line.ispType,
    tag: line.tag || ""
  });
}

async function resolveLine(db, lineId) {
  if (!lineId) return null;
  let line = (await ensureFreshLineCache(db)).find((item) => item.lineId === lineId);
  if (line) return line;
  const data = await upstreamRequest(db, "POST", "/openapi/v2/static/lines", buildLineSearchPayload({ lineId, current: 0, size: 1 }));
  const normalized = (data.data?.records || []).map(normalizeLineRecord);
  if (normalized[0]) {
    db.upstreamCache.lines = [...normalized, ...(db.upstreamCache.lines || []).filter((item) => item.lineId !== normalized[0].lineId)];
    db.upstreamCache.linesFetchedAt = now();
    return normalized[0];
  }
  return null;
}

async function resolveOrderContext(db, user, body) {
  const quantity = Number(body.quantity || 1);
  const days = Number(body.days || 1);
  const inventory = inventoryTemplates(db, user);
  const inventoryTemplate = inventory.find((item) => (body.lineId && item.lineId === body.lineId) || (body.skuKey && item.skuKey === body.skuKey));
  if (inventoryTemplate && quantity <= inventoryTemplate.availableCount) {
    if (quantity > inventoryTemplate.availableCount) {
      throw Object.assign(new Error(`当前库存只剩 ${inventoryTemplate.availableCount} 个，请减少数量后再试`), { status: 400 });
    }
    return {
      quantity,
      days,
      line: {
        lineId: inventoryTemplate.lineId,
        businessType: inventoryTemplate.businessType,
        countryCode: inventoryTemplate.countryCode,
        cityCode: inventoryTemplate.cityCode,
        ispType: inventoryTemplate.ispType,
        tag: inventoryTemplate.tag || ""
      },
      key: inventoryTemplate.skuKey,
      price: inventoryTemplate,
      source: {
        lineId: inventoryTemplate.lineId,
        businessType: inventoryTemplate.businessType,
        countryCode: inventoryTemplate.countryCode,
        cityCode: inventoryTemplate.cityCode,
        ispType: inventoryTemplate.ispType,
        tag: inventoryTemplate.tag || ""
      },
      request: {},
      sourceType: "inventory"
    };
  }
  let source = { ...body };
  let line = null;
  if (body.lineId) {
    line = await resolveLine(db, String(body.lineId));
    if (!line) throw Object.assign(new Error("未找到该线路，请重新查询后再下单"), { status: 400 });
    source = {
      ...source,
      lineId: line.lineId,
      businessType: line.businessType || source.businessType,
      countryCode: line.countryCode || source.countryCode,
      cityCode: line.cityCode || source.cityCode,
      ispType: line.ispType ?? source.ispType,
      tag: line.tag || source.tag || ""
    };
  }
  const key = skuKey(source);
  const price = priceForUser(db, user, key);
  if (!price) {
    const err = new Error("该线路已查询到，但本平台尚未配置售价，请先在后台同步线路并设置价格");
    err.status = 400;
    throw err;
  }
  return {
    quantity,
    days,
    line,
    key,
    price,
    source,
    request: buildCreateOrderPayload({ ...source, quantity, days }, id("tmp"), price.currency),
    sourceType: "upstream"
  };
}

function addCreditRecord(db, user, amount, operator, input = {}) {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount === 0) {
    const err = new Error("额度变动金额不能为 0");
    err.status = 400;
    throw err;
  }
  const beforeBalance = Number(user.balance || 0);
  const afterBalance = Number((beforeBalance + numericAmount).toFixed(2));
  if (afterBalance < 0) {
    const err = new Error("扣减后用户余额不能小于 0");
    err.status = 400;
    throw err;
  }
  user.balance = afterBalance;
  const record = {
    id: id("crd"),
    userId: user.id,
    username: user.username,
    amount: numericAmount,
    beforeBalance,
    afterBalance,
    type: numericAmount > 0 ? "allocate" : "deduct",
    source: input.source || "offline_payment",
    paymentMethod: input.paymentMethod || "",
    paymentReference: input.paymentReference || "",
    remark: input.remark || "",
    operatorId: operator?.id || "",
    operatorName: operator?.username || "system",
    createdAt: now()
  };
  db.creditRecords.push(record);
  return record;
}

function createReceiptRecord(db, user, amount, operator, input = {}) {
  const numericAmount = Number(amount || 0);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    const err = new Error("收款金额必须大于 0");
    err.status = 400;
    throw err;
  }
  db.receiptRecords ||= [];
  const receipt = {
    id: id("rcp"),
    userId: user.id,
    username: user.username,
    amount: numericAmount,
    paymentMethod: input.paymentMethod || "",
    paymentReference: input.paymentReference || "",
    remark: input.remark || "",
    status: "pending",
    createdById: operator?.id || "",
    createdByName: operator?.username || "system",
    reviewedById: "",
    reviewedByName: "",
    reviewNote: "",
    creditRecordId: "",
    createdAt: now(),
    reviewedAt: ""
  };
  db.receiptRecords.push(receipt);
  return receipt;
}

function signUpstream(method, uri, body, config) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID();
  const bodyText = body ? JSON.stringify(body) : "";
  const signText = `${method.toUpperCase()}${uri}${timestamp}${nonce}${bodyText}`;
  const signature = crypto.createHmac("sha256", config.appSecret).update(signText).digest("hex");
  return { timestamp, nonce, signature, bodyText };
}

async function upstreamRequest(db, method, uri, body = null) {
  const config = { ...DEFAULT_UPSTREAM, ...db.upstream };
  if (config.mode !== "live") {
    return mockUpstream(method, uri, body);
  }
  if (!config.appId || !config.appSecret) {
    const err = new Error("IPIPD live 模式缺少 AppId 或 AppSecret，请先在上游凭据中配置开放平台 API 凭据");
    err.status = 400;
    throw err;
  }
  const { timestamp, nonce, signature, bodyText } = signUpstream(method, uri, body, config);
  const response = await fetch(`${config.baseUrl}${uri}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-API-AppId": config.appId,
      "X-API-Timestamp": timestamp,
      "X-API-Nonce": nonce,
      "X-API-Signature": signature
    },
    body: body ? bodyText : undefined
  });
  const responseText = await response.text();
  let data = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {};
  }
  if (!response.ok || data.success === false) {
    const err = new Error(data.message || data.code || responseText || `上游请求失败: HTTP ${response.status}`);
    err.status = 502;
    err.upstream = { status: response.status, code: data.code, message: data.message, traceId: data.traceId };
    throw err;
  }
  return data;
}

function mockUpstream(method, uri, body) {
  if (uri.includes("/business-types")) {
    return { success: true, data: [{ code: "WEB", name: "网页业务" }, { code: "GAME", name: "游戏业务" }] };
  }
  if (uri.includes("/locations")) {
    return {
      success: true,
      data: [
        { code: "USA", name: "美国", nameEn: "United States", type: "COUNTRY", active: true, availableCount: 320 },
        { code: "HKG", name: "香港", nameEn: "Hong Kong", type: "COUNTRY", active: true, availableCount: 88 },
        { code: "JPN", name: "日本", nameEn: "Japan", type: "COUNTRY", active: true, availableCount: 120 }
      ]
    };
  }
  if (uri.includes("/lines")) {
    return {
      success: true,
      data: {
        records: [
          { lineId: "LINE_USA_1", countryCode: "USA", cityCode: "", ispType: 1, tag: "STANDARD", availableCount: 200 },
          { lineId: "LINE_USA_2", countryCode: "USA", cityCode: "", ispType: 2, tag: "PREMIUM", availableCount: 80 },
          { lineId: "LINE_HKG_1", countryCode: "HKG", cityCode: "", ispType: 1, tag: "STANDARD", availableCount: 60 }
        ],
        total: 3,
        current: 0,
        size: 20
      }
    };
  }
  if (uri.includes("/orders/create")) {
    const orderNo = `MOCK${Date.now()}`;
    return {
      success: true,
      data: {
        orderNo,
        externalOrderNo: body.orderNo,
        status: 3,
        quantity: body.quantity,
        days: body.days,
        totalPrice: 0,
        currency: body.currency || "CNY",
        instances: Array.from({ length: body.quantity }, (_, index) => ({
          proxyId: `SI${Date.now()}${index}`,
          ip: `192.0.2.${10 + index}`,
          port: 9000 + index,
          username: crypto.randomBytes(6).toString("hex"),
          password: crypto.randomBytes(8).toString("hex"),
          status: 2,
          expiresAt: new Date(Date.now() + body.days * 86400000).toISOString()
        }))
      }
    };
  }
  if (uri.includes("/instances/change-ip")) {
    return {
      success: true,
      data: {
        successCount: body.proxyIds?.length || 0,
        failureCount: 0,
        totalCount: body.proxyIds?.length || 0,
        successList: (body.proxyIds || []).map((proxyId, index) => ({ proxyId, ip: `198.51.100.${20 + index}`, port: 9100 + index })),
        failedList: [],
        remark: body.remark || ""
      }
    };
  }
  if (uri.includes("/instances/renew")) {
    return {
      success: true,
      data: {
        orderNo: `RN${Date.now()}`,
        externalOrderNo: body.orderNo,
        successCount: body.proxyIds?.length || 0,
        failureCount: 0,
        totalCost: 0,
        currency: body.currency || "CNY",
        renewalDays: body.days,
        successList: (body.proxyIds || []).map((proxyId) => ({ proxyId, status: 2 })),
        failedList: []
      }
    };
  }
  if (uri.includes("/instances/update-credentials")) {
    return {
      success: true,
      data: {
        successCount: body.proxyIds?.length || 0,
        failureCount: 0,
        totalCount: body.proxyIds?.length || 0,
        successList: (body.proxyIds || []).map((proxyId) => ({
          proxyId,
          username: body.random ? crypto.randomBytes(6).toString("hex") : body.username,
          password: body.random ? crypto.randomBytes(8).toString("hex") : body.password
        })),
        failedList: [],
        remark: body.remark || ""
      }
    };
  }
  if (uri.includes("/instances")) {
    return {
      success: true,
      data: { records: [], total: 0, current: body?.current || 0, size: body?.size || 20 }
    };
  }
  if (uri.includes("/account")) {
    return { success: true, data: { username: "mock-upstream", balance: 9999, currency: "CNY", status: "MOCK" } };
  }
  return { success: true, data: {} };
}

const handlers = {
  "GET /api/health": async (req, res, db) => {
    ok(res, {
      ok: true,
      time: now(),
      users: db.users.length,
      orders: db.orders.length,
      instances: db.instances.length,
      upstreamMode: db.upstream?.mode || "mock"
    });
  },
  "POST /api/auth/register": async (req, res, db) => {
    const body = await parseBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (username.length < 3 || password.length < 6) throw Object.assign(new Error("用户名至少 3 位，密码至少 6 位"), { status: 400 });
    if (db.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) {
      throw Object.assign(new Error("用户名已存在"), { status: 409 });
    }
    const user = {
      id: id("usr"),
      username,
      passwordHash: hashPassword(password),
      role: "user",
      status: "active",
      balance: 0,
      createdAt: now(),
      priceOverrides: {}
    };
    db.users.push(user);
    await saveDb(db);
    ok(res, { token: signToken({ sub: user.id, role: user.role }), user: publicUser(user) });
  },
  "POST /api/auth/login": async (req, res, db) => {
    const body = await parseBody(req);
    const user = db.users.find((item) => item.username.toLowerCase() === String(body.username || "").toLowerCase());
    if (!user || user.status === "disabled" || !verifyPassword(String(body.password || ""), user.passwordHash)) {
      throw Object.assign(new Error("账号或密码错误"), { status: 401 });
    }
    user.lastLoginAt = now();
    await saveDb(db);
    ok(res, { token: signToken({ sub: user.id, role: user.role }), user: publicUser(user) });
  },
  "GET /api/me": async (req, res, db) => ok(res, publicUser(requireUser(req, db))),
  "GET /api/catalog/prices": async (req, res, db) => {
    const user = requireUser(req, db);
    const counts = inventoryCountBySku(db);
    ok(res, db.prices.filter((item) => item.active).map((item) => ({
      ...item,
      effectiveUnitPrice: priceForUser(db, user, item.skuKey)?.effectiveUnitPrice,
      inventoryAvailableCount: counts.get(item.skuKey) || 0
    })));
  },
  "GET /api/catalog/business-types": async (req, res, db) => {
    requireUser(req, db);
    const data = await upstreamRequest(db, "GET", "/openapi/v2/static/business-types");
    db.upstreamCache.businessTypes = data.data || [];
    if (!isMySqlState(db)) await saveDb(db);
    ok(res, data.data || []);
  },
  "GET /api/catalog/locations": async (req, res, db) => {
    requireUser(req, db);
    const data = await upstreamRequest(db, "GET", "/openapi/v2/static/lines/locations/available");
    db.upstreamCache.locations = data.data || [];
    db.upstreamCache.locationOptions = normalizeLocationOptions(data.data || []);
    if (!isMySqlState(db)) await saveDb(db);
    ok(res, data.data || []);
  },
  "GET /api/catalog/location-options": async (req, res, db) => {
    requireUser(req, db);
    if (!db.upstreamCache.locationOptions?.length) {
      const data = await upstreamRequest(db, "GET", "/openapi/v2/static/lines/locations/available");
      db.upstreamCache.locations = data.data || [];
      db.upstreamCache.locationOptions = normalizeLocationOptions(data.data || []);
      if (!isMySqlState(db)) await saveDb(db);
    }
    ok(res, db.upstreamCache.locationOptions);
  },
  "POST /api/catalog/lines": async (req, res, db) => {
    const user = requireUser(req, db);
    const body = await parseBody(req);
    const payload = buildLineSearchPayload(body);
    const data = await upstreamRequest(db, "POST", "/openapi/v2/static/lines", payload);
    const normalized = decorateLinesForUser(db, user, data.data?.records || []);
    if (normalized.length) {
      const existing = new Map((db.upstreamCache.lines || []).map((item) => [item.lineId, item]));
      for (const line of normalized) existing.set(line.lineId, line);
      db.upstreamCache.lines = [...existing.values()];
      db.upstreamCache.linesFetchedAt = now();
    }
    if (!isMySqlState(db)) await saveDb(db);
    ok(res, {
      current: Number(data.data?.current ?? payload.current ?? 0),
      size: Number(data.data?.size ?? payload.size ?? 50),
      total: Number(data.data?.total ?? normalized.length),
      records: normalized
    });
  },
  "GET /api/orders": async (req, res, db) => {
    const user = requireUser(req, db);
    ok(res, db.orders.filter((order) => order.userId === user.id).toReversed());
  },
  "POST /api/orders/quote": async (req, res, db) => {
    const user = requireUser(req, db);
    const body = await parseBody(req);
    const context = await resolveOrderContext(db, user, body);
    const { quantity, days, key, price, line, source, sourceType } = context;
    if (quantity < 1 || days < 1) throw Object.assign(new Error("数量和天数必须大于 0"), { status: 400 });
    const totalPrice = Number((price.effectiveUnitPrice * quantity * days).toFixed(2));
    ok(res, {
      skuKey: key,
      skuName: price.name,
      quantity,
      days,
      unitPrice: price.effectiveUnitPrice,
      totalPrice,
      currency: price.currency,
      balance: Number(user.balance || 0),
      balanceAfter: Number((Number(user.balance || 0) - totalPrice).toFixed(2)),
      sufficientBalance: Number(user.balance || 0) >= totalPrice,
      selectedLine: line,
      sourceType,
      source: {
        businessType: source.businessType || "",
        countryCode: source.countryCode || "",
        cityCode: source.cityCode || "",
        ispType: source.ispType ?? "",
        tag: source.tag || "",
        lineId: source.lineId || ""
      }
    });
  },
  "POST /api/orders": async (req, res, db) => {
    const user = requireUser(req, db);
    const body = await parseBody(req);
    const context = await resolveOrderContext(db, user, body);
    const { quantity, days, key, price, line, source, sourceType } = context;
    if (quantity < 1 || days < 1) throw Object.assign(new Error("数量和天数必须大于 0"), { status: 400 });
    const totalPrice = Number((price.effectiveUnitPrice * quantity * days).toFixed(2));
    if (user.balance < totalPrice) throw Object.assign(new Error("余额不足，请联系平台线下付款后由管理员划拨额度"), { status: 402 });
    const localOrderNo = id("ord");
    user.balance = Number((user.balance - totalPrice).toFixed(2));
    const upstreamRequestBody = sourceType === "inventory" ? {} : buildCreateOrderPayload({ ...source, quantity, days }, localOrderNo, price.currency);
    const order = {
      id: localOrderNo,
      userId: user.id,
      username: user.username,
      skuKey: key,
      skuName: price.name,
      request: upstreamRequestBody,
      quantity,
      days,
      unitPrice: price.effectiveUnitPrice,
      totalPrice,
      currency: price.currency,
      selectedLine: line,
      status: sourceType === "inventory" ? "completed" : "processing",
      sourceType,
      createdAt: now(),
      upstream: null
    };
    db.orders.push(order);
    await saveDb(db);
    if (sourceType === "inventory") {
      try {
        const assigned = assignInventoryInstances(db, user, order, context);
        order.upstream = { source: "inventory", assignedCount: assigned.length, lineId: line?.lineId || "" };
      } catch (error) {
        addCreditRecord(db, user, totalPrice, null, {
          source: "inventory_order_failed_refund",
          remark: `库存分配失败自动退回：${error.message}`
        });
        order.status = "upstream_failed";
        order.error = error.message;
      }
      await saveDb(db);
      return ok(res, order);
    }
    try {
      const upstream = await upstreamRequest(db, "POST", "/openapi/v2/static/orders/create", order.request);
      order.status = orderStatusFromUpstream(upstream.data?.status);
      order.upstream = upstream.data || upstream;
      mergeInstances(db, order, upstream.data?.instances || []);
    } catch (error) {
      addCreditRecord(db, user, totalPrice, null, {
        source: "upstream_order_failed_refund",
        remark: `上游下单失败自动退回：${error.message}`
      });
      order.status = "upstream_failed";
      order.error = error.message;
      order.errorMeta = error.upstream || null;
    }
    await saveDb(db);
    ok(res, order);
  },
  "GET /api/instances": async (req, res, db) => {
    const user = requireUser(req, db);
    ok(res, db.instances.filter((instance) => instance.userId === user.id).toReversed());
  },
  "POST /api/instances/search-upstream": async (req, res, db) => {
    const user = requireUser(req, db);
    const body = await parseBody(req);
    const data = await upstreamRequest(db, "POST", "/openapi/v2/static/instances", buildInstanceSearchPayload(body));
    const proxyIds = new Set((data.data?.records || []).map((item) => item.proxyId));
    const owned = db.instances.filter((instance) => instance.userId === user.id && proxyIds.has(instance.proxyId));
    ok(res, { upstream: data.data || { records: [] }, owned });
  },
  "POST /api/instances/change-ip": async (req, res, db) => {
    const user = requireUser(req, db);
    const body = await parseBody(req);
    const proxyIds = Array.isArray(body.proxyIds) ? body.proxyIds : [];
    const allowed = new Set(db.instances.filter((item) => item.userId === user.id).map((item) => item.proxyId));
    const selected = proxyIds.filter((proxyId) => allowed.has(proxyId));
    if (!selected.length) throw Object.assign(new Error("请选择自己的实例"), { status: 400 });
    const data = await upstreamRequest(db, "POST", "/openapi/v2/static/instances/change-ip", { proxyIds: selected, remark: body.remark || "" });
    for (const changed of data.data?.successList || []) {
      const instance = db.instances.find((item) => item.proxyId === changed.proxyId);
      if (instance) Object.assign(instance, { ip: changed.ip || instance.ip, port: changed.port ?? instance.port, updatedAt: now(), upstream: { ...instance.upstream, ...changed } });
    }
    await saveDb(db);
    ok(res, data.data || data);
  },
  "POST /api/instances/renew": async (req, res, db) => {
    const user = requireUser(req, db);
    const body = await parseBody(req);
    const proxyIds = Array.isArray(body.proxyIds) ? body.proxyIds : [];
    const days = Number(body.days || 0);
    if (days < 1) throw Object.assign(new Error("续费天数必须大于 0"), { status: 400 });
    const instances = db.instances.filter((item) => item.userId === user.id && proxyIds.includes(item.proxyId));
    if (!instances.length) throw Object.assign(new Error("请选择自己的实例"), { status: 400 });
    const totalPrice = Number(instances.reduce((sum, instance) => {
      const order = db.orders.find((item) => item.id === instance.orderId);
      return sum + Number(order?.unitPrice || 0) * days;
    }, 0).toFixed(2));
    if (user.balance < totalPrice) throw Object.assign(new Error("余额不足，请联系平台线下付款后由管理员划拨额度"), { status: 402 });
    const renewOrderNo = id("ren");
    user.balance = Number((user.balance - totalPrice).toFixed(2));
    const order = {
      id: renewOrderNo,
      userId: user.id,
      username: user.username,
      skuKey: "RENEW",
      skuName: "实例续费",
      request: { proxyIds: instances.map((item) => item.proxyId), days },
      quantity: instances.length,
      days,
      unitPrice: totalPrice / Math.max(1, instances.length * days),
      totalPrice,
      currency: body.currency || "CNY",
      status: "processing",
      type: "renewal",
      createdAt: now(),
      upstream: null
    };
    db.orders.push(order);
    try {
      const data = await upstreamRequest(db, "POST", "/openapi/v2/static/instances/renew", cleanObject({
        proxyIds: instances.map((item) => item.proxyId),
        days,
        currency: body.currency || "CNY",
        remark: body.remark || "",
        orderNo: renewOrderNo
      }, ["proxyIds", "days", "currency", "remark", "orderNo"]));
      order.status = orderStatusFromUpstream(data.data?.status ?? 3);
      order.upstream = data.data || data;
      for (const instance of instances) instance.updatedAt = now();
    } catch (error) {
      addCreditRecord(db, user, totalPrice, null, {
        source: "upstream_renew_failed_refund",
        remark: `上游续费失败自动退回：${error.message}`
      });
      order.status = "upstream_failed";
      order.error = error.message;
      order.errorMeta = error.upstream || null;
    }
    await saveDb(db);
    ok(res, order);
  },
  "POST /api/instances/update-credentials": async (req, res, db) => {
    const user = requireUser(req, db);
    const body = await parseBody(req);
    const proxyIds = Array.isArray(body.proxyIds) ? body.proxyIds : [];
    const allowed = new Set(db.instances.filter((item) => item.userId === user.id).map((item) => item.proxyId));
    const selected = proxyIds.filter((proxyId) => allowed.has(proxyId));
    if (!selected.length) throw Object.assign(new Error("请选择自己的实例"), { status: 400 });
    const payload = cleanObject({
      proxyIds: selected,
      username: body.username || undefined,
      password: body.password || undefined,
      random: Boolean(body.random),
      remark: body.remark || ""
    }, ["proxyIds", "username", "password", "random", "remark"]);
    const data = await upstreamRequest(db, "POST", "/openapi/v2/static/instances/update-credentials", payload);
    for (const changed of data.data?.successList || []) {
      const instance = db.instances.find((item) => item.proxyId === changed.proxyId);
      if (instance) Object.assign(instance, {
        proxyUsername: changed.username || instance.proxyUsername,
        proxyPassword: changed.password || instance.proxyPassword,
        updatedAt: now(),
        upstream: { ...instance.upstream, ...changed }
      });
    }
    await saveDb(db);
    ok(res, data.data || data);
  },
  "GET /api/recharges": async (req, res, db) => {
    const user = requireUser(req, db);
    ok(res, db.creditRecords.filter((item) => item.userId === user.id).toReversed());
  },
  "POST /api/recharges": async (req, res, db) => {
    requireUser(req, db);
    throw Object.assign(new Error("当前平台不支持用户提交充值申请，请线下付款后联系管理员划拨额度"), { status: 400 });
  },
  "GET /api/credits": async (req, res, db) => {
    const user = requireUser(req, db);
    ok(res, db.creditRecords.filter((item) => item.userId === user.id).toReversed());
  },
  "GET /api/admin/summary": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, {
      users: db.users.length,
      orders: db.orders.length,
      creditRecords: db.creditRecords.length,
      totalAllocated: Number(db.creditRecords.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
      activeSkus: db.prices.filter((item) => item.active).length
    });
  },
  "GET /api/admin/upstream": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, { ...db.upstream, appSecret: db.upstream.appSecret ? "******" : "" });
  },
  "PUT /api/admin/upstream": async (req, res, db) => {
    requireAdmin(req, db);
    const body = await parseBody(req);
    const nextMode = body.mode === "live" ? "live" : "mock";
    const nextAppSecret = body.appSecret === "******" ? db.upstream.appSecret : String(body.appSecret || "");
    const nextAppId = String(body.appId || "");
    if (nextMode === "live" && (!nextAppId || !nextAppSecret)) {
      throw Object.assign(new Error("切换到 live 模式前，必须填写 IPIPD 开放平台的 AppId 和 AppSecret"), { status: 400 });
    }
    db.upstream = {
      ...db.upstream,
      baseUrl: body.baseUrl || DEFAULT_UPSTREAM.baseUrl,
      mode: nextMode,
      appId: nextAppId,
      appSecret: nextAppSecret,
      username: String(body.username || ""),
      password: String(body.password || "")
    };
    await saveDb(db);
    ok(res, { ...db.upstream, appSecret: db.upstream.appSecret ? "******" : "" });
  },
  "GET /api/admin/upstream/account": async (req, res, db) => {
    requireAdmin(req, db);
    const account = await upstreamRequest(db, "GET", "/openapi/v2/account");
    ok(res, account.data || account);
  },
  "GET /api/admin/users": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, db.users.map(publicUser));
  },
  "POST /api/admin/users": async (req, res, db) => {
    requireAdmin(req, db);
    const body = await parseBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const role = body.role === "admin" ? "admin" : "user";
    if (username.length < 3 || password.length < 6) throw Object.assign(new Error("用户名至少 3 位，密码至少 6 位"), { status: 400 });
    if (db.users.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      throw Object.assign(new Error("用户名已存在"), { status: 409 });
    }
    const user = {
      id: id("usr"),
      username,
      passwordHash: hashPassword(password),
      role,
      status: "active",
      balance: 0,
      createdAt: now(),
      priceOverrides: {}
    };
    db.users.push(user);
    await saveDb(db);
    ok(res, publicUser(user));
  },
  "PUT /api/admin/users": async (req, res, db) => {
    const admin = requireAdmin(req, db);
    const body = await parseBody(req);
    const user = db.users.find((item) => item.id === body.id);
    if (!user) throw Object.assign(new Error("用户不存在"), { status: 404 });
    if (body.status) user.status = body.status;
    if (body.role && ["user", "admin"].includes(body.role)) user.role = body.role;
    if (body.password) user.passwordHash = hashPassword(String(body.password));
    if (body.adjustBalance) {
      addCreditRecord(db, user, Number(body.adjustBalance), admin, {
        source: Number(body.adjustBalance) > 0 ? "admin_manual_allocate" : "admin_manual_deduct",
        remark: body.balanceRemark || "用户管理页手动调整"
      });
    }
    await saveDb(db);
    ok(res, publicUser(user));
  },
  "PUT /api/admin/users/prices": async (req, res, db) => {
    requireAdmin(req, db);
    const body = await parseBody(req);
    const user = db.users.find((item) => item.id === body.userId);
    if (!user) throw Object.assign(new Error("用户不存在"), { status: 404 });
    user.priceOverrides ||= {};
    if (body.price === "" || body.price === null || body.price === undefined) delete user.priceOverrides[body.skuKey];
    else user.priceOverrides[body.skuKey] = Number(body.price);
    await saveDb(db);
    ok(res, publicUser(user));
  },
  "GET /api/admin/prices": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, db.prices);
  },
  "PUT /api/admin/prices": async (req, res, db) => {
    requireAdmin(req, db);
    const body = await parseBody(req);
    const key = body.skuKey || skuKey(body);
    let price = db.prices.find((item) => item.skuKey === key);
    if (!price) {
      price = { skuKey: key, active: true, currency: "CNY" };
      db.prices.push(price);
    }
    Object.assign(price, {
      businessType: body.businessType || price.businessType || "WEB",
      countryCode: body.countryCode || price.countryCode || "*",
      cityCode: body.cityCode || "",
      ispType: Number(body.ispType ?? price.ispType ?? 1),
      tag: body.tag || price.tag || "STANDARD",
      name: body.name || price.name || key,
      upstreamUnitPrice: Number(body.upstreamUnitPrice ?? price.upstreamUnitPrice ?? 0),
      unitPrice: Number(body.unitPrice ?? price.unitPrice ?? 0),
      currency: body.currency || price.currency || "CNY",
      active: body.active !== false,
      updatedAt: now()
    });
    price.skuKey = skuKey(price);
    await saveDb(db);
    ok(res, price);
  },
  "POST /api/admin/prices/sync-lines": async (req, res, db) => {
    requireAdmin(req, db);
    const lines = await ensureFreshLineCache(db, { forceRefresh: true });
    const activeKeys = new Set();
    for (const line of lines) {
      const draft = {
        businessType: line.businessType || "default",
        countryCode: line.countryCode || "*",
        cityCode: line.cityCode || "",
        ispType: Number(line.ispType ?? 1),
        tag: line.tag || ""
      };
      const key = skuKey(draft);
      activeKeys.add(key);
      let price = db.prices.find((item) => item.skuKey === key);
      if (!price) {
        price = {
          skuKey: key,
          createdAt: now()
        };
        db.prices.push(price);
      }
      Object.assign(price, {
        businessType: draft.businessType,
        countryCode: draft.countryCode,
        cityCode: draft.cityCode,
        ispType: draft.ispType,
        tag: draft.tag,
        name: price.name || lineDisplayName(line),
        upstreamUnitPrice: Number(line.price || 0),
        unitPrice: Number(price.unitPrice ?? line.price ?? 0),
        currency: line.currency || "CNY",
        active: true,
        updatedAt: now()
      });
    }
    for (const price of db.prices) {
      if (!activeKeys.has(price.skuKey)) price.active = false;
    }
    await saveDb(db);
    ok(res, db.prices);
  },
  "GET /api/admin/orders": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, db.orders.toReversed());
  },
  "PUT /api/admin/orders": async (req, res, db) => {
    requireAdmin(req, db);
    const body = await parseBody(req);
    const order = db.orders.find((item) => item.id === body.id);
    if (!order) throw Object.assign(new Error("订单不存在"), { status: 404 });
    if (body.status) order.status = body.status;
    if (body.note !== undefined) order.note = String(body.note || "");
    await saveDb(db);
    ok(res, order);
  },
  "GET /api/admin/instances": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, db.instances.toReversed());
  },
  "POST /api/admin/instances/sync-upstream": async (req, res, db) => {
    const admin = requireAdmin(req, db);
    const allInstances = await fetchAllUpstreamInstances(db, {}, { pageSize: 200, maxPages: 200 });
    db.upstreamCache.instances = allInstances.records || [];
    db.upstreamCache.instancesFetchedAt = now();
    const result = syncImportedInstancesIntoDb(db, admin, allInstances.records || []);
    await enrichImportedInventory(db);
    await saveDb(db);
    ok(res, {
      ...result,
      upstreamTotal: Number(allInstances.total || result.totalRecords || 0)
    });
  },
  "GET /api/admin/credits": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, db.creditRecords.toReversed());
  },
  "GET /api/admin/receipts": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, (db.receiptRecords || []).toReversed());
  },
  "POST /api/admin/credits/allocate": async (req, res, db) => {
    const admin = requireAdmin(req, db);
    const body = await parseBody(req);
    const user = db.users.find((item) => item.id === body.userId);
    if (!user) throw Object.assign(new Error("用户不存在"), { status: 404 });
    const record = createReceiptRecord(db, user, Number(body.amount), admin, {
      paymentMethod: String(body.paymentMethod || ""),
      paymentReference: String(body.paymentReference || ""),
      remark: String(body.remark || "")
    });
    await saveDb(db);
    ok(res, { receipt: record, user: publicUser(user) });
  },
  /*
  "POST /api/admin/credits/approve": async (req, res, db) => {
    const admin = requireAdmin(req, db);
    const body = await parseBody(req);
    const receipt = (db.receiptRecords || []).find((item) => item.id === body.id);
    if (!receipt) throw Object.assign(new Error("鏀舵鍗曚笉瀛樺湪"), { status: 404 });
    if (receipt.status === "approved") {
      const user = db.users.find((item) => item.id === receipt.userId);
      return ok(res, { receipt, user: user ? publicUser(user) : null });
    }
    if (receipt.status === "rejected") throw Object.assign(new Error("璇ユ敹娆惧崟宸茶鎷掔粷"), { status: 400 });
    const user = db.users.find((item) => item.id === receipt.userId);
    if (!user) throw Object.assign(new Error("鐢ㄦ埛涓嶅瓨鍦?), { status: 404 });
    const credit = addCreditRecord(db, user, Number(receipt.amount), admin, {
      source: "offline_receipt_approved",
      paymentMethod: receipt.paymentMethod,
      paymentReference: receipt.paymentReference,
      remark: receipt.remark || String(body.reviewNote || "")
    });
    Object.assign(receipt, {
      status: "approved",
      reviewedById: admin.id,
      reviewedByName: admin.username,
      reviewNote: String(body.reviewNote || ""),
      creditRecordId: credit.id,
      reviewedAt: now()
    });
    await saveDb(db);
    ok(res, { receipt, creditRecord: credit, user: publicUser(user) });
  },
  "POST /api/admin/credits/reject": async (req, res, db) => {
    const admin = requireAdmin(req, db);
    const body = await parseBody(req);
    const receipt = (db.receiptRecords || []).find((item) => item.id === body.id);
    if (!receipt) throw Object.assign(new Error("鏀舵鍗曚笉瀛樺湪"), { status: 404 });
    if (receipt.status === "approved") throw Object.assign(new Error("璇ユ敹娆惧崟宸插叆璐︼紝涓嶈兘鎷掔粷"), { status: 400 });
    if (receipt.status === "rejected") return ok(res, { receipt });
    Object.assign(receipt, {
      status: "rejected",
      reviewedById: admin.id,
      reviewedByName: admin.username,
      reviewNote: String(body.reviewNote || ""),
      reviewedAt: now()
    });
    await saveDb(db);
    ok(res, { receipt });
  },
  */
  "POST /api/admin/credits/approve": async (req, res, db) => {
    const admin = requireAdmin(req, db);
    const body = await parseBody(req);
    const receipt = (db.receiptRecords || []).find((item) => item.id === body.id);
    if (!receipt) throw Object.assign(new Error("收款单不存在"), { status: 404 });
    if (receipt.status === "approved") {
      const user = db.users.find((item) => item.id === receipt.userId);
      return ok(res, { receipt, user: user ? publicUser(user) : null });
    }
    if (receipt.status === "rejected") throw Object.assign(new Error("该收款单已被拒绝"), { status: 400 });
    const user = db.users.find((item) => item.id === receipt.userId);
    if (!user) throw Object.assign(new Error("用户不存在"), { status: 404 });
    const credit = addCreditRecord(db, user, Number(receipt.amount), admin, {
      source: "offline_receipt_approved",
      paymentMethod: receipt.paymentMethod,
      paymentReference: receipt.paymentReference,
      remark: receipt.remark || String(body.reviewNote || "")
    });
    Object.assign(receipt, {
      status: "approved",
      reviewedById: admin.id,
      reviewedByName: admin.username,
      reviewNote: String(body.reviewNote || ""),
      creditRecordId: credit.id,
      reviewedAt: now()
    });
    await saveDb(db);
    ok(res, { receipt, creditRecord: credit, user: publicUser(user) });
  },
  "POST /api/admin/credits/reject": async (req, res, db) => {
    const admin = requireAdmin(req, db);
    const body = await parseBody(req);
    const receipt = (db.receiptRecords || []).find((item) => item.id === body.id);
    if (!receipt) throw Object.assign(new Error("收款单不存在"), { status: 404 });
    if (receipt.status === "approved") throw Object.assign(new Error("该收款单已入账，不能拒绝"), { status: 400 });
    if (receipt.status === "rejected") return ok(res, { receipt });
    Object.assign(receipt, {
      status: "rejected",
      reviewedById: admin.id,
      reviewedByName: admin.username,
      reviewNote: String(body.reviewNote || ""),
      reviewedAt: now()
    });
    await saveDb(db);
    ok(res, { receipt });
  },
  "GET /api/admin/recharges": async (req, res, db) => {
    requireAdmin(req, db);
    ok(res, db.creditRecords.toReversed());
  },
  "PUT /api/admin/recharges": async (req, res, db) => {
    requireAdmin(req, db);
    throw Object.assign(new Error("充值审批流程已停用，请使用额度划拨功能"), { status: 400 });
  },
  "POST /api/ipipd/callback": async (req, res, db) => {
    const body = await parseBody(req);
    const callback = {
      id: id("cb"),
      type: body.type || "",
      requestId: body.requestId || "",
      payload: body,
      createdAt: now()
    };
    db.callbacks.push(callback);
    if (body.type === "CREATE_STATIC_ORDER" && body.data) {
      const data = body.data;
      const order = db.orders.find((item) => item.id === data.externalOrderNo || item.id === data.orderNo || item.upstream?.orderNo === data.orderNo);
      if (order) {
        order.status = orderStatusFromUpstream(data.status);
        order.upstream = { ...(order.upstream || {}), ...data };
        mergeInstances(db, order, data.instances || []);
      }
    }
    if (body.type === "UPDATE_STATIC_INSTANCE" && body.data) {
      const data = body.data;
      let instance = db.instances.find((item) => item.proxyId === data.proxyId || item.proxyId === body.proxyId);
      if (instance) {
        Object.assign(instance, {
          ip: data.ip || instance.ip,
          port: data.port ?? instance.port,
          proxyUsername: data.username || instance.proxyUsername,
          proxyPassword: data.password || instance.proxyPassword,
          status: instanceStatusFromUpstream(data.status),
          rawStatus: data.status,
          ispType: data.ispType ?? instance.ispType,
          autoRenew: data.autoRenew ?? instance.autoRenew,
          activatedAt: data.activatedAt || instance.activatedAt,
          expiresAt: data.expiresAt || instance.expiresAt,
          changeType: body.changeType || instance.changeType,
          updatedAt: now(),
          upstream: { ...(instance.upstream || {}), ...data }
        });
      }
    }
    await saveDb(db);
    ok(res, { received: true });
  }
};

async function serveStatic(req, res, pathname) {
  const filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) return fail(res, 403, "Forbidden");
  try {
    const data = await fs.readFile(resolved);
    const ext = path.extname(resolved);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
    res.writeHead(200, { "content-type": types[ext] || "application/octet-stream", ...corsHeaders() });
    res.end(data);
  } catch {
    const index = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", ...corsHeaders() });
    res.end(index);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === "OPTIONS") return sendOptions(res);
  if (!url.pathname.startsWith("/api/")) return serveStatic(req, res, url.pathname);
  let db;
  try {
    db = await loadDb();
    const handler = handlers[routeKey(req.method, url.pathname)];
    if (!handler) return fail(res, 404, "接口不存在");
    await handler(req, res, db, url);
  } catch (error) {
    fail(res, error.status || 500, error.message || "服务器错误");
  } finally {
    await releaseDb(db);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`IPIPD panel running at http://localhost:${PORT}`);
});
