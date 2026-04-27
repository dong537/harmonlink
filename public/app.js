const app = document.querySelector("#app");

const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  view: "dashboard",
  cache: {}
};

const navUser = [
  ["dashboard", "首页指引"],
  ["order", "挑选线路"],
  ["instances", "我的代理"],
  ["orders", "订单记录"],
  ["recharge", "余额明细"]
];

const navAdmin = [
  ["adminDashboard", "管理概览"],
  ["upstream", "上游凭据"],
  ["users", "用户管理"],
  ["prices", "价格管理"],
  ["adminOrders", "订单管理"],
  ["adminInstances", "实例管理"],
  ["recharges", "额度划拨"]
];

function money(value) {
  return `￥${Number(value || 0).toFixed(2)}`;
}

function orderStatusText(status) {
  return {
    processing: "正在开通",
    completed: "已开通",
    upstream_failed: "开通失败",
    cancelled: "已取消",
    pending_payment: "待支付",
    paid: "已支付",
    failed: "失败",
    refunded: "已退款"
  }[status] || (status || "-");
}

function instanceStatusText(status) {
  return {
    active: "可使用",
    creating: "创建中",
    activating: "开通中",
    expired: "已到期",
    disabled: "已停用",
    unknown: "状态未知"
  }[status] || (status || "-");
}

function humanTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}

function statusBadge(status) {
  const ok = ["completed", "approved", "active"];
  const warn = ["pending", "processing", "upstream_failed"];
  const cls = ok.includes(status) ? "ok" : warn.includes(status) ? "warn" : "danger";
  const label = status in { completed: 1, processing: 1, upstream_failed: 1, active: 1 } ? (orderStatusText(status) || instanceStatusText(status)) : (status || "-");
  return `<span class="badge ${cls}">${label}</span>`;
}

function toast(message, bad = false) {
  const node = document.createElement("div");
  node.className = "toast";
  node.style.background = bad ? "#b42318" : "#111827";
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 3200);
}

async function copyText(text, successMessage = "已复制") {
  try {
    await navigator.clipboard.writeText(String(text || ""));
    toast(successMessage);
  } catch {
    toast("复制失败，请手动复制", true);
  }
}

async function withButtonBusy(button, busyLabel, task) {
  if (!button) return task();
  if (button.dataset.busy === "1") return;
  const originalText = button.textContent;
  button.dataset.busy = "1";
  button.disabled = true;
  button.textContent = busyLabel;
  try {
    return await task();
  } finally {
    button.dataset.busy = "0";
    button.disabled = false;
    button.textContent = originalText;
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(state.token ? { authorization: `Bearer ${state.token}` } : {}),
      ...(options.headers || {})
    }
  });
  const raw = await res.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : { success: false, message: "响应为空" };
  } catch {
    const fallback = raw.trim().replace(/\s+/g, " ").slice(0, 180);
    throw new Error(fallback || `接口返回了非 JSON 内容（HTTP ${res.status}）`);
  }
  if (!res.ok || payload.success === false) throw new Error(payload.message || `请求失败（HTTP ${res.status}）`);
  return payload.data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function boot() {
  if (!state.token) return renderAuth();
  try {
    state.user = await api("/api/me");
    if (state.user.role === "admin" && !state.view.startsWith("admin") && !["upstream", "users", "prices", "recharges"].includes(state.view)) {
      state.view = "adminDashboard";
    }
    renderShell();
    await loadView();
  } catch {
    localStorage.removeItem("token");
    state.token = "";
    renderAuth();
  }
}

function renderAuth(register = false) {
  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card">
        <h1>家宽代理平台</h1>
        <p class="muted">${register ? "创建客户账号后即可充值和下单。" : "登录后进入客户面板或管理后台。"}</p>
        <form id="authForm">
          <div class="field">
            <label>用户名</label>
            <input name="username" autocomplete="username" required minlength="3" />
          </div>
          <div class="field">
            <label>密码</label>
            <input name="password" type="password" autocomplete="${register ? "new-password" : "current-password"}" required minlength="6" />
          </div>
          <button class="primary" type="submit">${register ? "注册并登录" : "登录"}</button>
        </form>
        <p class="muted">
          ${register ? "已有账号？" : "没有账号？"}
          <button id="switchAuth" type="button">${register ? "去登录" : "去注册"}</button>
        </p>
      </section>
    </main>`;
  document.querySelector("#switchAuth").onclick = () => renderAuth(!register);
  document.querySelector("#authForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = await api(register ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(formData(event.currentTarget))
      });
      state.token = data.token;
      state.user = data.user;
      localStorage.setItem("token", data.token);
      state.view = data.user.role === "admin" ? "adminDashboard" : "dashboard";
      await boot();
    } catch (error) {
      toast(error.message, true);
    }
  };
}

function renderShell() {
  const nav = state.user.role === "admin" ? navAdmin : navUser;
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">IP 家宽平台</div>
        <div class="side-muted">${state.user.username} · ${state.user.role}</div>
        <nav class="nav">
          ${nav.map(([key, label]) => `<button data-view="${key}" class="${state.view === key ? "active" : ""}">${label}</button>`).join("")}
        </nav>
      </aside>
      <main class="main">
        <div class="topbar">
          <div class="title">
            <h1 id="pageTitle"></h1>
            <p id="pageSub"></p>
          </div>
          <div class="toolbar">
            <span class="badge">余额 ${money(state.user.balance)}</span>
            <button id="refreshBtn">刷新</button>
            <button id="logoutBtn">退出</button>
          </div>
        </div>
        <section id="view"></section>
      </main>
    </div>`;
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.onclick = async () => {
      state.view = button.dataset.view;
      renderShell();
      await loadView();
    };
  });
  document.querySelector("#refreshBtn").onclick = async () => {
    state.user = await api("/api/me");
    renderShell();
    await loadView();
  };
  document.querySelector("#logoutBtn").onclick = () => {
    localStorage.removeItem("token");
    state.token = "";
    state.user = null;
    renderAuth();
  };
}

function setTitle(title, sub = "") {
  document.querySelector("#pageTitle").textContent = title;
  document.querySelector("#pageSub").textContent = sub;
}

async function loadView() {
  try {
    const map = {
      dashboard: userDashboard,
      order: orderViewSimple,
      instances: instancesView,
      orders: ordersView,
      recharge: rechargeView,
      adminDashboard,
      upstream,
      users: usersV2,
      prices,
      adminOrders,
      adminInstances,
      recharges: rechargesV2
    };
    await map[state.view]();
  } catch (error) {
    document.querySelector("#view").innerHTML = `<div class="panel">${error.message}</div>`;
    toast(error.message, true);
  }
}

async function userDashboard() {
  setTitle("首页指引", "第一次使用时，按下面 4 步走就不容易出错。");
  const [prices, orders, credits] = await Promise.all([api("/api/catalog/prices"), api("/api/orders"), api("/api/credits")]);
  document.querySelector("#view").innerHTML = `
    <div class="grid cols-3">
      <div class="panel stat"><div class="muted">账户余额</div><div class="num">${money(state.user.balance)}</div></div>
      <div class="panel stat"><div class="muted">订单数量</div><div class="num">${orders.length}</div></div>
      <div class="panel stat"><div class="muted">额度流水</div><div class="num">${credits.length}</div></div>
    </div>
    <div class="panel help-panel" style="margin-top:14px">
      <h2>第一次购买怎么做</h2>
      <div class="help-steps">
        <div class="help-step">
          <span class="step-num">1</span>
          <div>
            <strong>先确认余额</strong>
            <div class="muted">如果余额不够，先联系管理员线下收款后给你加额度。</div>
          </div>
        </div>
        <div class="help-step">
          <span class="step-num">2</span>
          <div>
            <strong>进入“挑选线路”</strong>
            <div class="muted">先选用途和地区，再搜索可以购买的线路。</div>
          </div>
        </div>
        <div class="help-step">
          <span class="step-num">3</span>
          <div>
            <strong>先看费用再确认</strong>
            <div class="muted">一定先点“查看本次费用”，确认价格后再购买。</div>
          </div>
        </div>
        <div class="help-step">
          <span class="step-num">4</span>
          <div>
            <strong>去“我的代理”查看</strong>
            <div class="muted">开通成功后，你会看到连接地址、账号、密码和到期时间。</div>
          </div>
        </div>
      </div>
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>平台当前可售模板</h2>
      ${table(prices, ["名称", "SKU", "单价/天", "可用"], (item) => [
        item.name,
        item.skuKey,
        money(item.effectiveUnitPrice),
        statusBadge(item.active ? "active" : "disabled")
      ])}
    </div>`;
}

async function orderView() {
  setTitle("下单", "先查询真实上游线路，再选择有售价的线路创建订单。");
  const [prices, businessTypes] = await Promise.all([api("/api/catalog/prices"), api("/api/catalog/business-types")]);
  document.querySelector("#view").innerHTML = `
    <div class="panel">
      <h2>创建家宽订单</h2>
      <form id="orderForm" class="form-grid">
        <div class="field span-2">
          <label>本地售价模板</label>
          <select name="skuKey" required>
            ${prices.map((p) => `<option value="${p.skuKey}">${p.name} · ${money(p.effectiveUnitPrice)}/天 · ${p.skuKey}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>数量</label>
          <input name="quantity" type="number" min="1" value="1" required />
        </div>
        <div class="field">
          <label>天数</label>
          <input name="days" type="number" min="1" value="30" required />
        </div>
        <div class="field">
          <label>业务类型</label>
          <select name="businessType">
            ${businessTypes.map((item) => `<option value="${item.code}">${item.name} · ${item.code}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>国家/地区代码</label>
          <input name="countryCode" placeholder="USA" required />
        </div>
        <div class="field">
          <label>城市/可用区代码</label>
          <input name="cityCode" placeholder="可留空" />
        </div>
        <div class="field">
          <label>IP 类型</label>
          <select name="ispType">
            <option value="1">广播</option>
            <option value="2">原生</option>
            <option value="0">不限</option>
          </select>
        </div>
        <div class="field">
          <label>线路标签</label>
          <input name="tag" placeholder="可留空" />
        </div>
        <div class="field">
          <label>线路 ID</label>
          <input name="lineId" placeholder="可选，优先按线路下单" />
        </div>
        <div class="span-3 toolbar">
          <button id="loadLines" type="button">查询上游线路</button>
          <button id="quoteBtn" type="button">获取报价</button>
          <button class="primary" id="submitOrderBtn" type="submit" disabled>确认并下单</button>
        </div>
      </form>
      <div id="quoteBox" class="empty">修改参数后先获取报价，再确认下单。</div>
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>上游线路</h2>
      <div id="linesBox" class="empty">点击查询后显示。</div>
    </div>`;
  const skuSelect = document.querySelector("[name=skuKey]");
  const orderForm = document.querySelector("#orderForm");
  const quoteBox = document.querySelector("#quoteBox");
  const submitOrderBtn = document.querySelector("#submitOrderBtn");
  let latestQuoteSignature = "";
  let currentQuote = null;
  const signatureOf = (data) => JSON.stringify({
    skuKey: data.skuKey || "",
    quantity: Number(data.quantity || 0),
    days: Number(data.days || 0),
    businessType: data.businessType || "",
    countryCode: data.countryCode || "",
    cityCode: data.cityCode || "",
    ispType: Number(data.ispType || 0),
    tag: data.tag || "",
    lineId: data.lineId || ""
  });
  const resetQuote = (message = "参数已变更，请重新获取报价。") => {
    currentQuote = null;
    latestQuoteSignature = "";
    submitOrderBtn.disabled = true;
    quoteBox.className = "empty";
    quoteBox.textContent = message;
  };
  const renderQuote = (quote) => {
    currentQuote = quote;
    submitOrderBtn.disabled = false;
    quoteBox.className = "quote-box";
    quoteBox.innerHTML = `
      <div class="quote-grid">
        <div class="quote-item"><div class="label">线路 / SKU</div><div class="value">${escapeHtml(quote.selectedLine?.lineId || quote.source.lineId || quote.skuName)}</div></div>
        <div class="quote-item"><div class="label">单价</div><div class="value">${money(quote.unitPrice)}</div></div>
        <div class="quote-item"><div class="label">数量 / 天数</div><div class="value">${quote.quantity} × ${quote.days}</div></div>
        <div class="quote-item"><div class="label">总价</div><div class="value">${money(quote.totalPrice)}</div></div>
      </div>
      <div class="quote-grid">
        <div class="quote-item"><div class="label">业务</div><div class="value">${escapeHtml(quote.source.businessType || "-")}</div></div>
        <div class="quote-item"><div class="label">地区</div><div class="value">${escapeHtml(`${quote.source.countryCode || ""} ${quote.source.cityCode || ""}`.trim() || "-")}</div></div>
        <div class="quote-item"><div class="label">当前余额</div><div class="value">${money(quote.balance)}</div></div>
        <div class="quote-item"><div class="label">下单后余额</div><div class="value">${money(quote.balanceAfter)}</div></div>
      </div>
      <div class="muted">${quote.sufficientBalance ? "报价已锁定当前参数，确认后将立即提交到上游。" : "余额不足，请先联系管理员划拨额度。"}</div>`;
  };
  const normalizedForm = () => {
    const data = formData(orderForm);
    data.quantity = Number(data.quantity);
    data.days = Number(data.days);
    data.ispType = Number(data.ispType);
    return data;
  };
  const applySku = () => {
    const parts = skuSelect.value.split("|");
    if (businessTypes.some((item) => item.code === parts[0])) {
      document.querySelector("[name=businessType]").value = parts[0];
    }
    document.querySelector("[name=countryCode]").value = parts[1] === "*" ? "" : parts[1];
    document.querySelector("[name=cityCode]").value = parts[2] === "*" ? "" : parts[2];
    document.querySelector("[name=ispType]").value = parts[3] === "*" ? "1" : parts[3];
    document.querySelector("[name=tag]").value = parts[4] === "STANDARD" ? "" : (parts[4] || "");
    resetQuote();
  };
  skuSelect.onchange = applySku;
  applySku();
  orderForm.querySelectorAll("input,select").forEach((node) => {
    node.addEventListener("input", () => resetQuote());
    node.addEventListener("change", () => resetQuote());
  });
  document.querySelector("#loadLines").onclick = async () => {
    const data = normalizedForm();
    const lines = await api("/api/catalog/lines", { method: "POST", body: JSON.stringify(data) });
    document.querySelector("#linesBox").innerHTML = table(lines.records || [], ["线路", "业务", "地区", "类型", "库存", "售价", "操作"], (line) => [
      line.lineId || "-",
      line.businessType || "-",
      `${line.countryCode || ""} ${line.cityCode || ""}`,
      line.ispType,
      line.availableCount ?? "-",
      line.availableForOrder ? `${money(line.effectiveUnitPrice)}/${line.currency || "CNY"}` : '<span class="badge danger">未配置售价</span>',
      line.availableForOrder
        ? `<button data-pick-line="${line.lineId}" data-country="${line.countryCode || ""}" data-city="${line.cityCode || ""}" data-isp="${line.ispType ?? ""}" data-business="${line.businessType || ""}" data-sku="${line.skuKey || ""}">使用</button>`
        : `<button disabled>不可下单</button>`
    ]);
    document.querySelectorAll("[data-pick-line]").forEach((button) => {
      button.onclick = () => {
        document.querySelector("[name=lineId]").value = button.dataset.pickLine || "";
        if (button.dataset.sku) {
          const sku = document.querySelector("[name=skuKey]");
          if ([...sku.options].some((item) => item.value === button.dataset.sku)) sku.value = button.dataset.sku;
        }
        if (button.dataset.business && businessTypes.some((item) => item.code === button.dataset.business)) {
          document.querySelector("[name=businessType]").value = button.dataset.business;
        }
        document.querySelector("[name=countryCode]").value = button.dataset.country || "";
        document.querySelector("[name=cityCode]").value = button.dataset.city || "";
        if (button.dataset.isp) document.querySelector("[name=ispType]").value = button.dataset.isp;
        resetQuote(`已选择线路 ${button.dataset.pickLine}，请重新获取报价。`);
        toast(`已选择线路 ${button.dataset.pickLine}`);
      };
    });
  };
  document.querySelector("#quoteBtn").onclick = async () => {
    try {
      const data = normalizedForm();
      const quote = await api("/api/orders/quote", { method: "POST", body: JSON.stringify(data) });
      latestQuoteSignature = signatureOf(data);
      renderQuote(quote);
      if (!quote.sufficientBalance) submitOrderBtn.disabled = true;
      toast("报价已更新");
    } catch (error) {
      resetQuote(error.message);
      toast(error.message, true);
    }
  };
  orderForm.onsubmit = async (event) => {
    event.preventDefault();
    const data = normalizedForm();
    if (!currentQuote || latestQuoteSignature !== signatureOf(data)) {
      resetQuote("请先获取当前参数的最新报价。");
      toast("请先获取报价并确认当前参数", true);
      return;
    }
    if (!currentQuote.sufficientBalance) {
      toast("余额不足，请先联系管理员划拨额度", true);
      return;
    }
    try {
      const order = await api("/api/orders", { method: "POST", body: JSON.stringify(data) });
      state.user = await api("/api/me");
      renderShell();
      toast(`订单已提交：${order.id}`);
      state.view = "orders";
      renderShell();
      await ordersView();
    } catch (error) {
      toast(error.message, true);
    }
  };
}

async function orderViewSimple() {
  setTitle("挑选线路", "像购物一样：先告诉系统你的需求，再选一条线路，确认费用后再购买。");
  const [prices, upstreamBusinessTypes] = await Promise.all([
    api("/api/catalog/prices"),
    api("/api/catalog/business-types")
  ]);
  const inventoryBusinessCodes = [...new Set(prices.map((item) => item.businessType).filter(Boolean))];
  const businessNameMap = new Map(upstreamBusinessTypes.map((item) => [item.code, item.name]));
  const businessTypes = inventoryBusinessCodes.map((code) => ({ code, name: businessNameMap.get(code) || code }));
  const inventoryCountries = [...new Set(prices.map((item) => item.countryCode).filter(Boolean))];
  let locationOptions = [];
  let locationMap = new Map();
  document.querySelector("#view").innerHTML = `
    <div class="order-wizard">
      <div class="panel step-panel">
        <div class="step-head">
          <span class="step-num">1</span>
          <div>
            <h2>先告诉系统你的需求</h2>
            <p class="muted">这里只显示你当前真正能买到的库存。地区不确定时可以先留空。购买时长请只选 30、60、90、180 天。</p>
          </div>
        </div>
        <form id="simpleOrderForm" class="form-grid">
          <input name="lineId" type="hidden" />
          <div class="field">
            <label>用途</label>
            <select name="businessType">
              <option value="">全部可售用途</option>
              ${businessTypes.map((item) => `<option value="${item.code}">${item.name}</option>`).join("")}
            </select>
            <div class="field-note">当前可售用途：${businessTypes.map((item) => item.name).join("、") || "暂无库存"}</div>
          </div>
          <div class="field">
            <label>想要哪个地区</label>
            <input name="locationKeyword" placeholder="可以直接输入中文，例如：日本、东京、洛杉矶、新加坡" autocomplete="off" />
            <input name="countryCode" type="hidden" />
            <input name="cityCode" type="hidden" />
            <div id="locationPicked" class="picked-chip empty">还没有选择地区。</div>
            <div id="locationSuggestions" class="suggestion-list empty">正在准备地区词典，几秒后就可以直接搜中文地名。</div>
            <div id="locationHint" class="field-note">当前可售国家/地区代码：${inventoryCountries.join("、") || "暂无库存"}</div>
          </div>
          <div class="field">
            <label>IP 类型</label>
            <select name="ispType">
              <option value="">不限</option>
              <option value="2" selected>原生</option>
              <option value="1">广播</option>
            </select>
          </div>
          <div class="field">
            <label>购买数量</label>
            <input name="quantity" type="number" min="1" value="1" required />
          </div>
          <div class="field">
            <label>购买时长</label>
            <select name="days">
              <option value="30" selected>30 天</option>
              <option value="60">60 天</option>
              <option value="90">90 天</option>
              <option value="180">180 天</option>
            </select>
          </div>
          <div class="field">
            <label>当前已选城市/可用区</label>
            <input id="locationCodePreview" value="未选择，系统会根据你上面的中文搜索自动带入" disabled />
          </div>
          <div class="span-3 toolbar">
            <button class="primary" id="searchLinesBtn" type="button">先找可购买线路</button>
            <button id="quoteBtn" type="button" disabled>查看本次费用</button>
            <button class="primary" id="submitOrderBtn" type="submit" disabled>确认购买</button>
          </div>
        </form>
      </div>

      <div class="panel step-panel">
        <div class="step-head">
          <span class="step-num">2</span>
          <div>
            <h2>选择一条线路</h2>
            <p class="muted">只显示当前能买的线路。先选线路，再点“查看本次费用”。</p>
          </div>
        </div>
        <div id="selectedLineBox" class="selected-line empty">还没有选择线路。</div>
        <div id="linesBox" class="line-grid empty">点击“先找可购买线路”后显示。</div>
      </div>

      <div class="panel step-panel">
        <div class="step-head">
          <span class="step-num">3</span>
          <div>
            <h2>确认费用</h2>
            <p class="muted">确认价格和余额都没问题后，再点击“确认购买”。</p>
          </div>
        </div>
        <div id="quoteBox" class="empty">选好线路后，点击“查看本次费用”。</div>
      </div>
    </div>`;

  const form = document.querySelector("#simpleOrderForm");
  const linesBox = document.querySelector("#linesBox");
  const quoteBox = document.querySelector("#quoteBox");
  const selectedLineBox = document.querySelector("#selectedLineBox");
  const locationInput = form.elements.locationKeyword;
  const locationPicked = document.querySelector("#locationPicked");
  const locationSuggestions = document.querySelector("#locationSuggestions");
  const locationHint = document.querySelector("#locationHint");
  const locationCodePreview = document.querySelector("#locationCodePreview");
  const searchLinesBtn = document.querySelector("#searchLinesBtn");
  const quoteBtn = document.querySelector("#quoteBtn");
  const submitOrderBtn = document.querySelector("#submitOrderBtn");
  let currentQuote = null;
  let latestQuoteSignature = "";
  const searchState = {
    current: 0,
    size: 50,
    total: 0
  };

  const ispText = (value) => ({ 0: "不限", 1: "广播", 2: "原生" }[Number(value)] || "不限");
  const getForm = () => {
    const data = formData(form);
    data.quantity = Number(data.quantity || 1);
    data.days = Number(data.days || 30);
    if (data.ispType === "") delete data.ispType;
    else data.ispType = Number(data.ispType);
    return data;
  };
  const signatureOf = (data) => JSON.stringify({
    lineId: data.lineId || "",
    quantity: Number(data.quantity || 0),
    days: Number(data.days || 0)
  });
  const normalizeKeyword = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, "");
  const findLocationMatches = (keyword) => {
    if (!locationOptions.length) return [];
    const normalized = normalizeKeyword(keyword);
    if (!normalized) return [];
    return locationOptions
      .filter((item) => item.searchText.replace(/\s+/g, "").includes(normalized))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "country" ? -1 : 1;
        return (b.availableCount || 0) - (a.availableCount || 0);
      })
      .slice(0, 8);
  };
  const formatLocationLabel = (countryCode, cityCode) => {
    const country = locationMap.get(countryCode);
    const city = locationMap.get(cityCode);
    if (city) return `${country?.label || countryCode || ""} / ${city.label}`;
    if (country) return country.label;
    return countryCode || cityCode || "未选择";
  };
  const renderLocationPicked = () => {
    const countryCode = form.elements.countryCode.value;
    const cityCode = form.elements.cityCode.value;
    if (!countryCode && !cityCode) {
      locationPicked.className = "picked-chip empty";
      locationPicked.textContent = "还没有选择地区。";
      locationCodePreview.value = "未选择，系统会根据你上面的中文搜索自动带入";
      return;
    }
    locationPicked.className = "picked-chip";
    locationPicked.textContent = `已选地区：${formatLocationLabel(countryCode, cityCode)}`;
    locationCodePreview.value = `国家代码：${countryCode || "-"}${cityCode ? `，城市代码：${cityCode}` : ""}`;
  };
  const applyLocationOption = (item) => {
    if (item.type === "country") {
      form.elements.countryCode.value = item.code;
      form.elements.cityCode.value = "";
      locationInput.value = item.label;
    } else {
      form.elements.countryCode.value = item.countryCode || "";
      form.elements.cityCode.value = item.code;
      locationInput.value = item.label;
    }
    locationSuggestions.className = "suggestion-list empty";
    locationSuggestions.textContent = "已选择地区。";
    renderLocationPicked();
    resetQuote("地区已变更，请重新查找线路。");
  };
  const autoApplyTypedLocation = () => {
    const matches = findLocationMatches(locationInput.value);
    if (!matches.length) return false;
    applyLocationOption(matches[0]);
    return true;
  };
  const renderLocationSuggestions = (keyword) => {
    if (!locationOptions.length) {
      locationSuggestions.className = "suggestion-list empty";
      locationSuggestions.textContent = "地区词典还在加载，马上就好。你也可以先不选地区，直接搜索线路。";
      return;
    }
    const matches = findLocationMatches(keyword);
    if (!matches.length) {
      locationSuggestions.className = "suggestion-list empty";
      locationSuggestions.textContent = keyword ? "当前库存里没有匹配这个中文地名的地区，可以换一个库存里有的国家或城市再试。" : "输入中文地名后，这里会显示可选地区。";
      return;
    }
    locationSuggestions.className = "suggestion-list";
    locationSuggestions.innerHTML = matches.map((item) => `
      <button type="button" class="suggestion-item" data-location-code="${item.code}">
        <strong>${escapeHtml(item.label)}</strong>
        <span>${item.type === "country" ? "国家/地区" : "城市/可用区"}${item.countryCode && item.type !== "country" ? ` · ${escapeHtml(locationMap.get(item.countryCode)?.label || item.countryCode)}` : ""}</span>
      </button>`).join("");
    document.querySelectorAll("[data-location-code]").forEach((button) => {
      button.onclick = () => {
        const item = locationMap.get(button.dataset.locationCode);
        if (item) applyLocationOption(item);
      };
    });
  };
  const resetQuote = (message = "你刚刚改了条件，请重新查看本次费用。") => {
    currentQuote = null;
    latestQuoteSignature = "";
    submitOrderBtn.disabled = true;
    quoteBox.className = "empty";
    quoteBox.textContent = message;
  };
  const renderSelectedLine = (line) => {
    selectedLineBox.className = "selected-line";
    selectedLineBox.innerHTML = `
      <div>
        <strong>${escapeHtml(line.businessType || "不限用途")}</strong>
        <div class="muted">${escapeHtml(formatLocationLabel(line.countryCode, line.cityCode))} · ${ispText(line.ispType)} · 库存 ${line.availableCount ?? "-"}</div>
      </div>
      <div class="selected-price">${money(line.effectiveUnitPrice)}/天</div>`;
  };
  const renderQuote = (quote) => {
    currentQuote = quote;
    latestQuoteSignature = signatureOf(getForm());
    submitOrderBtn.disabled = !quote.sufficientBalance;
    quoteBox.className = "quote-box";
    quoteBox.innerHTML = `
      <div class="quote-grid">
        <div class="quote-item"><div class="label">单价</div><div class="value">${money(quote.unitPrice)}</div></div>
        <div class="quote-item"><div class="label">数量 × 时长</div><div class="value">${quote.quantity} × ${quote.days} 天</div></div>
        <div class="quote-item"><div class="label">应付额度</div><div class="value">${money(quote.totalPrice)}</div></div>
        <div class="quote-item"><div class="label">购买后余额</div><div class="value">${money(quote.balanceAfter)}</div></div>
      </div>
      <div class="muted">${quote.sufficientBalance ? "费用已经确认。点击“确认购买”后，系统会立即提交到上游开通。" : "余额不足，请先联系管理员加额度后再回来购买。"}</div>`;
  };
  const runSearch = async (page = 0) => {
    if (!form.elements.countryCode.value && !form.elements.cityCode.value && locationInput.value.trim()) autoApplyTypedLocation();
    resetQuote("请先选线路，再查看本次费用。");
    form.elements.lineId.value = "";
    quoteBtn.disabled = true;
    selectedLineBox.className = "selected-line empty";
    selectedLineBox.textContent = "还没有选择线路。";
    linesBox.className = "line-grid empty";
    linesBox.textContent = "正在帮你查找可购买线路...";
    const data = getForm();
    searchState.current = page;
    const result = await api("/api/catalog/lines", { method: "POST", body: JSON.stringify({ ...data, current: page, size: searchState.size }) });
    searchState.total = Number(result.total || 0);
    renderLines(result);
  };
  const renderLines = (result) => {
    const records = result.records || [];
    const orderable = records.filter((line) => line.availableForOrder);
    if (!orderable.length) {
      linesBox.className = "empty";
      const availableBusiness = businessTypes.map((item) => item.name).join("、");
      linesBox.textContent = `这组条件下暂时没有可购买线路。你可以换一个用途、国家或 IP 类型再试。当前库存里的用途有：${availableBusiness || "暂无"}`;
      return;
    }
    linesBox.className = "line-grid";
    linesBox.innerHTML = orderable.map((line) => `
      <article class="line-card">
        <div class="line-card-top">
          <div>
            <h3>${escapeHtml(line.businessType || "不限用途")}</h3>
            <p>${escapeHtml(formatLocationLabel(line.countryCode, line.cityCode))}</p>
          </div>
          <span class="badge ok">${ispText(line.ispType)}</span>
        </div>
        <div class="line-meta">
          <span>库存 ${line.availableCount ?? "-"}</span>
          <span>${money(line.effectiveUnitPrice)}/天</span>
        </div>
        <button class="primary" type="button"
          data-line-id="${line.lineId}"
          data-business="${line.businessType || ""}"
          data-country="${line.countryCode || ""}"
          data-city="${line.cityCode || ""}"
          data-isp="${line.ispType ?? ""}"
          data-price="${line.effectiveUnitPrice ?? ""}"
          data-stock="${line.availableCount ?? ""}">选择这条线路</button>
      </article>`).join("");
    document.querySelectorAll("[data-line-id]").forEach((button) => {
      button.onclick = () => {
        form.elements.lineId.value = button.dataset.lineId;
        form.elements.businessType.value = button.dataset.business || "";
        form.elements.countryCode.value = button.dataset.country || "";
        form.elements.cityCode.value = button.dataset.city || "";
        form.elements.ispType.value = button.dataset.isp || "";
        locationInput.value = formatLocationLabel(button.dataset.country, button.dataset.city);
        renderLocationPicked();
        renderSelectedLine({
          businessType: button.dataset.business,
          countryCode: button.dataset.country,
          cityCode: button.dataset.city,
          ispType: button.dataset.isp,
          availableCount: button.dataset.stock,
          effectiveUnitPrice: button.dataset.price
        });
        quoteBtn.disabled = false;
        resetQuote("已选择线路，请继续查看本次费用。");
      };
    });
    const totalPages = Math.max(1, Math.ceil(Number(result.total || orderable.length) / Number(result.size || searchState.size)));
    const pager = document.createElement("div");
    pager.className = "pager-bar";
    pager.innerHTML = `
      <span class="muted">共 ${result.total} 条结果，当前第 ${Number(result.current) + 1} / ${totalPages} 页</span>
      <div class="toolbar">
        <button type="button" id="prevPageBtn" ${Number(result.current) <= 0 ? "disabled" : ""}>上一页</button>
        <button type="button" id="nextPageBtn" ${Number(result.current) >= totalPages - 1 ? "disabled" : ""}>下一页</button>
      </div>`;
    linesBox.append(pager);
    document.querySelector("#prevPageBtn")?.addEventListener("click", async () => {
      try {
        await runSearch(Math.max(0, Number(result.current) - 1));
      } catch (error) {
        toast(error.message, true);
      }
    });
    document.querySelector("#nextPageBtn")?.addEventListener("click", async () => {
      try {
        await runSearch(Number(result.current) + 1);
      } catch (error) {
        toast(error.message, true);
      }
    });
  };

  form.querySelectorAll("input,select").forEach((node) => {
    if (!["lineId", "locationKeyword", "countryCode", "cityCode"].includes(node.name)) {
      node.addEventListener("input", () => resetQuote());
      node.addEventListener("change", () => resetQuote());
    }
  });

  locationInput.addEventListener("input", () => {
    form.elements.countryCode.value = "";
    form.elements.cityCode.value = "";
    renderLocationPicked();
    renderLocationSuggestions(locationInput.value);
    resetQuote("地区已变更，请重新查找线路。");
  });
  locationInput.addEventListener("blur", () => {
    if (!form.elements.countryCode.value && !form.elements.cityCode.value && locationInput.value.trim()) {
      autoApplyTypedLocation();
    }
  });
  renderLocationPicked();

  Promise.resolve()
    .then(() => api("/api/catalog/location-options"))
    .then((options) => {
      locationOptions = options;
      locationMap = new Map(locationOptions.map((item) => [item.code, item]));
      locationHint.textContent = `当前可售国家/地区：${inventoryCountries.map((code) => locationMap.get(code)?.label || code).join("、") || "暂无库存"}`;
      if (locationInput.value.trim()) renderLocationSuggestions(locationInput.value);
      else {
        locationSuggestions.className = "suggestion-list empty";
        locationSuggestions.textContent = "输入中文地名后，这里会显示可选地区。";
      }
    })
    .catch(() => {
      locationSuggestions.className = "suggestion-list empty";
      locationSuggestions.textContent = "地区词典加载稍慢。你可以先直接搜索线路，或稍后再试中文地名。";
    });

  searchLinesBtn.onclick = async () => {
    await withButtonBusy(searchLinesBtn, "正在查询...", async () => {
      try {
        await runSearch(0);
      } catch (error) {
        linesBox.className = "empty";
        linesBox.textContent = error.message;
        toast(error.message, true);
      }
    });
  };

  quoteBtn.onclick = async () => {
    await withButtonBusy(quoteBtn, "正在计算...", async () => {
      try {
        const data = getForm();
        if (!data.lineId) {
          toast("请先选择一条线路", true);
          return;
        }
        const quote = await api("/api/orders/quote", { method: "POST", body: JSON.stringify(data) });
        renderQuote(quote);
      } catch (error) {
        resetQuote(error.message);
        toast(error.message, true);
      }
    });
  };

  form.onsubmit = async (event) => {
    event.preventDefault();
    const data = getForm();
    if (!currentQuote || latestQuoteSignature !== signatureOf(data)) {
      resetQuote("请先查看当前选择的费用。");
      toast("请先查看本次费用", true);
      return;
    }
    if (!currentQuote.sufficientBalance) {
      toast("余额不足，请联系管理员划拨额度", true);
      return;
    }
    await withButtonBusy(submitOrderBtn, "正在提交...", async () => {
      try {
        const order = await api("/api/orders", { method: "POST", body: JSON.stringify(data) });
        state.user = await api("/api/me");
        renderShell();
        toast(`订单已提交：${order.id}`);
        state.view = "orders";
        renderShell();
        await ordersView();
      } catch (error) {
        toast(error.message, true);
      }
    });
  };
}

async function ordersView() {
  setTitle("订单记录", "这里会显示你每一笔购买现在进行到哪一步了。");
  const orders = await api("/api/orders");
  if (!orders.length) {
    document.querySelector("#view").innerHTML = `<div class="panel empty">你还没有购买记录，先去“挑选线路”买第一单。</div>`;
    return;
  }
  document.querySelector("#view").innerHTML = `
    <div class="record-grid">
      ${orders.map((order) => `
        <article class="panel record-card">
          <div class="record-head">
            <div>
              <h2>${escapeHtml(order.skuName || "线路订单")}</h2>
              <p class="muted">${humanTime(order.createdAt)}</p>
            </div>
            ${statusBadge(order.status)}
          </div>
          <div class="record-meta">
            <span>数量 ${order.quantity}</span>
            <span>时长 ${order.days} 天</span>
            <span>总费用 ${money(order.totalPrice)}</span>
          </div>
          <div class="record-copy">
            <div><strong>订单编号：</strong>${escapeHtml(order.id)}</div>
            <div><strong>上游订单号：</strong>${escapeHtml(order.upstream?.orderNo || "-")}</div>
          </div>
          ${order.error ? `<div class="inline-tip danger"><strong>失败原因：</strong>${escapeHtml(order.error)}</div>` : ""}
          ${order.status === "completed" ? `<div class="inline-tip">这笔订单已经开通完成，可以去“我的代理”查看连接信息。</div>` : ""}
        </article>`).join("")}
    </div>`;
}

async function instancesView() {
  setTitle("我的代理", "这里就是已经开通好的代理。复制地址、账号和密码后就能去使用。");
  const items = await api("/api/instances");
  document.querySelector("#view").innerHTML = `
    <div class="panel">
      <div class="action-strip">
        <div class="toolbar">
          <button class="primary" id="changeIpBtn">更换所选线路 IP</button>
          <button id="renewBtn">续费所选线路</button>
          <button id="credBtn">更新登录账号密码</button>
        </div>
        <div class="toolbar">
          <input class="compact" id="renewDays" type="number" min="30" step="30" value="30" title="续费天数" />
          <input class="compact" id="proxyUser" placeholder="新代理用户名" />
          <input class="compact" id="proxyPass" placeholder="新代理密码" />
        </div>
      </div>
      <div class="inline-tip">小提示：先看“到期时间”；如果快到期了，先续费再继续使用会更稳妥。</div>
      <div class="proxy-grid">
        ${items.length ? items.map((item) => `
          <article class="proxy-card">
            <label class="proxy-select">
              <input type="checkbox" data-proxy="${item.proxyId}" />
              <span>选择这条代理</span>
            </label>
            <div class="record-head">
              <div>
                <h2>${escapeHtml(item.skuName || "已开通代理")}</h2>
                <p class="muted">${escapeHtml(`${item.countryCode || ""} ${item.cityCode || ""}`.trim() || "地区未标注")} · ${instanceStatusText(item.status)}</p>
              </div>
              ${statusBadge(item.status)}
            </div>
            <div class="proxy-main">
              <div class="proxy-block">
                <div class="label">连接地址</div>
                <div class="value">${escapeHtml(`${item.ip || "-"}:${item.port || "-"}`)}</div>
                <button class="copy-btn" type="button" data-copy-text="${escapeHtml(`${item.ip || ""}:${item.port || ""}`)}" data-copy-label="已复制连接地址">复制地址</button>
              </div>
              <div class="proxy-block">
                <div class="label">登录账号</div>
                <div class="value">${escapeHtml(item.proxyUsername || "-")}</div>
                <button class="copy-btn" type="button" data-copy-text="${escapeHtml(item.proxyUsername || "")}" data-copy-label="已复制账号">复制账号</button>
              </div>
              <div class="proxy-block">
                <div class="label">登录密码</div>
                <div class="value">${escapeHtml(item.proxyPassword || "-")}</div>
                <button class="copy-btn" type="button" data-copy-text="${escapeHtml(item.proxyPassword || "")}" data-copy-label="已复制密码">复制密码</button>
              </div>
              <div class="proxy-block">
                <div class="label">到期时间</div>
                <div class="value">${humanTime(item.expiresAt)}</div>
              </div>
            </div>
            <div class="record-copy muted">代理编号：${escapeHtml(item.proxyId || "-")}</div>
          </article>`).join("") : '<div class="empty">你还没有已开通的代理，先去“挑选线路”买第一单。</div>'}
      </div>
    </div>`;
  document.querySelectorAll("[data-copy-text]").forEach((button) => {
    button.onclick = () => copyText(button.dataset.copyText || "", button.dataset.copyLabel || "已复制");
  });
  const selected = () => [...document.querySelectorAll("[data-proxy]:checked")].map((node) => node.dataset.proxy);
  const changeIpBtn = document.querySelector("#changeIpBtn");
  const renewBtn = document.querySelector("#renewBtn");
  const credBtn = document.querySelector("#credBtn");
  changeIpBtn.onclick = async () => {
    if (!selected().length) {
      toast("请先勾选一条代理", true);
      return;
    }
    await withButtonBusy(changeIpBtn, "提交中...", async () => {
      await api("/api/instances/change-ip", { method: "POST", body: JSON.stringify({ proxyIds: selected(), remark: "user change ip" }) });
      toast("更换 IP 请求已提交");
      await instancesView();
    });
  };
  renewBtn.onclick = async () => {
    if (!selected().length) {
      toast("请先勾选一条代理", true);
      return;
    }
    await withButtonBusy(renewBtn, "提交中...", async () => {
      await api("/api/instances/renew", { method: "POST", body: JSON.stringify({ proxyIds: selected(), days: Number(document.querySelector("#renewDays").value || 1) }) });
      state.user = await api("/api/me");
      renderShell();
      toast("续费请求已提交");
      state.view = "instances";
      renderShell();
      await instancesView();
    });
  };
  credBtn.onclick = async () => {
    if (!selected().length) {
      toast("请先勾选一条代理", true);
      return;
    }
    const username = document.querySelector("#proxyUser").value;
    const password = document.querySelector("#proxyPass").value;
    await withButtonBusy(credBtn, "提交中...", async () => {
      await api("/api/instances/update-credentials", { method: "POST", body: JSON.stringify({ proxyIds: selected(), username, password, random: !username && !password }) });
      toast("账号密码更新请求已提交");
      await instancesView();
    });
  };
}

async function rechargeView() {
  setTitle("余额明细", "每一笔加款、扣款和退款都会记在这里。");
  const items = await api("/api/credits");
  document.querySelector("#view").innerHTML = `
    <div class="grid cols-2">
      <div class="panel">
        <h2>怎么充值余额</h2>
        <p class="muted">请按平台约定的线下方式付款，并联系管理员确认。管理员确认收款后会在后台为你的账号划拨对应额度。</p>
        <p class="muted">额度到账后会显示在右侧流水中，账户余额也会同步更新。</p>
      </div>
      <div class="panel">
        <h2>最近余额变化</h2>
        <div class="record-grid">
          ${items.length ? items.map((item) => `
            <article class="record-card record-card-compact">
              <div class="record-head">
                <div>
                  <h3>${item.amount > 0 ? "余额增加" : "余额扣减"}</h3>
                  <p class="muted">${humanTime(item.createdAt)}</p>
                </div>
                <span class="badge ${item.amount > 0 ? "ok" : "danger"}">${money(item.amount)}</span>
              </div>
              <div class="record-copy"><strong>余额变化：</strong>${money(item.beforeBalance)} -> ${money(item.afterBalance)}</div>
              <div class="record-copy"><strong>原因：</strong>${escapeHtml(item.remark || item.paymentReference || item.source || "-")}</div>
            </article>`).join("") : '<div class="empty">还没有余额记录。</div>'}
        </div>
      </div>
    </div>`;
}

async function adminDashboard() {
  setTitle("管理概览", "平台经营数据和待处理事项。");
  const summary = await api("/api/admin/summary");
  document.querySelector("#view").innerHTML = `
    <div class="grid cols-3">
      <div class="panel stat"><div class="muted">用户数</div><div class="num">${summary.users}</div></div>
      <div class="panel stat"><div class="muted">订单数</div><div class="num">${summary.orders}</div></div>
      <div class="panel stat"><div class="muted">额度流水</div><div class="num">${summary.creditRecords || 0}</div></div>
      <div class="panel stat"><div class="muted">累计划拨</div><div class="num">${money(summary.totalAllocated || 0)}</div></div>
      <div class="panel stat"><div class="muted">启用 SKU</div><div class="num">${summary.activeSkus}</div></div>
    </div>`;
}

async function upstream() {
  setTitle("上游凭据", "管理 IPIPD API 凭据和模式。");
  const config = await api("/api/admin/upstream");
  document.querySelector("#view").innerHTML = `
    <div class="panel">
      <form id="upstreamForm" class="form-grid">
        <div class="field"><label>模式</label><select name="mode"><option value="mock">mock</option><option value="live">live</option></select></div>
        <div class="field"><label>API Base URL</label><input name="baseUrl" value="${escapeHtml(config.baseUrl)}" /></div>
        <div class="field"><label>AppId</label><input name="appId" value="${escapeHtml(config.appId)}" /></div>
        <div class="field"><label>AppSecret</label><input name="appSecret" value="${escapeHtml(config.appSecret)}" /></div>
        <div class="field"><label>平台账号</label><input name="username" value="${escapeHtml(config.username || "")}" /></div>
        <div class="field"><label>平台密码</label><input name="password" type="password" value="${escapeHtml(config.password || "")}" /></div>
        <div class="span-3 toolbar">
          <button class="primary">保存</button>
          <button type="button" id="testAccount">查询上游账户</button>
        </div>
      </form>
    </div>
    <div class="panel" style="margin-top:14px"><pre id="upstreamResult" class="muted"></pre></div>`;
  document.querySelector("[name=mode]").value = config.mode;
  document.querySelector("#upstreamForm").onsubmit = async (event) => {
    event.preventDefault();
    await api("/api/admin/upstream", { method: "PUT", body: JSON.stringify(formData(event.currentTarget)) });
    toast("上游配置已保存");
  };
  document.querySelector("#testAccount").onclick = async () => {
    const account = await api("/api/admin/upstream/account");
    document.querySelector("#upstreamResult").textContent = JSON.stringify(account, null, 2);
  };
}

async function users() {
  setTitle("用户管理", "修改密码、调整余额、禁用账号和设置用户 SKU 覆盖价。");
  const [usersList, pricesList] = await Promise.all([api("/api/admin/users"), api("/api/admin/prices")]);
  document.querySelector("#view").innerHTML = `<div class="panel">${table(usersList, ["用户", "角色", "余额", "状态", "操作", "价格覆盖"], (user) => [
    `${user.username}<br><span class="muted">${user.id}</span>`,
    user.role,
    money(user.balance),
    statusBadge(user.status),
    `<div class="row-actions">
      <input class="compact" id="bal-${user.id}" type="number" step="0.01" placeholder="加减款" />
      <input class="compact" id="pwd-${user.id}" type="text" placeholder="新密码" />
      <button data-user-action="save" data-id="${user.id}">保存</button>
      <button data-user-action="toggle" data-id="${user.id}">${user.status === "disabled" ? "启用" : "禁用"}</button>
    </div>`,
    `<div class="row-actions">
      <select id="sku-${user.id}">${pricesList.map((p) => `<option value="${p.skuKey}">${p.name}</option>`).join("")}</select>
      <input class="compact" id="price-${user.id}" type="number" step="0.01" placeholder="覆盖价" />
      <button data-user-action="price" data-id="${user.id}">设置</button>
      <span class="muted">${Object.keys(user.priceOverrides || {}).length} 项</span>
    </div>`
  ])}</div>`;
  document.querySelectorAll("[data-user-action]").forEach((button) => {
    button.onclick = async () => {
      const id = button.dataset.id;
      const action = button.dataset.userAction;
      const user = usersList.find((item) => item.id === id);
      if (action === "price") {
        await api("/api/admin/users/prices", {
          method: "PUT",
          body: JSON.stringify({ userId: id, skuKey: document.querySelector(`#sku-${cssId(id)}`).value, price: document.querySelector(`#price-${cssId(id)}`).value })
        });
      } else {
        await api("/api/admin/users", {
          method: "PUT",
          body: JSON.stringify({
            id,
            status: action === "toggle" ? (user.status === "disabled" ? "active" : "disabled") : user.status,
            password: document.querySelector(`#pwd-${cssId(id)}`).value,
            adjustBalance: Number(document.querySelector(`#bal-${cssId(id)}`).value || 0)
          })
        });
      }
      toast("用户已更新");
      await users();
    };
  });
}

async function usersV2() {
  setTitle("用户管理", "创建新用户，修改密码，调整余额，控制启用状态和专属价格。");
  const [usersList, pricesList] = await Promise.all([api("/api/admin/users"), api("/api/admin/prices")]);
  document.querySelector("#view").innerHTML = `
    <div class="panel">
      <h2>创建新用户</h2>
      <form id="createUserFormV2" class="form-grid">
        <div class="field"><label>用户名</label><input name="username" minlength="3" required /></div>
        <div class="field"><label>密码</label><input name="password" minlength="6" required /></div>
        <div class="field"><label>角色</label><select name="role"><option value="user">普通用户</option><option value="admin">管理员</option></select></div>
        <button class="primary span-3">创建用户</button>
      </form>
    </div>
    <div class="panel" style="margin-top:14px">
      ${table(usersList, ["用户", "角色", "余额", "状态", "操作", "价格覆盖"], (user) => [
        `${user.username}<br><span class="muted">${user.id}</span>`,
        user.role,
        money(user.balance),
        statusBadge(user.status),
        `<div class="row-actions">
          <input class="compact" id="bal2-${user.id}" type="number" step="0.01" placeholder="加减余额" />
          <input class="compact" id="pwd2-${user.id}" type="text" placeholder="新密码" />
          <button data-user2-action="save" data-id="${user.id}">保存</button>
          <button data-user2-action="toggle" data-id="${user.id}">${user.status === "disabled" ? "启用" : "禁用"}</button>
        </div>`,
        `<div class="row-actions">
          <select id="sku2-${user.id}">${pricesList.map((p) => `<option value="${p.skuKey}">${p.name}</option>`).join("")}</select>
          <input class="compact" id="price2-${user.id}" type="number" step="0.01" placeholder="覆盖价" />
          <button data-user2-action="price" data-id="${user.id}">设置</button>
          <span class="muted">${Object.keys(user.priceOverrides || {}).length} 项</span>
        </div>`
      ])}
    </div>`;
  document.querySelector("#createUserFormV2").onsubmit = async (event) => {
    event.preventDefault();
    try {
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
      toast("新用户已创建");
      await usersV2();
    } catch (error) {
      toast(error.message, true);
    }
  };
  document.querySelectorAll("[data-user2-action]").forEach((button) => {
    button.onclick = async () => {
      const id = button.dataset.id;
      const action = button.dataset.user2Action;
      const user = usersList.find((item) => item.id === id);
      if (action === "price") {
        await api("/api/admin/users/prices", {
          method: "PUT",
          body: JSON.stringify({ userId: id, skuKey: document.querySelector(`#sku2-${cssId(id)}`).value, price: document.querySelector(`#price2-${cssId(id)}`).value })
        });
      } else {
        await api("/api/admin/users", {
          method: "PUT",
          body: JSON.stringify({
            id,
            status: action === "toggle" ? (user.status === "disabled" ? "active" : "disabled") : user.status,
            password: document.querySelector(`#pwd2-${cssId(id)}`).value,
            adjustBalance: Number(document.querySelector(`#bal2-${cssId(id)}`).value || 0)
          })
        });
      }
      toast("用户已更新");
      await usersV2();
    };
  });
}

async function prices() {
  setTitle("价格管理", "管理上游线路映射出来的 SKU 和销售价。");
  const items = await api("/api/admin/prices");
  document.querySelector("#view").innerHTML = `
    <div class="panel">
      <div class="toolbar" style="margin-bottom:12px">
        <button class="primary" id="syncLines">同步上游线路</button>
      </div>
      ${table(items, ["SKU", "名称", "基础", "上游/销售", "状态", "操作"], (item) => [
        item.skuKey,
        `<input id="name-${cssId(item.skuKey)}" value="${escapeHtml(item.name)}" />`,
        `${item.businessType} · ${item.countryCode} · ${item.cityCode || "*"} · ${item.ispType} · ${item.tag}`,
        `<div class="row-actions"><input class="compact" id="up-${cssId(item.skuKey)}" type="number" step="0.01" value="${item.upstreamUnitPrice}" /><input class="compact" id="sale-${cssId(item.skuKey)}" type="number" step="0.01" value="${item.unitPrice}" /></div>`,
        statusBadge(item.active ? "active" : "disabled"),
        `<button data-price-save="${item.skuKey}">保存</button>`
      ])}
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>新增 SKU</h2>
      <form id="priceForm" class="form-grid">
        <div class="field"><label>业务类型</label><input name="businessType" value="WEB" /></div>
        <div class="field"><label>国家代码</label><input name="countryCode" value="USA" /></div>
        <div class="field"><label>可用区/城市</label><input name="cityCode" /></div>
        <div class="field"><label>IP 类型</label><select name="ispType"><option value="1">广播</option><option value="2">原生</option><option value="0">不限</option></select></div>
        <div class="field"><label>标签</label><input name="tag" value="STANDARD" /></div>
        <div class="field"><label>名称</label><input name="name" /></div>
        <div class="field"><label>上游价/天</label><input name="upstreamUnitPrice" type="number" step="0.01" value="0" /></div>
        <div class="field"><label>销售价/天</label><input name="unitPrice" type="number" step="0.01" value="1" /></div>
        <div class="field"><label>币种</label><input name="currency" value="CNY" /></div>
        <button class="primary span-3">保存 SKU</button>
      </form>
    </div>`;
  document.querySelector("#syncLines").onclick = async () => {
    await api("/api/admin/prices/sync-lines", { method: "POST" });
    toast("线路同步完成");
    await prices();
  };
  document.querySelectorAll("[data-price-save]").forEach((button) => {
    button.onclick = async () => {
      const sku = button.dataset.priceSave;
      const item = items.find((p) => p.skuKey === sku);
      await api("/api/admin/prices", {
        method: "PUT",
        body: JSON.stringify({
          ...item,
          name: document.querySelector(`#name-${cssId(sku)}`).value,
          upstreamUnitPrice: Number(document.querySelector(`#up-${cssId(sku)}`).value || 0),
          unitPrice: Number(document.querySelector(`#sale-${cssId(sku)}`).value || 0)
        })
      });
      toast("价格已保存");
      await prices();
    };
  });
  document.querySelector("#priceForm").onsubmit = async (event) => {
    event.preventDefault();
    const data = formData(event.currentTarget);
    data.ispType = Number(data.ispType);
    data.upstreamUnitPrice = Number(data.upstreamUnitPrice);
    data.unitPrice = Number(data.unitPrice);
    await api("/api/admin/prices", { method: "PUT", body: JSON.stringify(data) });
    toast("SKU 已保存");
    await prices();
  };
}

async function adminOrders() {
  setTitle("订单管理", "查看全部订单并调整状态或备注。");
  const items = await api("/api/admin/orders");
  document.querySelector("#view").innerHTML = `<div class="panel">${table(items, ["订单", "用户", "SKU", "金额", "状态", "备注"], (order) => [
    `${order.id}<br><span class="muted">${order.createdAt}</span>`,
    order.username,
    order.skuName,
    money(order.totalPrice),
    `<select id="ost-${order.id}"><option>processing</option><option>completed</option><option>upstream_failed</option><option>cancelled</option></select><button data-order="${order.id}">保存</button>`,
    `<input id="note-${order.id}" value="${escapeHtml(order.note || "")}" />`
  ])}</div>`;
  items.forEach((order) => (document.querySelector(`#ost-${cssId(order.id)}`).value = order.status));
  document.querySelectorAll("[data-order]").forEach((button) => {
    button.onclick = async () => {
      const id = button.dataset.order;
      await api("/api/admin/orders", { method: "PUT", body: JSON.stringify({ id, status: document.querySelector(`#ost-${cssId(id)}`).value, note: document.querySelector(`#note-${cssId(id)}`).value }) });
      toast("订单已更新");
      await adminOrders();
    };
  });
}

async function adminInstances() {
  setTitle("实例管理", "查看所有用户的 IPIPD 静态代理实例。");
  const items = await api("/api/admin/instances");
  document.querySelector("#view").innerHTML = `<div class="panel">
    <div class="toolbar" style="margin-bottom:12px">
      <button class="primary" id="syncUpstreamInstances">同步上游已购 IP</button>
    </div>
    ${table(items, ["实例", "用户", "订单", "连接信息", "地区/类型", "到期", "状态"], (item) => [
    `${item.proxyId}<br><span class="muted">${item.skuName || item.skuKey || "-"}</span>`,
    item.username || item.userId,
    item.orderId || "-",
    `${item.ip || "-"}:${item.port || "-"}<br><span class="muted">${item.proxyUsername || "-"} / ${item.proxyPassword || "-"}</span>`,
    `${item.countryCode || ""} ${item.cityCode || ""}<br><span class="muted">${item.ispType ?? "-"}</span>`,
    item.expiresAt || "-",
    statusBadge(item.status)
  ])}
  </div>`;
  document.querySelector("#syncUpstreamInstances").onclick = async () => {
    const result = await api("/api/admin/instances/sync-upstream", { method: "POST" });
    toast(`已同步 ${result.totalRecords} 条上游已购 IP`);
    await adminInstances();
  };
}

async function recharges() {
  setTitle("额度划拨", "用户线下付款后，管理员在这里为用户划拨或扣减额度。");
  const [items, usersList] = await Promise.all([api("/api/admin/credits"), api("/api/admin/users")]);
  document.querySelector("#view").innerHTML = `
    <div class="panel">
      <h2>划拨额度</h2>
      <form id="creditForm" class="form-grid">
        <div class="field">
          <label>用户</label>
          <select name="userId" required>
            ${usersList.filter((user) => user.role !== "admin").map((user) => `<option value="${user.id}">${user.username} · ${money(user.balance)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>金额</label><input name="amount" type="number" step="0.01" required placeholder="正数加额度，负数扣额度" /></div>
        <div class="field"><label>线下付款方式</label><input name="paymentMethod" placeholder="银行转账 / 支付宝 / USDT 等" /></div>
        <div class="field"><label>凭证号</label><input name="paymentReference" placeholder="转账流水号或备注编号" /></div>
        <div class="field span-2"><label>备注</label><input name="remark" placeholder="收款确认、活动赠送、人工扣减等" /></div>
        <button class="primary span-3">确认划拨</button>
      </form>
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>额度流水</h2>
      ${table(items, ["时间", "用户", "金额", "余额变化", "方式/凭证", "操作人", "备注"], (item) => [
        item.createdAt,
        item.username,
        money(item.amount),
        `${money(item.beforeBalance)} → ${money(item.afterBalance)}`,
        `${item.paymentMethod || item.source || "-"}<br><span class="muted">${item.paymentReference || ""}</span>`,
        item.operatorName || "-",
        item.remark || "-"
      ])}
    </div>`;
  document.querySelector("#creditForm").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = formData(event.currentTarget);
      data.amount = Number(data.amount);
      await api("/api/admin/credits/allocate", { method: "POST", body: JSON.stringify(data) });
      toast("额度已划拨");
      await recharges();
    } catch (error) {
      toast(error.message, true);
    }
  };
}

async function rechargesV2() {
  setTitle("收款与入账", "先登记线下收款单，再审核入账，避免重复加款。");
  const [items, receipts, usersList] = await Promise.all([api("/api/admin/credits"), api("/api/admin/receipts"), api("/api/admin/users")]);
  document.querySelector("#view").innerHTML = `
    <div class="panel">
      <h2>创建待审核收款单</h2>
      <form id="creditFormV2" class="form-grid">
        <div class="field">
          <label>用户</label>
          <select name="userId" required>
            ${usersList.filter((user) => user.role !== "admin").map((user) => `<option value="${user.id}">${user.username} · ${money(user.balance)}</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>金额</label><input name="amount" type="number" step="0.01" min="0.01" required placeholder="填写实际收款金额" /></div>
        <div class="field"><label>付款方式</label><input name="paymentMethod" placeholder="银行转账 / 支付宝 / USDT 等" /></div>
        <div class="field"><label>凭证号</label><input name="paymentReference" placeholder="转账流水号或内部备注号" /></div>
        <div class="field span-2"><label>备注</label><input name="remark" placeholder="例如：客户已付款，等待审核入账" /></div>
        <button class="primary span-3">创建待审核收款单</button>
      </form>
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>待审核收款单</h2>
      ${table(receipts.filter((item) => item.status === "pending"), ["创建时间", "用户", "金额", "方式/凭证", "创建人", "备注", "操作"], (item) => [
        item.createdAt,
        item.username,
        money(item.amount),
        `${item.paymentMethod || "-"}<br><span class="muted">${item.paymentReference || ""}</span>`,
        item.createdByName || "-",
        item.remark || "-",
        `<div class="row-actions"><input id="rv2-${item.id}" placeholder="审核备注" /><button data-receipt-approve="${item.id}">通过</button><button class="danger" data-receipt-reject="${item.id}">拒绝</button></div>`
      ])}
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>已处理收款单</h2>
      ${table(receipts.filter((item) => item.status !== "pending"), ["审核时间", "用户", "金额", "状态", "审核人", "备注"], (item) => [
        item.reviewedAt || "-",
        item.username,
        money(item.amount),
        statusBadge(item.status === "approved" ? "completed" : "upstream_failed"),
        item.reviewedByName || "-",
        item.reviewNote || item.remark || "-"
      ])}
    </div>
    <div class="panel" style="margin-top:14px">
      <h2>余额流水</h2>
      ${table(items, ["时间", "用户", "金额", "余额变化", "方式/凭证", "操作人", "备注"], (item) => [
        item.createdAt,
        item.username,
        money(item.amount),
        `${money(item.beforeBalance)} -> ${money(item.afterBalance)}`,
        `${item.paymentMethod || item.source || "-"}<br><span class="muted">${item.paymentReference || ""}</span>`,
        item.operatorName || "-",
        item.remark || "-"
      ])}
    </div>`;
  document.querySelector("#creditFormV2").onsubmit = async (event) => {
    event.preventDefault();
    try {
      const data = formData(event.currentTarget);
      data.amount = Number(data.amount);
      await api("/api/admin/credits/allocate", { method: "POST", body: JSON.stringify(data) });
      toast("待审核收款单已创建");
      await rechargesV2();
    } catch (error) {
      toast(error.message, true);
    }
  };
  document.querySelectorAll("[data-receipt-approve]").forEach((button) => {
    button.onclick = async () => {
      const id = button.dataset.receiptApprove;
      await api("/api/admin/credits/approve", { method: "POST", body: JSON.stringify({ id, reviewNote: document.querySelector(`#rv2-${cssId(id)}`).value }) });
      toast("收款单已审核入账");
      await rechargesV2();
    };
  });
  document.querySelectorAll("[data-receipt-reject]").forEach((button) => {
    button.onclick = async () => {
      const id = button.dataset.receiptReject;
      await api("/api/admin/credits/reject", { method: "POST", body: JSON.stringify({ id, reviewNote: document.querySelector(`#rv2-${cssId(id)}`).value }) });
      toast("收款单已拒绝");
      await rechargesV2();
    };
  });
}

function table(items, headers, row) {
  if (!items.length) return `<div class="empty">暂无数据</div>`;
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${items.map((item) => `<tr>${row(item).map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function cssId(value) {
  return CSS.escape(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

boot();
