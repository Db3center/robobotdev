const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Aqui você pode expor funções se quiser comunicação bidirecional
});
