import OBR from "https://cdn.skypack.dev/@owlbear-rodeo/sdk";
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
