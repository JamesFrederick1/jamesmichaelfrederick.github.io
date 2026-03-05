(function () {
  function parseStooqCsv(text) {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return null;

    const row = lines.length === 1 ? lines[0].split(",") : lines[1].split(",");
    const symbol = row[0] || "";
    const open = Number(row[3]);
    const close = Number(row[6]);

    if (!symbol || !Number.isFinite(close)) return null;

    const delta = Number.isFinite(open) ? close - open : NaN;
    const pct = Number.isFinite(open) && open !== 0 ? (delta / open) * 100 : NaN;

    return { symbol, open, close, delta, pct };
  }

  function format2(n) {
    return Number.isFinite(n) ? n.toFixed(2) : "—";
  }

  async function mountOne(el) {
    const endpoint = el.getAttribute("data-endpoint");
    const symbol = (el.getAttribute("data-symbol") || "NVDA").toUpperCase();

    if (!endpoint) {
      el.textContent = "Missing data-endpoint";
      return;
    }

    el.innerHTML = `
      <div class="stock-widget">
        <div class="stock-top">
          <div class="stock-symbol">${symbol}</div>
          <div class="stock-price stock-muted">—</div>
        </div>
        <div class="stock-sub">
          <div class="stock-muted">Loading…</div>
          <div class="stock-muted"></div>
        </div>
      </div>
    `;

    try {
      const url = `${endpoint.replace(/\/+$/, "")}/?symbol=${encodeURIComponent(symbol)}`;
      const r = await fetch(url, { cache: "no-store" });
      const text = await r.text();
      const data = parseStooqCsv(text);

      if (!data) {
        el.querySelector(".stock-sub").innerHTML = `<div class="stock-muted">No data</div><div></div>`;
        return;
      }

      el.querySelector(".stock-symbol").textContent = data.symbol;
      el.querySelector(".stock-price").textContent = format2(data.close);

      const deltaText = Number.isFinite(data.delta) ? `${data.delta >= 0 ? "+" : ""}${format2(data.delta)}` : "—";
      const pctText = Number.isFinite(data.pct) ? `${data.pct >= 0 ? "+" : ""}${data.pct.toFixed(2)}%` : "";
      const cls = Number.isFinite(data.delta) ? (data.delta >= 0 ? "stock-pos" : "stock-neg") : "stock-muted";

      const sub = el.querySelector(".stock-sub");
      sub.innerHTML = `<div class="${cls}">${deltaText}</div><div class="${cls}">${pctText}</div>`;

    } catch (e) {
      el.querySelector(".stock-sub").innerHTML = `<div class="stock-muted">Fetch failed</div><div></div>`;
      console.error("stocks.js error:", e);
    }
  }

  function boot() {
    document.querySelectorAll('[data-widget="stock"]').forEach(mountOne);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();