// README
// Папка расширения, положи на GitHub Pages / Netlify как статический сайт.
// Файлы:
//  - manifest.json
//  - panel.html
//  - panel.js
//  - obr.js (общая логика)
//  - styles.css (минимальная стилизация)
// После деплоя возьми URL до manifest.json и добавь в Owlbear Rodeo: Profile → Add Extension.

/* ========================
   manifest.json
   ======================== */
{
  "name": "Hex Explorer",
  "version": "0.1.0",
  "manifest_version": 1,
  "action": {
    "title": "Hex Explorer",
    "icon": "/icon.svg",
    "popover": "/panel.html",
    "width": 360,
    "height": 520
  },
  "background": "/obr.js"
}

/* ========================
   panel.html
   ======================== */
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Hex Explorer</title>
    <link rel="stylesheet" href="/styles.css"/>
  </head>
  <body>
    <header>
      <h1>Hex Explorer</h1>
      <div class="row">
        <label>Размер гекса, px <input id="hexSize" type="number" min="20" max="400" value="128"></label>
      </div>
      <div class="row">
        <button id="btnMakeGrid">Сгенерировать сетку</button>
        <button id="btnSelectAsset">Назначить арт</button>
      </div>
      <div class="row">
        <input id="search" placeholder="поиск по описанию и заметкам"/>
        <button id="btnSearch">Искать</button>
      </div>
      <p class="hint">Клик по гексу открывает, Alt+клик ставит золотой пин, Shift удерживай чтобы закрепить попап.</p>
    </header>

    <section id="log"></section>

    <script type="module" src="/panel.js"></script>
  </body>
</html>

/* ========================
   styles.css
   ======================== */
:root { --fg:#0f172a; --muted:#64748b; --accent:#111827; }
*{ box-sizing:border-box; font-family: system-ui, -apple-system, Segoe UI, Roboto, Inter, sans-serif; }
body{ margin:0; color:var(--fg); }
header{ padding:12px; border-bottom:1px solid #e5e7eb; }
h1{ margin:0 0 8px 0; font-size:16px; }
.row{ display:flex; gap:8px; align-items:center; margin:8px 0; }
label{ font-size:12px; color:var(--muted); }
input, button{ padding:6px 8px; border:1px solid #e5e7eb; border-radius:8px; font-size:13px; }
button{ background:#111827; color:#fff; border-color:#111827; cursor:pointer; }
button:disabled{ opacity:.5; cursor:default; }
#log{ padding:8px 12px; font-size:12px; color:var(--muted); }

/* ========================
   obr.js
   Фоновая логика и обработчики сцены
   ======================== */
import OBR from "https://cdn.skypack.dev/@owlbear-rodeo/sdk";

const ID = "dev.hex-explorer";
const NS = `${ID}/meta`;

OBR.onReady(async () => {
  // Контекстное меню для ручного открытия/закрытия
  OBR.contextMenu.create({
    id: `${ID}/toggle`,
    icons: [
      { icon: "M5 13h14v-2H5v2z", label: "Toggle Hex", filter: { items: { every: [{ kind: "image" }, { disabled: false }] } } }
    ],
    onClick: async ctx => {
      await OBR.scene.items.updateItems(ctx.items, items => {
        for (const it of items) {
          const m = it.metadata[NS] || {};
          m.state = m.state === "open" ? "closed" : "open";
          it.metadata[NS] = m;
          applyVisibility(it);
        }
      });
    }
  });

  // Простая реакция на клики по элементам сцены
  OBR.interaction.onClick(async (ctx) => {
    if (ctx.target && ctx.target.type === "IMAGE") {
      const [item] = await OBR.scene.items.getItems([ctx.target.id]);
      if (!item) return;
      if (ctx.modifierKeys.altKey) {
        await dropPinAt(item.position);
        return;
      }
      await toggleOpenAndCascade(item, { shift: ctx.modifierKeys.shiftKey });
    }
  });
});

function applyVisibility(item) {
  const meta = item.metadata[NS] || {};
  if (meta.type !== "hex") return;
  const isOpen = meta.state === "open";
  item.visible = true;
  item.disableHit = !isOpen; // закрытые гексы не кликабельны
  item.opacity = isOpen ? 1 : 0.1;
}

async function toggleOpenAndCascade(item, { shift }) {
  await OBR.scene.items.updateItems([item.id], items => {
    const it = items[0];
    const m = it.metadata[NS] || {};
    if (m.type !== "hex") return;
    m.state = "open";
    it.metadata[NS] = m;
    applyVisibility(it);
  });
  const meta = item.metadata[NS] || {};
  if (meta.noSpread) return; // горы не раскрывают соседей
  const neighbors = await getNeighbors(item, meta.hexSize || 128);
  if (neighbors.length) {
    await OBR.scene.items.updateItems(neighbors.map(n => n.id), items => {
      for (const it of items) {
        const m = it.metadata[NS] || {};
        if (m.type !== "hex") continue;
        if (m.state !== "open") m.state = "adjacent"; // второй тип
        it.metadata[NS] = m;
        it.opacity = m.state === "open" ? 1 : 0.35;
        it.disableHit = false;
      }
    });
  }
  if (shift) {
    await openInfoPopover(item);
  }
}

async function getNeighbors(item, size) {
  const all = await OBR.scene.items.getItems(i => i.metadata[NS]?.type === "hex");
  const range = size * 1.05;
  const c = item.position;
  return all.filter(it => it.id !== item.id && distance(it.position, c) < range + 1);
}

function distance(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y; return Math.hypot(dx, dy);
}

async function dropPinAt(pos) {
  const pin = {
    type: "IMAGE",
    layer: "ATTACHMENT",
    name: "Pin",
    position: pos,
    width: 24,
    height: 24,
    image: { url: "/pin-gold.svg" },
    metadata: { [NS]: { type: "pin" } }
  };
  await OBR.scene.items.addItems([pin]);
}

async function openInfoPopover(item) {
  const url = new URL("/panel.html", window.location.origin);
  url.searchParams.set("hex", item.id);
  await OBR.popover.open({ id: `${ID}/hexinfo`, url: url.toString(), height: 420, width: 360, anchorElementId: item.id });
}

export {}; // keep as module

/* ========================
   panel.js
   UI внутри панели и попапа. Один код обслуживает оба режима.
   ======================== */
import OBR from "https://cdn.skypack.dev/@owlbear-rodeo/sdk";

const ID = "dev.hex-explorer";
const NS = `${ID}/meta`;

const $ = sel => document.querySelector(sel);
const log = msg => { const el = document.createElement("div"); el.textContent = msg; document.getElementById("log")?.appendChild(el); };

OBR.onReady(async () => {
  const params = new URLSearchParams(location.search);
  const hexId = params.get("hex");

  if (hexId) {
    await renderHexPopover(hexId);
    return;
  }
  await renderMainPanel();
});

async function renderMainPanel() {
  const sizeInput = $("#hexSize");
  const btnGrid = $("#btnMakeGrid");
  const btnAsset = $("#btnSelectAsset");
  const search = $("#search");
  const btnSearch = $("#btnSearch");

  btnGrid.onclick = async () => {
    const size = Math.max(20, Math.min(400, Number(sizeInput.value) || 128));
    const center = await OBR.viewport.getCenter();
    const cols = 10, rows = 8;
    const items = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const offsetX = c * size * 0.9;
        const offsetY = r * size * 0.78 + (c % 2 ? size * 0.39 : 0);
        items.push(makeHexImage({ x: center.x + offsetX, y: center.y + offsetY }, size));
      }
    }
    await OBR.scene.items.addItems(items);
    log(`Добавлено ${items.length} гексов.`);
  };

  btnAsset.onclick = async () => {
    const imgs = await OBR.assets.open({ accept: ["image/*"], multiple: false });
    if (!imgs || imgs.length === 0) return;
    const url = imgs[0].url;
    const selected = await OBR.scene.items.getSelection();
    if (selected.length === 0) { log("Выдели один или несколько гексов."); return; }
    await OBR.scene.items.updateItems(selected, items => {
      for (const it of items) {
        if (it.type !== "IMAGE") continue;
        const m = it.metadata[NS] || {};
        if (m.type !== "hex") continue;
        it.image = { url };
      }
    });
    log("Арт назначен.");
  };

  btnSearch.onclick = async () => {
    const q = (search.value || "").trim().toLowerCase();
    if (!q) return;
    const items = await OBR.scene.items.getItems(i => i.metadata[NS]?.type === "hex");
    const hits = items.filter(it => {
      const m = it.metadata[NS] || {};
      const t = `${m.title || ""}\n${m.desc || ""}\n${m.notesPublic || ""}\n${m.notesPrivate || ""}`.toLowerCase();
      return t.includes(q);
    });
    await OBR.scene.local.addItems(hits.map(h => highlightRing(h)));
    log(`Найдено гексов: ${hits.length}`);
    setTimeout(() => OBR.scene.local.deleteItems(i => true), 2000);
  };
}

function makeHexImage(pos, size) {
  return {
    type: "IMAGE",
    name: "Hex",
    layer: "MAP",
    position: pos,
    width: size,
    height: size,
    image: { url: "/hex-placeholder.png" },
    metadata: { [NS]: { type: "hex", state: "closed", hexSize: size } },
    disableHit: true,
    opacity: 0.1
  };
}

function highlightRing(item) {
  const s = Math.max(item.width, item.height) + 6;
  return {
    type: "SHAPE",
    layer: "LOCAL",
    position: item.position,
    width: s,
    height: s,
    shapeType: "HEXAGON",
    style: { fillColor: "rgba(0,0,0,0)", strokeColor: "#f59e0b", strokeWidth: 3 }
  };
}

async function renderHexPopover(hexId) {
  const [hex] = await OBR.scene.items.getItems([hexId]);
  if (!hex) return;
  const meta = hex.metadata[NS] || {};

  const container = document.createElement("div");
  container.style.padding = "8px";
  container.innerHTML = `
    <div class="row"><input id="title" placeholder="заголовок" value="${escapeHtml(meta.title || "")}"></div>
    <div class="row"><textarea id="desc" rows="4" placeholder="описание мастера">${escapeHtml(meta.desc || "")}</textarea></div>
    <div class="row"><textarea id="notesPrivate" rows="3" placeholder="личные заметки (локально)">${escapeHtml(meta.notesPrivate || "")}</textarea></div>
    <div class="row"><textarea id="notesPublic" rows="3" placeholder="общие заметки (видят все)">${escapeHtml(meta.notesPublic || "")}</textarea></div>
    <div class="row"><button id="save">Сохранить</button></div>
  `;
  document.body.appendChild(container);

  document.getElementById("save").onclick = async () => {
    const title = document.getElementById("title").value;
    const desc = document.getElementById("desc").value;
    const notesPublic = document.getElementById("notesPublic").value;
    const notesPrivate = document.getElementById("notesPrivate").value;

    await OBR.scene.items.updateItems([hexId], items => {
      const it = items[0];
      const m = it.metadata[NS] || {};
      m.title = title; m.desc = desc; m.notesPublic = notesPublic; m.notesPrivate = notesPrivate;
      it.metadata[NS] = m;
    });
    await OBR.popover.close(`${ID}/hexinfo`);
  };
}

function escapeHtml(s) {
  return s.replace(/[&<>"]+/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));
}
