import OBR from "https://cdn.skypack.dev/@owlbear-rodeo/sdk";

const ID = "dev.hex-explorer";
const NS = `${ID}/meta`;

const HEX_SIZE = 128;              // единый размер токена-гекса
const ORIENT = "pointy";           // острый верх
const SNAP_RADIUS = HEX_SIZE * 0.6;// зона прилипания вокруг центров слотов

// вспомогалки
const round = n => Math.round(n * 1000) / 1000;
const toPx = (q, r) => {
  // axial q,r -> pixel x,y для pointy
  const x = HEX_SIZE * (Math.sqrt(3) * (q + r / 2));
  const y = HEX_SIZE * (3 / 2 * r);
  return { x, y };
};
const toAxial = (x, y) => {
  // pixel x,y -> axial q,r для pointy
  const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / (HEX_SIZE / 1);
  const r = (2 / 3 * y) / (HEX_SIZE / 1);
  return cubeRound(q, r);
};
function cubeRound(q, r) {
  // округление к ближайшей гекс-ячейке
  let x = q;
  let z = r;
  let y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

OBR.onReady(async () => {
  // контекстное меню: старт/финиш режима
  OBR.contextMenu.create({
    id: `${ID}/start`,
    icons: [{ icon: "M4 4h16v16H4z", label: "Создать карту" }],
    filter: { items: { every: [{ type: "IMAGE" }] } },
    onClick: async (ctx) => startBuildMode(ctx.items[0].id)
  });

  OBR.contextMenu.create({
    id: `${ID}/finish`,
    icons: [{ icon: "M5 13h14v-2H5z", label: "Закончить карту" }],
    filter: { items: { every: [] } },
    onClick: async () => stopBuildMode()
  });

  // перехват добавления новых токенов в режиме сборки
  OBR.scene.items.onChange(async (changes) => {
    const build = await OBR.scene.getMetadata(NS + "/build");
    if (!build?.active) return;

    // интересуют только новые IMAGE
    const created = changes?.created || [];
    if (created.length === 0) return;

    const items = await OBR.scene.items.getItems(created.map(c => c.id));
    const imgs = items.filter(i => i.type === "IMAGE");

    if (imgs.length === 0) return;

    for (const it of imgs) {
      await snapImageToGrid(it, build);
      await openStatePopover(it.id); // окно выбора: Видимая, Соседняя, Туман
    }
  });
});

async function startBuildMode(seedId) {
  const [seed] = await OBR.scene.items.getItems([seedId]);
  if (!seed) return;

  // нормализуем исходный гекс
  await OBR.scene.items.updateItems([seedId], items => {
    const it = items[0];
    it.width = HEX_SIZE;
    it.height = HEX_SIZE;
    it.metadata[NS] = { ...(it.metadata[NS] || {}), type: "hex", q: 0, r: 0, state: "visible" };
  });

  // запоминаем якорь и систему координат
  await OBR.scene.setMetadata(NS + "/build", {
    active: true,
    origin: { x: seed.position.x, y: seed.position.y },
    orient: ORIENT,
    size: HEX_SIZE
  });

  // локальный превью-лупа вокруг соседних слотов
  await drawNeighborPreview(seed.position, HEX_SIZE);
}

async function stopBuildMode() {
  await OBR.scene.setMetadata(NS + "/build", { active: false });
  await OBR.scene.local.deleteItems(i => true);
}

// снап и унификация размеров + прилипание к ближайшей ячейке
async function snapImageToGrid(img, build) {
  // переводим мировые координаты в осевые q,r относительно origin
  const dx = img.position.x - build.origin.x;
  const dy = img.position.y - build.origin.y;
  const { q, r } = toAxial(dx, dy);

  // итоговый центр ячейки
  const p = toPx(q, r);
  const pos = { x: round(build.origin.x + p.x), y: round(build.origin.y + p.y) };

  // если слишком далеко от центра ячейки, не трогаем
  const dist = Math.hypot(img.position.x - pos.x, img.position.y - pos.y);
  if (dist > SNAP_RADIUS) return;

  // анимированный док
  await OBR.scene.items.updateItems([img.id], items => {
    const it = items[0];
    it.position = pos;
    it.width = build.size;
    it.height = build.size;
    const m = it.metadata[NS] || {};
    it.metadata[NS] = { ...m, type: "hex", q, r, state: "adjacent" }; // по умолчанию «Соседняя»
    it.opacity = 0.85;
  });

  // перерисовать предпросмотр соседей вокруг поставленного гекса
  await drawNeighborPreview(pos, build.size);
}

// локальный превью шести соседей
async function drawNeighborPreview(center, size) {
  await OBR.scene.local.deleteItems(i => true);
  const slot = await OBR.scene.local.addItems(neighborRings(center, size));
  return slot;
}
function neighborRings(center, size) {
  const pts = [];
  const dirs = [
    { q: +1, r: 0 }, { q: +1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: +1 }, { q: 0, r: +1 }
  ];
  for (const d of dirs) {
    const p = toPx(d.q, d.r);
    pts.push({
      type: "SHAPE",
      layer: "LOCAL",
      position: { x: center.x + p.x, y: center.y + p.y },
      width: size,
      height: size,
      shapeType: "HEXAGON",
      style: { fillColor: "rgba(0,0,0,0)", strokeColor: "#10b981", strokeWidth: 2 }
    });
  }
  return pts;
}

// поповер выбора состояния
async function openStatePopover(itemId) {
  const html = `
    <style>
      body{margin:0;padding:10px;font:13px system-ui}
      .row{display:flex;gap:8px}
      button{padding:6px 10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer}
    </style>
    <div class="row">
      <button data-s="visible">Видимая</button>
      <button data-s="adjacent">Соседняя</button>
      <button data-s="fog">Туман</button>
    </div>
  `;
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);

  await OBR.popover.open({
    id: `${ID}/state-${itemId}`,
    url,
    width: 260,
    height: 70,
    anchorElementId: itemId
  });

  // ловим клики внутри поповера
  OBR.popover.onMessage(`${ID}/state-${itemId}`, async (msg) => {
    if (!msg?.state) return;
    await setHexState(itemId, msg.state);
    await OBR.popover.close(`${ID}/state-${itemId}`);
  });

  // внедрить небольшой скрипт-почтальон внутрь поповера
  setTimeout(() => {
    // отправка сообщений наружу
    const script = `
      window.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const state = b.dataset.s;
        parent.postMessage({ target:'${ID}/state-${itemId}', state }, '*');
      });
    `;
    // eslint-disable-next-line no-undef
    OBR.popover.eval(`${ID}/state-${itemId}`, script);
  }, 50);
}

async function setHexState(itemId, state) {
  await OBR.scene.items.updateItems([itemId], items => {
    const it = items[0];
    const m = it.metadata[NS] || {};
    m.state = state;
    it.metadata[NS] = m;

    if (state === "visible") { it.opacity = 1; it.disableHit = false; }
    else if (state === "adjacent") { it.opacity = 0.6; it.disableHit = false; }
    else { it.opacity = 0.05; it.disableHit = true; } // туман
  });
}