import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

const DEFAULT_UPSTREAM = {
  baseUrl: "https://api.ipipd.cn",
  mode: "mock",
  appId: "",
  appSecret: "",
  username: "",
  password: ""
};

let poolPromise;
let schemaReady = false;

function now() {
  return new Date().toISOString();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeJson(value) {
  return JSON.stringify(value ?? null);
}

function mysqlConfigFromEnv() {
  if (process.env.MYSQL_URL) {
    return {
      uri: process.env.MYSQL_URL,
      connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
      decimalNumbers: true
    };
  }
  if (!process.env.MYSQL_HOST || !process.env.MYSQL_USER || !process.env.MYSQL_DATABASE) return null;
  return {
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
    decimalNumbers: true
  };
}

export function isMySqlConfigured() {
  return Boolean(mysqlConfigFromEnv());
}

async function getPool() {
  const config = mysqlConfigFromEnv();
  if (!config) return null;
  if (!poolPromise) {
    poolPromise = Promise.resolve().then(() => {
      if (config.uri) return mysql.createPool(config.uri);
      return mysql.createPool(config);
    });
  }
  return poolPromise;
}

async function ensureSchema(pool) {
  if (!pool || schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      state_key VARCHAR(64) PRIMARY KEY,
      state_value LONGTEXT NOT NULL,
      updated_at VARCHAR(64) NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(64) PRIMARY KEY,
      username VARCHAR(191) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(32) NOT NULL,
      status VARCHAR(32) NOT NULL,
      balance DECIMAL(16,2) NOT NULL DEFAULT 0,
      created_at VARCHAR(64) NOT NULL,
      last_login_at VARCHAR(64) NULL,
      price_overrides_json LONGTEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prices (
      sku_key VARCHAR(255) PRIMARY KEY,
      business_type VARCHAR(191) NOT NULL,
      country_code VARCHAR(32) NOT NULL,
      city_code VARCHAR(64) NOT NULL,
      isp_type INT NOT NULL,
      tag VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      upstream_unit_price DECIMAL(16,2) NOT NULL DEFAULT 0,
      unit_price DECIMAL(16,2) NOT NULL DEFAULT 0,
      currency VARCHAR(16) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at VARCHAR(64) NULL,
      updated_at VARCHAR(64) NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      username VARCHAR(191) NOT NULL,
      sku_key VARCHAR(255) NOT NULL,
      sku_name VARCHAR(255) NOT NULL,
      quantity INT NOT NULL,
      days INT NOT NULL,
      unit_price DECIMAL(16,2) NOT NULL DEFAULT 0,
      total_price DECIMAL(16,2) NOT NULL DEFAULT 0,
      currency VARCHAR(16) NOT NULL,
      status VARCHAR(64) NOT NULL,
      type VARCHAR(64) NULL,
      source_type VARCHAR(64) NULL,
      imported_from_upstream TINYINT(1) NOT NULL DEFAULT 0,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NULL,
      request_json LONGTEXT NOT NULL,
      upstream_json LONGTEXT NULL,
      selected_line_json LONGTEXT NULL,
      error_text TEXT NULL,
      error_meta_json LONGTEXT NULL,
      note TEXT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS instances (
      id VARCHAR(128) PRIMARY KEY,
      proxy_id VARCHAR(128) NOT NULL UNIQUE,
      user_id VARCHAR(64) NOT NULL,
      username VARCHAR(191) NOT NULL,
      order_id VARCHAR(128) NOT NULL,
      sku_key VARCHAR(255) NOT NULL,
      sku_name VARCHAR(255) NOT NULL,
      business_type VARCHAR(191) NULL,
      line_id VARCHAR(128) NULL,
      country_code VARCHAR(32) NULL,
      city_code VARCHAR(64) NULL,
      isp_type INT NULL,
      tag VARCHAR(64) NULL,
      ip VARCHAR(64) NULL,
      port INT NULL,
      proxy_username VARCHAR(191) NULL,
      proxy_password VARCHAR(191) NULL,
      status VARCHAR(64) NOT NULL,
      raw_status INT NULL,
      auto_renew TINYINT(1) NOT NULL DEFAULT 0,
      activated_at VARCHAR(64) NULL,
      expires_at VARCHAR(64) NULL,
      created_at VARCHAR(64) NOT NULL,
      updated_at VARCHAR(64) NULL,
      change_type VARCHAR(64) NULL,
      upstream_json LONGTEXT NULL,
      line_meta_json LONGTEXT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS credit_records (
      id VARCHAR(128) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      username VARCHAR(191) NOT NULL,
      amount DECIMAL(16,2) NOT NULL,
      before_balance DECIMAL(16,2) NOT NULL,
      after_balance DECIMAL(16,2) NOT NULL,
      type VARCHAR(64) NOT NULL,
      source VARCHAR(64) NOT NULL,
      payment_method VARCHAR(64) NULL,
      payment_reference VARCHAR(191) NULL,
      remark TEXT NULL,
      operator_id VARCHAR(64) NULL,
      operator_name VARCHAR(191) NULL,
      created_at VARCHAR(64) NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS callbacks (
      id VARCHAR(128) PRIMARY KEY,
      type VARCHAR(64) NOT NULL,
      request_id VARCHAR(128) NULL,
      payload_json LONGTEXT NOT NULL,
      created_at VARCHAR(64) NOT NULL
    )
  `);
  schemaReady = true;
}

function buildDefaultState() {
  const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
  return {
    meta: { createdAt: now(), updatedAt: now() },
    upstream: { ...DEFAULT_UPSTREAM },
    users: [
      {
        id: "usr_admin",
        username: process.env.ADMIN_USER || "admin",
        passwordHash: hashPassword(adminPassword),
        role: "admin",
        status: "active",
        balance: 0,
        createdAt: now(),
        priceOverrides: {}
      }
    ],
    prices: [],
    orders: [],
    instances: [],
    rechargeRequests: [],
    creditRecords: [],
    receiptRecords: [],
    callbacks: [],
    upstreamCache: {
      businessTypes: [],
      locations: [],
      locationOptions: [],
      lines: [],
      linesFetchedAt: "",
      instances: [],
      instancesFetchedAt: ""
    }
  };
}

async function loadFromFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch {
    const db = buildDefaultState();
    await saveToFile(db);
    return db;
  }
}

async function saveToFile(db) {
  db.meta.updatedAt = now();
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

async function loadFromMySql() {
  const pool = await getPool();
  await ensureSchema(pool);
  const conn = await pool.getConnection();
  try {
    const db = buildDefaultState();
    const [stateRows] = await conn.query("SELECT state_key, state_value FROM app_state");
    const state = new Map(stateRows.map((row) => [row.state_key, parseJson(row.state_value, null)]));
    db.meta = state.get("meta") || db.meta;
    db.upstream = state.get("upstream") || db.upstream;
    db.rechargeRequests = state.get("rechargeRequests") || [];
    db.receiptRecords = state.get("receiptRecords") || [];
    db.upstreamCache = {
      ...db.upstreamCache,
      ...(state.get("upstreamCache") || {})
    };

    const [userRows] = await conn.query("SELECT * FROM users");
    db.users = userRows.map((row) => ({
      id: row.id,
      username: row.username,
      passwordHash: row.password_hash,
      role: row.role,
      status: row.status,
      balance: Number(row.balance || 0),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at || undefined,
      priceOverrides: parseJson(row.price_overrides_json, {})
    }));

    const [priceRows] = await conn.query("SELECT * FROM prices");
    db.prices = priceRows.map((row) => ({
      skuKey: row.sku_key,
      businessType: row.business_type,
      countryCode: row.country_code,
      cityCode: row.city_code,
      ispType: Number(row.isp_type),
      tag: row.tag,
      name: row.name,
      upstreamUnitPrice: Number(row.upstream_unit_price || 0),
      unitPrice: Number(row.unit_price || 0),
      currency: row.currency,
      active: Boolean(row.active),
      createdAt: row.created_at || undefined,
      updatedAt: row.updated_at
    }));

    const [orderRows] = await conn.query("SELECT * FROM orders");
    db.orders = orderRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      skuKey: row.sku_key,
      skuName: row.sku_name,
      quantity: Number(row.quantity || 0),
      days: Number(row.days || 0),
      unitPrice: Number(row.unit_price || 0),
      totalPrice: Number(row.total_price || 0),
      currency: row.currency,
      status: row.status,
      type: row.type || undefined,
      sourceType: row.source_type || undefined,
      importedFromUpstream: Boolean(row.imported_from_upstream),
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
      request: parseJson(row.request_json, {}),
      upstream: parseJson(row.upstream_json, null),
      selectedLine: parseJson(row.selected_line_json, null),
      error: row.error_text || undefined,
      errorMeta: parseJson(row.error_meta_json, null),
      note: row.note || undefined
    }));

    const [instanceRows] = await conn.query("SELECT * FROM instances");
    db.instances = instanceRows.map((row) => ({
      id: row.id,
      proxyId: row.proxy_id,
      userId: row.user_id,
      username: row.username,
      orderId: row.order_id,
      skuKey: row.sku_key,
      skuName: row.sku_name,
      businessType: row.business_type || undefined,
      lineId: row.line_id || undefined,
      countryCode: row.country_code || undefined,
      cityCode: row.city_code || undefined,
      ispType: row.isp_type === null ? undefined : Number(row.isp_type),
      tag: row.tag || undefined,
      ip: row.ip || undefined,
      port: row.port === null ? undefined : Number(row.port),
      proxyUsername: row.proxy_username || undefined,
      proxyPassword: row.proxy_password || undefined,
      status: row.status,
      rawStatus: row.raw_status === null ? undefined : Number(row.raw_status),
      autoRenew: Boolean(row.auto_renew),
      activatedAt: row.activated_at || undefined,
      expiresAt: row.expires_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at || undefined,
      changeType: row.change_type || undefined,
      upstream: parseJson(row.upstream_json, null),
      lineMeta: parseJson(row.line_meta_json, null)
    }));

    const [creditRows] = await conn.query("SELECT * FROM credit_records");
    db.creditRecords = creditRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      username: row.username,
      amount: Number(row.amount || 0),
      beforeBalance: Number(row.before_balance || 0),
      afterBalance: Number(row.after_balance || 0),
      type: row.type,
      source: row.source,
      paymentMethod: row.payment_method || "",
      paymentReference: row.payment_reference || "",
      remark: row.remark || "",
      operatorId: row.operator_id || "",
      operatorName: row.operator_name || "system",
      createdAt: row.created_at
    }));

    const [callbackRows] = await conn.query("SELECT * FROM callbacks");
    db.callbacks = callbackRows.map((row) => ({
      id: row.id,
      type: row.type,
      requestId: row.request_id || "",
      payload: parseJson(row.payload_json, {}),
      createdAt: row.created_at
    }));

    db.__storage = { type: "mysql", conn };
    return db;
  } catch (error) {
    conn.release();
    throw error;
  }
}

async function bulkInsert(conn, sql, rows) {
  if (!rows.length) return;
  await conn.query(sql, [rows]);
}

async function saveToMySql(db) {
  const conn = db.__storage?.conn;
  if (!conn) throw new Error("MySQL connection not attached to loaded state");
  db.meta.updatedAt = now();
  const safeCache = {
    ...(db.upstreamCache || {}),
    lines: [],
    instances: []
  };
  try {
    await conn.beginTransaction();
    await conn.query("REPLACE INTO app_state (state_key, state_value, updated_at) VALUES (?, ?, ?)", ["meta", serializeJson(db.meta), db.meta.updatedAt]);
    await conn.query("REPLACE INTO app_state (state_key, state_value, updated_at) VALUES (?, ?, ?)", ["upstream", serializeJson(db.upstream), db.meta.updatedAt]);
    await conn.query("REPLACE INTO app_state (state_key, state_value, updated_at) VALUES (?, ?, ?)", ["rechargeRequests", serializeJson(db.rechargeRequests || []), db.meta.updatedAt]);
    await conn.query("REPLACE INTO app_state (state_key, state_value, updated_at) VALUES (?, ?, ?)", ["receiptRecords", serializeJson(db.receiptRecords || []), db.meta.updatedAt]);
    await conn.query("REPLACE INTO app_state (state_key, state_value, updated_at) VALUES (?, ?, ?)", ["upstreamCache", serializeJson(safeCache), db.meta.updatedAt]);

    await conn.query("DELETE FROM users");
    await bulkInsert(conn, "INSERT INTO users (id, username, password_hash, role, status, balance, created_at, last_login_at, price_overrides_json) VALUES ?", db.users.map((item) => [
      item.id,
      item.username,
      item.passwordHash,
      item.role,
      item.status,
      Number(item.balance || 0),
      item.createdAt || now(),
      item.lastLoginAt || null,
      serializeJson(item.priceOverrides || {})
    ]));

    await conn.query("DELETE FROM prices");
    await bulkInsert(conn, "INSERT INTO prices (sku_key, business_type, country_code, city_code, isp_type, tag, name, upstream_unit_price, unit_price, currency, active, created_at, updated_at) VALUES ?", db.prices.map((item) => [
      item.skuKey,
      item.businessType || "",
      item.countryCode || "",
      item.cityCode || "",
      Number(item.ispType ?? 0),
      item.tag || "",
      item.name || "",
      Number(item.upstreamUnitPrice || 0),
      Number(item.unitPrice || 0),
      item.currency || "CNY",
      item.active ? 1 : 0,
      item.createdAt || null,
      item.updatedAt || now()
    ]));

    await conn.query("DELETE FROM orders");
    await bulkInsert(conn, "INSERT INTO orders (id, user_id, username, sku_key, sku_name, quantity, days, unit_price, total_price, currency, status, type, source_type, imported_from_upstream, created_at, updated_at, request_json, upstream_json, selected_line_json, error_text, error_meta_json, note) VALUES ?", db.orders.map((item) => [
      item.id,
      item.userId,
      item.username,
      item.skuKey || "",
      item.skuName || "",
      Number(item.quantity || 0),
      Number(item.days || 0),
      Number(item.unitPrice || 0),
      Number(item.totalPrice || 0),
      item.currency || "CNY",
      item.status || "",
      item.type || null,
      item.sourceType || null,
      item.importedFromUpstream ? 1 : 0,
      item.createdAt || now(),
      item.updatedAt || null,
      serializeJson(item.request || {}),
      serializeJson(item.upstream ?? null),
      serializeJson(item.selectedLine ?? null),
      item.error || null,
      serializeJson(item.errorMeta ?? null),
      item.note || null
    ]));

    await conn.query("DELETE FROM instances");
    await bulkInsert(conn, "INSERT INTO instances (id, proxy_id, user_id, username, order_id, sku_key, sku_name, business_type, line_id, country_code, city_code, isp_type, tag, ip, port, proxy_username, proxy_password, status, raw_status, auto_renew, activated_at, expires_at, created_at, updated_at, change_type, upstream_json, line_meta_json) VALUES ?", db.instances.map((item) => [
      item.id,
      item.proxyId,
      item.userId,
      item.username,
      item.orderId,
      item.skuKey || "",
      item.skuName || "",
      item.businessType || null,
      item.lineId || null,
      item.countryCode || null,
      item.cityCode || null,
      item.ispType ?? null,
      item.tag || null,
      item.ip || null,
      item.port ?? null,
      item.proxyUsername || null,
      item.proxyPassword || null,
      item.status || "",
      item.rawStatus ?? null,
      item.autoRenew ? 1 : 0,
      item.activatedAt || null,
      item.expiresAt || null,
      item.createdAt || now(),
      item.updatedAt || null,
      item.changeType || null,
      serializeJson(item.upstream ?? null),
      serializeJson(item.lineMeta ?? null)
    ]));

    await conn.query("DELETE FROM credit_records");
    await bulkInsert(conn, "INSERT INTO credit_records (id, user_id, username, amount, before_balance, after_balance, type, source, payment_method, payment_reference, remark, operator_id, operator_name, created_at) VALUES ?", db.creditRecords.map((item) => [
      item.id,
      item.userId,
      item.username,
      Number(item.amount || 0),
      Number(item.beforeBalance || 0),
      Number(item.afterBalance || 0),
      item.type || "",
      item.source || "",
      item.paymentMethod || null,
      item.paymentReference || null,
      item.remark || null,
      item.operatorId || null,
      item.operatorName || null,
      item.createdAt || now()
    ]));

    await conn.query("DELETE FROM callbacks");
    await bulkInsert(conn, "INSERT INTO callbacks (id, type, request_id, payload_json, created_at) VALUES ?", db.callbacks.map((item) => [
      item.id,
      item.type || "",
      item.requestId || null,
      serializeJson(item.payload || {}),
      item.createdAt || now()
    ]));

    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
}

export async function loadState() {
  if (isMySqlConfigured()) return loadFromMySql();
  return loadFromFile();
}

export async function saveState(db) {
  if (db.__storage?.type === "mysql") return saveToMySql(db);
  return saveToFile(db);
}

export async function releaseState(db) {
  if (db?.__storage?.type === "mysql" && db.__storage.conn) {
    db.__storage.conn.release();
    db.__storage.conn = null;
  }
}
