import OBR from "https://cdn.skypack.dev/@owlbear-rodeo/sdk";

const ID = "dev.hex-explorer";
const NS = `${ID}/meta`;

OBR.onReady(async () => {
  // страхуемся от повторной регистрации при горячей перезагрузке
  try { await OBR.contextMenu.delete(`${ID}/create-map`); } catch {}

  await OBR.contextMenu.create({
    id: `${ID}/create-map`,
    // простой квадрат как иконка. можно заменить любым path
    icons: [{ icon: "M4 4h16v16H4z", label: "Создать карту" }],
    // показывать кнопку только когда ПКМ по картинке (IMAGE)
    filter: { items: { every: [{ type: "IMAGE" }] } },
    onClick: async (ctx) => {
      const img = ctx.items.find(i => i.type === "IMAGE");
      if (!img) return;

      // помечаем выбранный проп как сид и сигнализируем пользователю
      await OBR.scene.items.updateItems([img.id], items => {
        const it = items[0];
        it.metadata[NS] = { ...(it.metadata[NS] || {}), isSeed: true };
      });

      // можно заменить на вашу дальнейшую логику старта режима
      if (OBR.notification?.show) {
        await OBR.notification.show("Режим создания карты активирован");
      } else {
        console.log("[hex-explorer] Создать карту: клик получен, seed =", img.id);
      }
    }
  });
});
