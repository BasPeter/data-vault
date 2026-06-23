import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "build", "icon.master.svg");
const output = path.join(root, "build", "icon.png");

app.disableHardwareAcceleration();

app
  .whenReady()
  .then(async () => {
    const svg = fs.readFileSync(source, "utf8");
    const window = new BrowserWindow({
      width: 1024,
      height: 1024,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
      },
    });

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html,
      body {
        width: 1024px;
        height: 1024px;
        margin: 0;
        overflow: hidden;
        background: transparent;
      }

      svg {
        display: block;
        width: 1024px;
        height: 1024px;
      }
    </style>
  </head>
  <body>${svg}</body>
</html>`;

    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });

    const image = await window.webContents.capturePage();
    fs.writeFileSync(output, image.toPNG({ scaleFactor: 1 }));
    console.log(`build-icon: wrote ${output} (1024 x 1024)`);
    window.destroy();
    app.exit(0);
  })
  .catch((error) => {
    console.error(`build-icon: ${error.message}`);
    app.exit(1);
  });
