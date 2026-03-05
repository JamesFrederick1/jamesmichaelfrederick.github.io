// /shared/stocks.js
(function () {
  function parseStooqCsv(text) {
    const lines = text
      .trim()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return null;

    // Case A: worker returns ONLY the data line (no header)
    // Example:
    // NVDA.US,20260303,220019,178.49,180.9,176.92,180.05,177320743,
    const looksLikeDataOnly =
      lines.length === 1 &&
      /^[A-Z0-9._-]+,(\d{8}),(\d{6}),/.test(lines[0].toUpperCase());

    if (looksLikeDataOnly) {
      const row = lines[0].split(",").map((s) => s.trim());
      const symbol = row[0] || "";
      const open = Number(row[3]);
      const close = Number(row[6]);

      if (!symbol || !Number.isFinite(close)) return null;

      const delta = Number.isFinite(open) ? close - open : NaN;
      const pct = Number.isFinite(open) && open !== 0 ? (delta / open) * 100 : NaN;

      return { symbol, open, close, delta, pct };
    }

    // Case B: normal CSV with header + data
    if (lines.length < 2) return null;

    const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
    const row = lines[1].split(",").map((s) => s.trim());
    const idx = (name) => header.indexOf(name);

    const symbol = row[idx("symbol")] || row[0];
    const open = Number(row[idx("open")] ?? row[3]);
    const close = Number(row[idx("close")] ?? row[6]);

    if (!symbol || !Number.isFinite(close)) return null;

    const delta = Number.isFinite(open) ? close - open : NaN;
    const pct = Number.isFinite(open) && open !== 0 ? (delta / open) * 100 : NaN;

    return { symbol, open, close, delta, pct };
  }

  function format2(n) {
    return Number.isFinite(n) ? n.toFixed(2) : "—";
  }

  function ensureStyles() {
    if (document.getElementById("stocks-widget-style")) return;
    const s = document.createElement("style");
    s.id = "stocks-widget-style";
    s.textContent = `
      .stock-widget{
        position: fixed;
        left: 12px;
        bottom: 12px;
        z-index: 9999;
        background: rgba(255,255,255,0.92);
        border: 1px solid #ccc;
        border-radius: 10px;
        padding: 10px 12px;
        font-family: "Segoe UI", sans-serif;
        color: #222;
        backdrop-filter: blur(6px);
        min-width: 180px;
      }
      .stock-top{
        display:flex;
        align-items:baseline;
        justify-content:space-between;
        gap: 12px;
      }
      .stock-symbol{
        font-weight: 700;
        font-size: 0.95rem;
      }
      .stock-price{
        font-weight: 700;
        font-size: 1.05rem;
      }
      .stock-sub{
        margin-top: 4px;
        font-size: 0.85rem;
        opacity: 0.85;
        display:flex;
        justify-content:space-between;
        gap: 10px;
      }
      .stock-pos{ }
      .stock-neg{ }
      .stock-muted{ opacity: 0.7; }
    `;
    document.head.appendChild(s);
  }

  async function mountOne(el) {
    const endpoint = el.getAttribute("data-endpoint");
    const symbol = (el.getAttribute("data-symbol") || "NVDA").toUpperCase();

    if (!endpoint) {
      el.textContent = "Missing data-endpoint";
      return;
    }

    ensureStyles();

    // Render skeleton immediately
    el.innerHTML = `
      <div class="stock-widget fade-in2">
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

      // Helpful debug if it ever fails again
      // console.log("stock raw:", text);

      const data = parseStooqCsv(text);
      if (!data) {
        el.querySelector(".stock-sub").innerHTML = `<div class="stock-muted">No data</div><div></div>`;
        return;
      }

      // Show NVDA.US if that's what you got back
      el.querySelector(".stock-symbol").textContent = data.symbol;

      el.querySelector(".stock-price").textContent = format2(data.close);

      const deltaText = Number.isFinite(data.delta)
        ? `${data.delta >= 0 ? "+" : ""}${format2(data.delta)}`
        : "—";

      const pctText = Number.isFinite(data.pct)
        ? `${data.pct >= 0 ? "+" : ""}${data.pct.toFixed(2)}%`
        : "";

      const cls = Number.isFinite(data.delta)
        ? (data.delta >= 0 ? "stock-pos" : "stock-neg")
        : "stock-muted";

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