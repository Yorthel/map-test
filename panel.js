import OBR from "https://cdn.skypack.dev/@owlbear-rodeo/sdk";

const ID = "dev.hex-explorer";
const NS = `${ID}/meta`;

const $ = sel => document.querySelector(sel);
const log = msg => {
  const el = document.createElement("div");
  el.textContent = msg;
  document.getElementById("log")?.appendChild(el);
};

OBR.onReady(async () => {
  const params = new URLSearchParams(location.search);
  const hexId = params.get("hex");

  // Попап конкретного гекса
  if (hexId) {
    await renderHexPopover(hexId);
    return;
  }

  // Главная панель
  await renderMainPanel();

  // Обработчики на сцене
  activateMapHandlers();

  // Активировать снэпинг для ассетов
  activateSnapHandler();
});

/* ===========================
   Основная панель
   =========================== */
async function renderMainPanel() {
  const sizeInput = $("#hexSize");
  const btnGrid = $("#btnMakeGrid");
  const btnAsset = $("#btnSelectAsset");
  const search = $("#search");
  const btnSearch = $("#btnSearch");

  // 1) Генерация сетки
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

  // 2) Назначение арта из ассетов OBR
  btnAsset.onclick = async () => {
    const imgs = await OBR.assets.open({ accept: ["image/*"], multiple: false });
    if (!imgs || imgs.length === 0) return;
    const url = imgs[0].url;

    const selected = await OBR.scene.items.getSelection();
    if (selected.length === 0) {
      log("Выдели один или несколько гексов.");
      return;
    }

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

  // 3) Поиск по описанию и заметкам
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

/* ===========================
   Вспомогательные функции
   =========================== */
function makeHexImage(pos, size) {
  return {
    type: "IMAGE",
    name: "Hex",
    layer: "MAP",
    position: pos,
    width: size,
    height: size,
    image: { url: "./hex-placeholder.png" }, // относительный путь для GitHub Pages
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
    style: {
      fillColor: "rgba(0,0,0,0)",
      strokeColor: "#f59e0b",
      strokeWidth: 3
    }
  };
}

/* ===========================
   Попап информации о гексе
   =========================== */
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
      m.title = title;
      m.desc = desc;
      m.notesPublic = notesPublic;
      m.notesPrivate = notesPrivate;
      it.metadata[NS] = m;
    });

    await OBR.popover.close(`${ID}/hexinfo`);
  };
}

function escapeHtml(s) {
  return s.replace(/[&<>"]+/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;"
  }[c]));
}

/* ===========================
   Обработчики событий карты
   =========================== */
function activateMapHandlers() {
  // Клик по гексу — открыть. Shift+клик — открыть попап.
  OBR.interaction.onClick(async ctx => {
    if (!ctx.target || ctx.target.type !== "IMAGE") return;

    const [item] = await OBR.scene.items.getItems([ctx.target.id]);
    if (!item) return;

    const meta = item.metadata[NS] || {};
    if (meta.type !== "hex") return;

    await openHex(item);

    if (ctx.modifierKeys.shiftKey) {
      await openInfoPopover(item);
    }
  });
}

/* ===========================
   Открытие гекса и соседей
   =========================== */
async function openHex(item) {
  await OBR.scene.items.updateItems([item.id], items => {
    const it = items[0];
    const m = it.metadata[NS] || {};
    m.state = "open";
    it.metadata[NS] = m;
    it.opacity = 1;
    it.disableHit = false;
  });

  const meta = item.metadata[NS] || {};
  if (meta.noSpread) return;

  const neighbors = await getNeighbors(item, meta.hexSize || 128);

  await OBR.scene.items.updateItems(neighbors.map(n => n.id), items => {
    for (const it of items) {
      const m = it.metadata[NS] || {};
      if (m.state !== "open") m.state = "adjacent";
      it.metadata[NS] = m;
      it.opacity = m.state === "open" ? 1 : 0.35;
      it.disableHit = false;
    }
  });
}

async function getNeighbors(item, size) {
  const all = await OBR.scene.items.getItems(i => i.metadata[NS]?.type === "hex");
  const range = size * 1.05;
  const c = item.position;

  return all.filter(it => it.id !== item.id && distance(it.position, c) < range + 1);
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/* ===========================
   Попап из панели
   =========================== */
async function openInfoPopover(item) {
  const url = new URL(location.href);
  url.searchParams.set("hex", item.id);

  await OBR.popover.open({
    id: `${ID}/hexinfo`,
    url: url.toString(),
    height: 420,
    width: 360,
    anchorElementId: item.id
  });
}

/* ===========================
   Снэпинг ассетов к предметам
   =========================== */
const SNAP_DISTANCE = 30;

function activateSnapHandler() {
  OBR.interaction.onDrop(async (dropEvent) => {
    // Get all scene items
    const allItems = await OBR.scene.items.getItems();
    
    // Find nearest item within snap distance
    let nearest = null;
    let minDist = SNAP_DISTANCE;

    for (const item of allItems) {
      const dist = distance(item.position, dropEvent.position);
      if (dist < minDist) {
        minDist = dist;
        nearest = item;
      }
    }

    // If found nearby item, snap to its edge
    if (nearest) {
      const snappedPos = calculateSnapPosition(dropEvent.position, nearest);
      dropEvent.position = snappedPos;
    }
  });
}

function calculateSnapPosition(dropPos, targetItem) {
  const dx = dropPos.x - targetItem.position.x;
  const dy = dropPos.y - targetItem.position.y;
  
  // Simple edge snapping: align to nearest edge
  const width = targetItem.width || 128;
  const height = targetItem.height || 128;
  
  let snappedX = dropPos.x;
  let snappedY = dropPos.y;

  // Snap horizontally or vertically based on which axis is closer
  if (Math.abs(dx) < Math.abs(dy)) {
    snappedX = targetItem.position.x + (dx > 0 ? width / 2 : -width / 2);
  } else {
    snappedY = targetItem.position.y + (dy > 0 ? height / 2 : -height / 2);
  }

  return { x: snappedX, y: snappedY };
}

