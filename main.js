const { app, BrowserWindow } = require("electron");
const path = require("path");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 900,
    backgroundColor: "#0f1117",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true
    }
  });

  win.removeMenu();
  win.loadFile(path.join(__dirname, "index.html"));
};

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
