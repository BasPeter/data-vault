import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "build", "icon.master.svg");
const outputs = [
  { file: path.join(root, "build", "icon.png"), scale: 1 },
  { file: path.join(root, "build", "icon.win.png"), scale: 1.06 },
];

function scaleSvg(svg, scale) {
  if (scale === 1) return svg;

  return svg.replace(
    />([\s\S]*)<\/svg>\s*$/,
    `><g transform="translate(512 512) scale(${scale}) translate(-512 -512)">$1</g></svg>`,
  );
}

async function renderIcon(window, svg, output) {
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

  await window.webContents.executeJavaScript(`
    document.open();
    document.write(${JSON.stringify(html)});
    document.close();
  `);
  await new Promise((resolve) => {
    setTimeout(resolve, 100);
  });

  const image = await window.webContents.capturePage();
  fs.writeFileSync(output, image.toPNG({ scaleFactor: 1 }));
  console.log(`build-icon: wrote ${output} (1024 x 1024)`);
}

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

    await window.loadURL("about:blank");

    for (const output of outputs) {
      await renderIcon(window, scaleSvg(svg, output.scale), output.file);
    }
    window.destroy();
    app.exit(0);
  })
  .catch((error) => {
    console.error(`build-icon: ${error.message}`);
    app.exit(1);
  });
