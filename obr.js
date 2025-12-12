import OBR from "https://cdn.skypack.dev/@owlbear-rodeo/sdk";
if (shift) {
    await openInfoPopover(item);
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


export { }; // keep as module
