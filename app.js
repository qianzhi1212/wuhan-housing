(() => {
  "use strict";

  /* ------------------------------------------------------------------
   * 数据契约：data.js 必须提供 window.HOUSING_DATA，结构如下
   *   { date, source, records[], quality{}, region_counts{}, raw_region_counts{} }
   * 其中 records 每条含 district / community / layout / orientation /
   * area_sqm / total_price_wan / unit_price_yuan / title / url。
   * 若数据含 _preview.preview_only === true，页面进入“示例子集预览”模式：
   * 统计、图表、明细仅来自示例记录，并带有醒目标注；概览与清洗口径中的
   * 全量数字来自完整数据集的元数据（quality / region_counts）。
   * ------------------------------------------------------------------ */

  const $ = id => document.getElementById(id);
  const data = window.HOUSING_DATA;

  if (!data || !Array.isArray(data.records)) {
    const message = "样本数据暂未加载，请刷新页面后重试。";
    const summary = $("filterSummary");
    if (summary) summary.textContent = message;
    const error = $("dataError");
    if (error) { error.textContent = message; error.hidden = false; }
    return;
  }

  const nf = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });
  const NA = "未标注";
  const LOW_N = 5;          // 热力表中“样本量较少”的提示阈值（仅用于版面提示）
  const PAGE_SIZE = 12;
  const NS = "http://www.w3.org/2000/svg";
  const preview = data._preview && data._preview.preview_only === true ? data._preview : null;
  const quality = data.quality || {};

  const labelOf = value => {
    const text = typeof value === "string" ? value.trim() : "";
    return text || NA;
  };
  // 复制记录并补充规范化后的区域/朝向，避免缺失标签导致图表与筛选不一致。
  const rows = data.records.map((record, index) => Object.assign({}, record, {
    __i: index,
    __d: labelOf(record.district),
    __o: labelOf(record.orientation)
  }));

  const state = { district: "", orientation: "", query: "", sort: "default", page: 1 };
  let filtered = [];
  let toastTimer;

  /* ---------- 基础工具 ---------- */
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svgEl = (tag, attrs = {}, text) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const valid = value => typeof value === "number" && Number.isFinite(value) && value > 0;
  const fmt = value => (valid(value) ? nf.format(value) : "—");
  const count = value => (typeof value === "number" && Number.isFinite(value) ? nf.format(value) : "—");
  const percent = share => {
    const p = share * 100;
    return p < 0.1 ? "＜0.1%" : p.toFixed(1) + "%";
  };
  const setText = (id, text) => { const node = $(id); if (node) node.textContent = text; };

  function median(list, key) {
    const values = list.map(r => r[key]).filter(valid).sort((a, b) => a - b);
    const n = values.length;
    return n ? (values[Math.floor(n / 2)] + values[Math.floor((n - 1) / 2)]) / 2 : null;
  }
  function groupBy(list, keyFn) {
    const map = new Map();
    for (const row of list) {
      const key = keyFn(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  }
  function niceTicks(max, target) {
    const safe = max > 0 ? max : 1;
    const rough = safe / target;
    const power = Math.pow(10, Math.floor(Math.log10(rough)));
    const f = rough / power;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
    const top = Math.ceil(safe / step - 1e-9) * step;
    const ticks = [];
    for (let i = 0; i <= Math.round(top / step); i++) ticks.push(Math.round(i * step * 1e6) / 1e6);
    return { ticks, top };
  }
  function empty(container, message) {
    container.replaceChildren(el("div", "empty", message || "当前筛选条件下暂无样本。请放宽关键词，或选择“全部区域”“全部朝向”。"));
  }
  const previewSuffix = () => (preview ? "（示例子集）" : "");

  /* ---------- 图1 区域挂牌单价中位数 ---------- */
  function renderDistrict() {
    const box = $("districtChart");
    const items = [...groupBy(filtered, r => r.__d)]
      .map(([name, list]) => ({ name, n: list.length, med: median(list, "unit_price_yuan") }))
      .filter(d => valid(d.med))
      .sort((a, b) => b.med - a.med || a.name.localeCompare(b.name, "zh-CN"));
    if (!items.length) { box.removeAttribute("aria-label"); return empty(box); }
    const overall = median(filtered, "unit_price_yuan");
    const max = items[0].med;
    box.replaceChildren();
    box.setAttribute("aria-label", "各区域挂牌单价中位数（元/㎡），由高到低：" +
      items.map(d => d.name + " " + nf.format(d.med) + "，样本 " + d.n + " 条").join("；"));

    const key = el("p", "chart-key");
    key.append(el("i", "key-dash"), document.createTextNode("当前筛选的单价中位数 " + fmt(overall)));
    key.setAttribute("aria-hidden", "true");
    const list = el("div", "hbars");
    list.setAttribute("aria-hidden", "true");
    items.forEach(d => {
      const row = el("div", "hbar");
      row.title = d.name + "：单价中位数 " + nf.format(d.med) + " 元/㎡，" + d.n + " 条样本";
      const track = el("span", "hbar-track");
      const fill = el("span", "hbar-fill");
      fill.style.width = (d.med / max * 100) + "%";
      track.append(fill);
      if (valid(overall)) {
        const mark = el("span", "hbar-ref");
        mark.style.left = Math.min(100, overall / max * 100) + "%";
        track.append(mark);
      }
      row.append(el("span", "hbar-label", d.name), track,
        el("span", "hbar-value", nf.format(d.med)), el("span", "hbar-n", "n=" + nf.format(d.n)));
      list.append(row);
    });
    box.append(key, list);
  }

  /* ---------- 图2 朝向构成 ---------- */
  function renderOrientation() {
    const box = $("orientationChart");
    const items = [...groupBy(filtered, r => r.__o)]
      .map(([name, list]) => ({ name, n: list.length }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "zh-CN"));
    if (!items.length) { box.removeAttribute("aria-label"); return empty(box); }
    const total = filtered.length;
    const cls = i => (i < 5 ? "o" + i : "o-rest");
    box.replaceChildren();
    box.setAttribute("aria-label", "样本朝向构成：" +
      items.map(d => d.name + " " + d.n + " 条，占 " + percent(d.n / total)).join("；"));

    const strip = el("div", "strip");
    strip.setAttribute("aria-hidden", "true");
    items.forEach((d, i) => {
      const seg = el("span", "strip-seg " + cls(i));
      seg.style.flexGrow = d.n;
      seg.title = d.name + "：" + d.n + " 条，占 " + percent(d.n / total);
      strip.append(seg);
    });

    const table = el("table", "orient-table");
    table.setAttribute("aria-hidden", "true");
    const body = el("tbody");
    items.forEach((d, i) => {
      const tr = el("tr");
      const name = el("td", "orient-name");
      name.append(el("i", "swatch " + cls(i)), document.createTextNode(d.name));
      tr.append(name, el("td", "num", nf.format(d.n) + " 条"), el("td", "num", percent(d.n / total)));
      tr.title = d.name + "：" + d.n + " 条，占 " + percent(d.n / total);
      body.append(tr);
    });
    table.append(body);
    const sum = el("p", "chart-total", "共 " + nf.format(total) + " 条发布记录，" + items.length + " 种朝向标注");
    sum.setAttribute("aria-hidden", "true");
    box.append(sum, strip, table);
  }

  /* ---------- 图3 面积与总价散点（按容器实际宽度绘制） ---------- */
  function renderScatter() {
    const box = $("scatterChart");
    const pts = filtered.filter(r => valid(r.area_sqm) && valid(r.total_price_wan));
    box.replaceChildren();
    if (!pts.length) { box.__w = 0; return empty(box); }

    const width = Math.max(260, Math.round(box.clientWidth || 620));
    box.__w = width;
    const compact = width < 520;
    const height = compact ? 320 : 390;
    const xs = niceTicks(Math.max(...pts.map(r => r.area_sqm)), compact ? 4 : 6);
    const ys = niceTicks(Math.max(...pts.map(r => r.total_price_wan)), 5);
    const yLabelW = Math.max(...ys.ticks.map(t => nf.format(t).length)) * 7.6;
    const m = { l: Math.round(yLabelW + 16), r: 14, t: 32, b: 50 };
    const sx = v => m.l + v / xs.top * (width - m.l - m.r);
    const sy = v => height - m.b - v / ys.top * (height - m.t - m.b);
    const medX = median(pts, "area_sqm"), medY = median(pts, "total_price_wan");

    const svg = svgEl("svg", {
      width, height, viewBox: "0 0 " + width + " " + height, class: "scatter-svg", role: "img",
      "aria-label": "建筑面积与挂牌总价散点图，共 " + pts.length + " 条记录；面积中位数 " + nf.format(medX) +
        "㎡，总价中位数 " + nf.format(medY) + " 万元"
    });
    ys.ticks.forEach(t => {
      svg.append(svgEl("line", { x1: m.l, x2: width - m.r, y1: sy(t), y2: sy(t), class: t === 0 ? "axis" : "grid" }));
      svg.append(svgEl("text", { x: m.l - 8, y: sy(t) + 4, "text-anchor": "end", class: "tick" }, nf.format(t)));
    });
    xs.ticks.forEach(t => {
      svg.append(svgEl("line", { x1: sx(t), x2: sx(t), y1: height - m.b, y2: height - m.b + 5, class: "axis" }));
      svg.append(svgEl("text", { x: sx(t), y: height - m.b + 20, "text-anchor": "middle", class: "tick" }, nf.format(t)));
    });
    svg.append(svgEl("text", { x: m.l, y: 14, class: "axis-title" }, "挂牌总价（万元）"));
    svg.append(svgEl("text", { x: width - m.r, y: height - 6, "text-anchor": "end", class: "axis-title" }, "建筑面积（㎡）"));

    // 中位数参考线
    svg.append(svgEl("line", { x1: sx(medX), x2: sx(medX), y1: m.t, y2: height - m.b, class: "guide" }));
    svg.append(svgEl("line", { x1: m.l, x2: width - m.r, y1: sy(medY), y2: sy(medY), class: "guide" }));
    const flip = sx(medX) > width * 0.68;
    svg.append(svgEl("text", { x: sx(medX) + (flip ? -6 : 6), y: m.t + 12, "text-anchor": flip ? "end" : "start", class: "guide-label" }, "面积中位数 " + nf.format(medX) + "㎡"));
    svg.append(svgEl("text", { x: width - m.r - 2, y: sy(medY) - 6, "text-anchor": "end", class: "guide-label" }, "总价中位数 " + nf.format(medY) + "万元"));

    const radius = compact ? 2.4 : 2.9;
    const coords = pts.map(r => [sx(r.area_sqm), sy(r.total_price_wan), r]);
    const layer = svgEl("g", { class: "pts" });
    coords.forEach(c => layer.append(svgEl("circle", { cx: c[0].toFixed(1), cy: c[1].toFixed(1), r: radius, class: "pt" })));
    svg.append(layer);
    const ring = svgEl("circle", { r: 6, class: "pt-ring" });
    ring.style.display = "none";
    svg.append(ring);

    const tip = el("div", "tooltip");
    tip.hidden = true;
    const hide = () => { tip.hidden = true; ring.style.display = "none"; };
    box.__hide = hide;
    const show = ev => {
      const rect = svg.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (width / rect.width);
      const py = (ev.clientY - rect.top) * (height / rect.height);
      const reach = ev.pointerType === "touch" ? 22 : 12;
      let best = null, bestD = reach * reach;
      for (const c of coords) {
        const dx = c[0] - px, dy = c[1] - py, d = dx * dx + dy * dy;
        if (d <= bestD) { bestD = d; best = c; }
      }
      if (!best) return hide();
      const r = best[2];
      ring.setAttribute("cx", best[0]);
      ring.setAttribute("cy", best[1]);
      ring.style.display = "";
      tip.replaceChildren(
        el("strong", "", (r.community || "未标注小区") + "　" + r.__d),
        el("span", "", fmt(r.area_sqm) + "㎡　" + fmt(r.total_price_wan) + "万元　" + fmt(r.unit_price_yuan) + "元/㎡")
      );
      tip.hidden = false;
      const left = Math.min(Math.max(4, best[0] - tip.offsetWidth / 2), width - tip.offsetWidth - 4);
      let top = best[1] - tip.offsetHeight - 12;
      if (top < 2) top = best[1] + 14;
      tip.style.left = left + "px";
      tip.style.top = top + "px";
    };
    svg.addEventListener("pointermove", show);
    svg.addEventListener("pointerdown", show);
    svg.addEventListener("pointerleave", ev => { if (ev.pointerType !== "touch") hide(); });
    box.append(svg, tip);
  }

  /* ---------- 图4 单价分布（按容器实际宽度绘制） ---------- */
  function renderHistogram() {
    const box = $("histogramChart");
    const prices = filtered.map(r => r.unit_price_yuan).filter(valid);
    box.replaceChildren();
    if (!prices.length) { box.__w = 0; return empty(box); }

    const edges = [0, 5000, 10000, 15000, 20000, 25000];
    const bins = edges.map((low, i) => ({ low, high: i < edges.length - 1 ? edges[i + 1] : Infinity, n: 0 }));
    prices.forEach(v => {
      for (let i = bins.length - 1; i >= 0; i--) if (v >= bins[i].low) { bins[i].n++; break; }
    });
    const total = prices.length;
    const width = Math.max(260, Math.round(box.clientWidth || 360));
    box.__w = width;
    const height = 330;
    const ys = niceTicks(Math.max(...bins.map(b => b.n)), 4);
    const yLabelW = Math.max(...ys.ticks.map(t => nf.format(t).length)) * 7.6;
    const m = { l: Math.round(yLabelW + 14), r: 6, t: 32, b: 62 };
    const innerW = width - m.l - m.r;
    const barW = innerW / bins.length;
    const sy = v => height - m.b - v / ys.top * (height - m.t - m.b);

    const svg = svgEl("svg", {
      width, height, viewBox: "0 0 " + width + " " + height, class: "hist-svg", role: "img",
      "aria-label": "挂牌单价分布（元/㎡）：" + bins.map(b =>
        (b.high === Infinity ? "25,000 及以上" : b.low === 0 ? "5,000 以下" : nf.format(b.low) + " 至 " + nf.format(b.high)) + " " + b.n + " 条").join("；")
    });
    ys.ticks.forEach(t => {
      svg.append(svgEl("line", { x1: m.l, x2: width - m.r, y1: sy(t), y2: sy(t), class: t === 0 ? "axis" : "grid" }));
      svg.append(svgEl("text", { x: m.l - 8, y: sy(t) + 4, "text-anchor": "end", class: "tick" }, nf.format(t)));
    });
    svg.append(svgEl("text", { x: m.l, y: 14, class: "axis-title" }, "样本数（条）"));
    bins.forEach((b, i) => {
      const x = m.l + i * barW + 2, w = Math.max(1, barW - 4);
      const label = b.high === Infinity ? "25,000 及以上" : (b.low === 0 ? "5,000 以下" : nf.format(b.low) + "–" + nf.format(b.high));
      const rect = svgEl("rect", { x, y: sy(b.n), width: w, height: Math.max(0, height - m.b - sy(b.n)), class: "bar" });
      rect.append(svgEl("title", {}, label + " 元/㎡：" + b.n + " 条，占 " + percent(b.n / total)));
      svg.append(rect);
      svg.append(svgEl("text", { x: x + w / 2, y: sy(b.n) - 6, "text-anchor": "middle", class: "bar-count" }, nf.format(b.n)));
    });
    edges.forEach((e, i) => {
      if (i === 0) return;
      svg.append(svgEl("text", { x: m.l + i * barW, y: height - m.b + 19, "text-anchor": "middle", class: "tick" }, nf.format(e)));
    });
    svg.append(svgEl("text", { x: m.l, y: height - m.b + 19, "text-anchor": "start", class: "tick" }, "0"));
    svg.append(svgEl("text", { x: m.l, y: height - 20, class: "axis-title" }, "挂牌单价（元/㎡）"));
    svg.append(svgEl("text", { x: m.l, y: height - 4, class: "axis-note" }, "最右一组为 25,000 及以上"));
    box.append(svg);
  }

  /* ---------- 图5 区域 × 朝向热力表 ---------- */
  const HEAT_LOW = [234, 242, 245], HEAT_HIGH = [16, 66, 88];
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const luminance = rgb => {
    const [r, g, b] = rgb.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  function renderHeatmap() {
    const box = $("heatmapChart");
    if (!filtered.length) { setText("heatMin", "—"); setText("heatMax", "—"); return empty(box); }
    const districts = [...groupBy(filtered, r => r.__d)].sort((a, b) => a[0].localeCompare(b[0], "zh-CN"));
    const orientations = [...groupBy(filtered, r => r.__o)].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN"));
    const cellMap = groupBy(filtered, r => r.__d + "\u0000" + r.__o);
    const medians = [...cellMap.values()].map(list => median(list, "unit_price_yuan")).filter(valid);
    if (!medians.length) { setText("heatMin", "—"); setText("heatMax", "—"); return empty(box); }
    const min = Math.min(...medians), max = Math.max(...medians);
    setText("heatMin", nf.format(min));
    setText("heatMax", nf.format(max));

    const table = el("table", "heatmap");
    table.style.setProperty("--cols", orientations.length);
    table.append(el("caption", "sr-only", "各区域与朝向的挂牌单价中位数（元/㎡），括号内为样本量，“—”表示无样本"));
    const head = el("thead"), hr = el("tr");
    const corner = el("th", "corner", "区域 \\ 朝向");
    corner.scope = "col";
    hr.append(corner);
    orientations.forEach(([name, list]) => {
      const th = el("th", "col-head");
      th.scope = "col";
      th.append(el("span", "", name), el("small", "", "n=" + nf.format(list.length)));
      hr.append(th);
    });
    head.append(hr);
    table.append(head);

    const body = el("tbody");
    districts.forEach(([district, dList]) => {
      const tr = el("tr");
      const th = el("th", "row-head");
      th.scope = "row";
      th.append(el("span", "", district), el("small", "", "n=" + nf.format(dList.length)));
      tr.append(th);
      orientations.forEach(([orientation]) => {
        const list = cellMap.get(district + "\u0000" + orientation) || [];
        const value = median(list, "unit_price_yuan");
        const td = el("td");
        if (valid(value)) {
          const ratio = max === min ? 0.5 : (value - min) / (max - min);
          const rgb = mix(HEAT_LOW, HEAT_HIGH, ratio);
          td.style.background = "rgb(" + rgb.join(",") + ")";
          const lum = luminance(rgb);
          td.style.color = (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.067) ? "#ffffff" : "#16252d";
          if (list.length < LOW_N) td.className = "low-n";
          td.append(el("span", "cell-value", nf.format(value)), el("small", "cell-n", "(" + list.length + ")"));
          td.title = district + " · " + orientation + " · " + list.length + " 条 · 挂牌单价中位数 " + nf.format(value) + " 元/㎡";
        } else {
          td.className = "na";
          const dash = el("span", "", "—");
          dash.setAttribute("role", "img");
          dash.setAttribute("aria-label", "无样本");
          td.append(dash);
          td.title = district + " · " + orientation + "：无样本";
        }
        tr.append(td);
      });
      body.append(tr);
    });
    table.append(body);
    box.replaceChildren(table);
  }

  /* ---------- 样本明细表 ---------- */
  function sourceUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.hostname === "m.fang.com" && /^\/esf\/wuhan\/\d+_\d+\.html$/.test(url.pathname) ? url.href : null;
    } catch { return null; }
  }
  function cell(cls, text, label, unit) {
    const td = el("td", cls, text);
    td.setAttribute("role", "cell");
    if (label) td.dataset.label = label;
    if (unit) td.dataset.unit = unit;
    return td;
  }
  function pageCount() { return Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)); }

  function renderTable() {
    const body = $("tableBody");
    body.replaceChildren();
    const pages = pageCount();
    state.page = Math.min(Math.max(1, state.page), pages);
    $("tableCount").textContent = nf.format(filtered.length);

    if (!filtered.length) {
      const tr = el("tr");
      tr.setAttribute("role", "row");
      const td = el("td", "empty-row", "当前筛选条件下暂无样本，请调整筛选。");
      td.colSpan = 8;
      td.setAttribute("role", "cell");
      tr.append(td);
      body.append(tr);
    }
    const start = (state.page - 1) * PAGE_SIZE;
    filtered.slice(start, start + PAGE_SIZE).forEach(item => {
      const tr = el("tr");
      tr.setAttribute("role", "row");
      const name = cell("c-name");
      const community = item.community || "未标注小区";
      const title = el("div", "sample-title", community);
      title.title = community;
      const subtitle = el("div", "sample-subtitle", item.title || "");
      subtitle.title = item.title || "";
      name.append(title, subtitle);
      tr.append(
        name,
        cell("c-district", item.__d, "区域"),
        cell("c-layout", item.layout || "—", "户型"),
        cell("num c-area", fmt(item.area_sqm), "建筑面积", "㎡"),
        cell("num c-total", fmt(item.total_price_wan), "挂牌总价", "万元"),
        cell("num c-unit", fmt(item.unit_price_yuan), "挂牌单价", "元/㎡"),
        cell("c-orient", item.__o, "朝向")
      );
      const td = cell("c-source");
      const href = sourceUrl(item.url);
      if (href) {
        const a = el("a", "source-link", "查看原页面");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.setAttribute("aria-label", "查看" + community + "的公开来源页面（新窗口打开）");
        td.append(a);
      } else td.textContent = "—";
      tr.append(td);
      body.append(tr);
    });

    $("pageSummary").textContent = filtered.length
      ? "第 " + nf.format(start + 1) + "–" + nf.format(Math.min(start + PAGE_SIZE, filtered.length)) + " 条，共 " + nf.format(filtered.length) + " 条" + previewSuffix()
      : "共 0 条样本";
    $("pageNumber").textContent = "第 " + state.page + " / " + pages + " 页";
    $("prevPage").disabled = $("firstPage").disabled = state.page === 1;
    $("nextPage").disabled = $("lastPage").disabled = state.page === pages;

    document.querySelectorAll("th[data-sort-key]").forEach(th => {
      const [key, order] = state.sort.split(":");
      th.setAttribute("aria-sort", key === th.dataset.sortKey ? (order === "asc" ? "ascending" : "descending") : "none");
    });
  }

  /* ---------- 清洗口径与区域台账（来自完整数据集的元数据） ---------- */
  function renderQuality() {
    const q = quality;
    const removed = q.signature_duplicates_removed;
    $("duplicateNote").textContent = "同一来源、采集阶段和观察日内，按区域、小区、户型、面积、朝向和总价匹配记录，每组保留最近采集的一条。";

    const input = q.input_records;
    if (typeof input === "number" && input > 0 && typeof q.cleaned_listing_records === "number" && typeof removed === "number") {
      const keptPct = q.cleaned_listing_records / input * 100, removedPct = removed / input * 100;
      $("flowKept").style.width = keptPct + "%";
      $("flowRemoved").style.width = Math.max(removedPct, 0.6) + "%";
      setText("flowRawText", nf.format(input));
      setText("flowKeptText", nf.format(q.cleaned_listing_records));
      setText("flowRemovedText", nf.format(removed));
      $("flowFigure").setAttribute("aria-label", "原始 " + nf.format(input) + " 条记录中，保留 " + nf.format(q.cleaned_listing_records) + " 条，同条件重复剔除 " + nf.format(removed) + " 条");
    } else {
      $("flowFigure").hidden = true;
    }
  }

  /* ---------- 主渲染 ---------- */
  function sortRows(list) {
    if (state.sort === "default") return list;
    const [key, order] = state.sort.split(":");
    const dir = order === "asc" ? 1 : -1;
    return list.slice().sort((a, b) => {
      const av = a[key], bv = b[key], aOk = valid(av), bOk = valid(bv);
      if (aOk && bOk) return (av - bv) * dir || a.__i - b.__i;
      if (aOk) return -1;
      if (bOk) return 1;
      return a.__i - b.__i;
    });
  }
  const safely = fn => { try { fn(); } catch (error) { if (window.console) console.error(error); } };

  function render() {
    const query = state.query.trim().toLocaleLowerCase();
    filtered = sortRows(rows.filter(r =>
      (!state.district || r.__d === state.district) &&
      (!state.orientation || r.__o === state.orientation) &&
      (!query || ((r.community || "") + " " + (r.title || "")).toLocaleLowerCase().includes(query))));

    setText("countMetric", nf.format(filtered.length));
    setText("unitMetric", fmt(median(filtered, "unit_price_yuan")));
    setText("totalMetric", fmt(median(filtered, "total_price_wan")));
    setText("areaMetric", fmt(median(filtered, "area_sqm")));
    const labels = [state.district, state.orientation, state.query.trim() && "关键词：" + state.query.trim()].filter(Boolean);
    $("filterSummary").textContent = (labels.length ? "当前筛选：" + labels.join("，") : "未设筛选，显示全部样本") +
      "；共 " + nf.format(filtered.length) + " 条发布记录" + previewSuffix();
    $("exportButton").disabled = !filtered.length;

    safely(renderDistrict);
    safely(renderOrientation);
    safely(renderScatter);
    safely(renderHistogram);
    safely(renderHeatmap);
    safely(renderTable);
  }

  /* ---------- CSV 导出 ---------- */
  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  }
  function download() {
    const columns = [["community", "小区"], ["district", "区域"], ["layout", "户型"], ["area_sqm", "建筑面积_平方米"],
      ["total_price_wan", "挂牌总价_万元"], ["unit_price_yuan", "挂牌单价_元每平方米"], ["orientation", "朝向"], ["url", "公开来源"]];
    const lines = [columns.map(c => csvCell(c[1])).join(",")];
    filtered.forEach(row => lines.push(columns.map(([key]) => csvCell(row[key])).join(",")));
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = el("a");
    link.href = url;
    link.download = "武汉二手房样本_" + (preview ? "预览子集_" : "") + (data.date || "") + ".csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const toast = $("toast");
    toast.textContent = "已导出 " + filtered.length + " 条筛选样本" + previewSuffix();
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }

  /* ---------- 概览与预览标注 ---------- */
  function formatDate(value) {
    const match = typeof value === "string" && value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    return match ? match[1] + "年" + Number(match[2]) + "月" + Number(match[3]) + "日（北京时间）" : (value ? value + "（北京时间）" : "—");
  }
  function setupOverview() {
    const regionNames = Object.keys(data.region_counts || data.raw_region_counts || {});
    const rawRegionCounts = Object.values(data.raw_region_counts || {});
    const quota = rawRegionCounts.length && rawRegionCounts.every(n => n === rawRegionCounts[0]) ? "，每区 " + rawRegionCounts[0] + " 条" : "";
    const analysisCount = preview && typeof quality.cleaned_listing_records === "number" ? quality.cleaned_listing_records : rows.length;
    setText("observationDate", formatDate(data.date));
    if (data.source) setText("sourceName", data.source);
    setText("regionCount", regionNames.length ? String(regionNames.length) : "—");
    if (regionNames.length) {
      setText("scopeText", "原始样本覆盖 " + regionNames.length + " 个平台区域" + quota + "；规则去重后用于分析的记录为 " + nf.format(analysisCount) + " 条。");
    }
  }
  function setupPreview() {
    if (!preview) return;
    document.body.dataset.preview = "true";
    const shown = preview.rows_in_this_file ?? rows.length;
    const full = preview.full_analysis_records ?? quality.cleaned_listing_records;
    setText("previewText", "　当前只加载了示例子集：" + nf.format(shown) + " 条记录" +
      (typeof full === "number" ? "（完整分析样本为 " + nf.format(full) + " 条）" : "") +
      "，按区域、朝向和数值极端值挑选，不是随机样本。“从样本看挂牌特征”和“样本明细”中的统计、图表与明细仅用于检查版式和交互，不代表研究结论；" +
      "“研究概览”和“清洗与口径”中的全量数字来自完整数据集的元数据。");
    $("previewBanner").hidden = false;
    document.querySelectorAll(".preview-tag").forEach(tag => { tag.hidden = false; });
    document.title = "【示例子集预览】" + document.title;
  }

  /* ---------- 事件 ---------- */
  function buildFilters() {
    const dCount = groupBy(rows, r => r.__d), oCount = groupBy(rows, r => r.__o);
    [...dCount.keys()].sort((a, b) => a.localeCompare(b, "zh-CN")).forEach(v => $("districtFilter").append(new Option(v, v)));
    [...oCount].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-CN")).forEach(([v]) => $("orientationFilter").append(new Option(v, v)));
    $("districtFilter").addEventListener("change", e => { state.district = e.target.value; state.page = 1; render(); });
    $("orientationFilter").addEventListener("change", e => { state.orientation = e.target.value; state.page = 1; render(); });
    let searchTimer;
    $("searchInput").addEventListener("input", e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = e.target.value; state.page = 1; render(); }, 140);
    });
    $("filters").addEventListener("submit", e => e.preventDefault());
    $("filters").addEventListener("reset", () => {
      clearTimeout(searchTimer);
      Object.assign(state, { district: "", orientation: "", query: "", page: 1 });
      setTimeout(render, 0);
    });
  }
  function setSort(value) {
    state.sort = value;
    $("sortSelect").value = value;
    state.page = 1;
    render();
  }
  function wireTable() {
    $("sortSelect").addEventListener("change", e => setSort(e.target.value));
    document.querySelectorAll(".sort-btn").forEach(btn => btn.addEventListener("click", () => {
      const key = btn.dataset.key, [current, order] = state.sort.split(":");
      setSort(current !== key ? key + ":asc" : order === "asc" ? key + ":desc" : "default");
    }));
    $("firstPage").addEventListener("click", () => { state.page = 1; renderTable(); });
    $("prevPage").addEventListener("click", () => { state.page--; renderTable(); });
    $("nextPage").addEventListener("click", () => { state.page++; renderTable(); });
    $("lastPage").addEventListener("click", () => { state.page = pageCount(); renderTable(); });
    $("exportButton").addEventListener("click", download);
  }
  function wireChrome() {
    const links = [...document.querySelectorAll("#siteNav a")];
    const targets = links.map(a => document.getElementById(a.hash.slice(1))).filter(Boolean);
    let ticking = false;
    const update = () => {
      ticking = false;
      let current = targets[0];
      targets.forEach(t => { if (t.getBoundingClientRect().top <= 140) current = t; });
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = targets[targets.length - 1];
      links.forEach(a => {
        const on = current && a.hash === "#" + current.id;
        a.classList.toggle("active", !!on);
        if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
      });
    };
    window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();

    document.addEventListener("pointerdown", e => {
      const box = $("scatterChart");
      if (box.__hide && !box.contains(e.target)) box.__hide();
    });
    // 图3、图4按容器像素宽度绘制，宽度变化时重绘，保证手机上文字仍可读。
    if ("ResizeObserver" in window) {
      let frame;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const s = $("scatterChart"), h = $("histogramChart");
          if (s.__w && Math.abs(s.clientWidth - s.__w) >= 1) safely(renderScatter);
          if (h.__w && Math.abs(h.clientWidth - h.__w) >= 1) safely(renderHistogram);
        });
      });
      observer.observe($("scatterChart"));
      observer.observe($("histogramChart"));
    }
  }

  setupOverview();
  setupPreview();
  renderQuality();
  buildFilters();
  wireTable();
  wireChrome();
  render();
})();
