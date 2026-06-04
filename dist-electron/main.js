"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// main/main.ts
var import_electron = require("electron");
var path3 = __toESM(require("path"));

// main/pipeline/TrainingPipeline.ts
var path2 = __toESM(require("path"));

// main/pipeline/stages.ts
var import_child_process = require("child_process");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function runProcess(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    var _a, _b;
    const proc = (0, import_child_process.spawn)(cmd, args, {
      cwd: opts.cwd,
      shell: false,
      windowsHide: true
    });
    opts.onLog(`[CMD] ${cmd} ${args.join(" ")}`);
    (_a = proc.stdout) == null ? void 0 : _a.on("data", (d) => {
      d.toString().split("\n").filter(Boolean).forEach(opts.onLog);
    });
    (_b = proc.stderr) == null ? void 0 : _b.on("data", (d) => {
      d.toString().split("\n").filter(Boolean).forEach(opts.onLog);
    });
    proc.on("close", (code) => {
      if (opts.signal.aborted) return reject(new Error("CANCELLED"));
      if (code === 0 || code === null) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on("error", (err) => reject(err));
    opts.signal.addEventListener("abort", () => {
      proc.kill("SIGTERM");
      reject(new Error("CANCELLED"));
    }, { once: true });
  });
}
function commandExists(cmd) {
  try {
    const result = require("child_process").spawnSync(
      process.platform === "win32" ? "where" : "which",
      [cmd],
      { encoding: "utf8" }
    );
    return result.status === 0;
  } catch (e) {
    return false;
  }
}
async function stageValidate(ctx) {
  ctx.onLog("\uC785\uB825 \uD30C\uC77C \uBC0F \uC2E4\uD589 \uD658\uACBD\uC744 \uAC80\uC99D\uD569\uB2C8\uB2E4.");
  ctx.onProgress(2, "\uC785\uB825 \uD30C\uC77C \uAC80\uC99D \uC911...");
  if (!fs.existsSync(ctx.videoPath)) {
    throw new Error(`\uC785\uB825 \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${ctx.videoPath}`);
  }
  const stat = fs.statSync(ctx.videoPath);
  ctx.onLog(`\uC785\uB825 \uD30C\uC77C: ${ctx.videoPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
  const missing = [];
  if (!commandExists("ffmpeg")) {
    missing.push("ffmpeg (https://ffmpeg.org/download.html)");
  } else {
    ctx.onLog("\u2713 ffmpeg \uD655\uC778\uB428");
  }
  if (!commandExists("colmap")) {
    const colmapBin = process.env.COLMAP_BIN;
    if (!colmapBin || !fs.existsSync(colmapBin)) {
      missing.push("COLMAP (https://colmap.github.io) \u2014 PATH \uB610\uB294 COLMAP_BIN \uD658\uACBD\uBCC0\uC218 \uC124\uC815 \uD544\uC694");
    } else {
      ctx.onLog(`\u2713 COLMAP \uD655\uC778\uB428 (COLMAP_BIN=${colmapBin})`);
    }
  } else {
    ctx.onLog("\u2713 COLMAP \uD655\uC778\uB428");
  }
  if (!commandExists("python") && !commandExists("python3")) {
    missing.push("Python 3.10+ (https://www.python.org)");
  } else {
    ctx.onLog("\u2713 Python \uD655\uC778\uB428");
  }
  const scriptPath = process.env["4DGS_SCRIPT_PATH"];
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    missing.push(
      "4DGS \uD559\uC2B5 \uC2A4\uD06C\uB9BD\uD2B8 (4DGS_SCRIPT_PATH \uD658\uACBD\uBCC0\uC218\uC5D0 train.py \uACBD\uB85C\uB97C \uC124\uC815\uD558\uC138\uC694)"
    );
  } else {
    ctx.onLog(`\u2713 4DGS \uC2A4\uD06C\uB9BD\uD2B8 \uD655\uC778\uB428: ${scriptPath}`);
  }
  if (missing.length > 0) {
    throw new Error(
      `\uB2E4\uC74C \uB3C4\uAD6C\uAC00 \uC124\uCE58\uB418\uC9C0 \uC54A\uC558\uAC70\uB098 \uACBD\uB85C\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4:
` + missing.map((m) => `  \u2022 ${m}`).join("\n")
    );
  }
  for (const dir of [ctx.workDir, ctx.framesDir, ctx.colmapDir, ctx.gsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  ctx.onLog(`\uC791\uC5C5 \uB514\uB809\uD1A0\uB9AC: ${ctx.workDir}`);
  ctx.onProgress(5, "\uD658\uACBD \uAC80\uC99D \uC644\uB8CC");
}
async function stageExtract(ctx) {
  var _a;
  ctx.onLog("ffmpeg\uC73C\uB85C \uD504\uB808\uC784\uC744 \uCD94\uCD9C\uD569\uB2C8\uB2E4.");
  ctx.onProgress(8, "ffmpeg \uD504\uB808\uC784 \uCD94\uCD9C \uC911...");
  const fps = (_a = process.env["4DGS_EXTRACT_FPS"]) != null ? _a : "2";
  await runProcess(
    "ffmpeg",
    [
      "-y",
      // 덮어쓰기 허용
      "-i",
      ctx.videoPath,
      // 입력
      "-r",
      fps,
      // 추출 FPS
      "-q:v",
      "1",
      // 최고 품질
      "-f",
      "image2",
      path.join(ctx.framesDir, "frame_%06d.jpg")
    ],
    {
      cwd: ctx.workDir,
      signal: ctx.signal,
      onLog: ctx.onLog
    }
  );
  const extracted = fs.readdirSync(ctx.framesDir).filter((f) => f.endsWith(".jpg"));
  ctx.onLog(`\u2713 \uD504\uB808\uC784 \uCD94\uCD9C \uC644\uB8CC: ${extracted.length}\uC7A5`);
  if (extracted.length < 10) {
    throw new Error(
      `\uCD94\uCD9C\uB41C \uD504\uB808\uC784 \uC218\uAC00 \uB108\uBB34 \uC801\uC2B5\uB2C8\uB2E4 (${extracted.length}\uC7A5). 10\uC7A5 \uC774\uC0C1\uC758 \uD504\uB808\uC784\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.`
    );
  }
  ctx.onProgress(20, `${extracted.length}\uAC1C \uD504\uB808\uC784 \uCD94\uCD9C \uC644\uB8CC`);
}
async function stageColmap(ctx) {
  var _a;
  ctx.onLog("COLMAP SfM\uB97C \uC2E4\uD589\uD569\uB2C8\uB2E4 (\uD2B9\uC9D5\uC810 \uCD94\uCD9C \u2192 \uB9E4\uCE6D \u2192 \uC7AC\uAC74)");
  ctx.onProgress(22, "COLMAP \uD2B9\uC9D5\uC810 \uCD94\uCD9C \uC911...");
  const colmapCmd = commandExists("colmap") ? "colmap" : (_a = process.env.COLMAP_BIN) != null ? _a : "colmap";
  const dbPath = path.join(ctx.colmapDir, "database.db");
  const sparseDir = path.join(ctx.colmapDir, "sparse");
  fs.mkdirSync(sparseDir, { recursive: true });
  await runProcess(
    colmapCmd,
    [
      "feature_extractor",
      "--database_path",
      dbPath,
      "--image_path",
      ctx.framesDir,
      "--ImageReader.single_camera",
      "1",
      "--SiftExtraction.use_gpu",
      "1"
    ],
    { cwd: ctx.colmapDir, signal: ctx.signal, onLog: ctx.onLog }
  );
  ctx.onProgress(30, "COLMAP \uD2B9\uC9D5\uC810 \uB9E4\uCE6D \uC911...");
  await runProcess(
    colmapCmd,
    [
      "exhaustive_matcher",
      "--database_path",
      dbPath,
      "--SiftMatching.use_gpu",
      "1"
    ],
    { cwd: ctx.colmapDir, signal: ctx.signal, onLog: ctx.onLog }
  );
  ctx.onProgress(40, "COLMAP 3D \uC7AC\uAC74 (Mapper) \uC911...");
  await runProcess(
    colmapCmd,
    [
      "mapper",
      "--database_path",
      dbPath,
      "--image_path",
      ctx.framesDir,
      "--output_path",
      sparseDir
    ],
    { cwd: ctx.colmapDir, signal: ctx.signal, onLog: ctx.onLog }
  );
  const model0 = path.join(sparseDir, "0");
  if (!fs.existsSync(model0)) {
    throw new Error("COLMAP \uC7AC\uAC74\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4. \uCE74\uBA54\uB77C \uD3EC\uC988\uB97C \uCD94\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  }
  const txtDir = path.join(ctx.colmapDir, "sparse_txt");
  fs.mkdirSync(txtDir, { recursive: true });
  await runProcess(
    colmapCmd,
    [
      "model_converter",
      "--input_path",
      model0,
      "--output_path",
      txtDir,
      "--output_type",
      "TXT"
    ],
    { cwd: ctx.colmapDir, signal: ctx.signal, onLog: ctx.onLog }
  );
  ctx.onLog("\u2713 COLMAP SfM \uC644\uB8CC");
  ctx.onProgress(50, "COLMAP \uC644\uB8CC \u2014 \uCE74\uBA54\uB77C \uD3EC\uC988 \uCD94\uC815 \uC131\uACF5");
}
async function stageInit(ctx) {
  ctx.onLog("3D Gaussian Splatting \uCD08\uAE30\uD654\uB97C \uC900\uBE44\uD569\uB2C8\uB2E4.");
  ctx.onProgress(52, "\uB370\uC774\uD130\uC14B \uAD6C\uC870 \uCD08\uAE30\uD654 \uC911...");
  const gsImagesDir = path.join(ctx.gsDir, "images");
  const gsSparseDir = path.join(ctx.gsDir, "sparse", "0");
  fs.mkdirSync(gsImagesDir, { recursive: true });
  fs.mkdirSync(gsSparseDir, { recursive: true });
  const frames = fs.readdirSync(ctx.framesDir).filter((f) => f.endsWith(".jpg"));
  for (const frame of frames) {
    fs.copyFileSync(
      path.join(ctx.framesDir, frame),
      path.join(gsImagesDir, frame)
    );
  }
  ctx.onLog(`\u2713 \uC774\uBBF8\uC9C0 ${frames.length}\uC7A5 \uBCF5\uC0AC \uC644\uB8CC`);
  const txtDir = path.join(ctx.colmapDir, "sparse_txt");
  for (const f of ["cameras.txt", "images.txt", "points3D.txt"]) {
    const src = path.join(txtDir, f);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(gsSparseDir, f));
    }
  }
  ctx.onLog("\u2713 COLMAP \uB370\uC774\uD130 \uBCF5\uC0AC \uC644\uB8CC");
  ctx.onProgress(58, "\uCD08\uAE30\uD654 \uC644\uB8CC");
}
async function stageOptimize(ctx) {
  var _a;
  ctx.onLog("4D Gaussian Splatting \uD559\uC2B5\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4.");
  ctx.onProgress(60, "4DGS \uBAA8\uB378 \uCD5C\uC801\uD654 \uC911...");
  const scriptPath = process.env["4DGS_SCRIPT_PATH"];
  const python = commandExists("python3") ? "python3" : "python";
  const iterations = (_a = process.env["4DGS_ITERATIONS"]) != null ? _a : "30000";
  let lastProgress = 60;
  await runProcess(
    python,
    [
      scriptPath,
      "-s",
      ctx.gsDir,
      "-m",
      path.join(ctx.gsDir, "output"),
      "--iterations",
      iterations,
      "--port",
      "6009"
    ],
    {
      cwd: path.dirname(scriptPath),
      signal: ctx.signal,
      onLog: (line) => {
        ctx.onLog(line);
        const m = line.match(/[Ii]teration[:\s]+(\d+)[\/\s]+(\d+)/);
        if (m) {
          const curr = parseInt(m[1], 10);
          const total = parseInt(m[2], 10);
          const pct = 60 + Math.round(curr / total * 30);
          if (pct > lastProgress) {
            lastProgress = pct;
            ctx.onProgress(pct, `\uD559\uC2B5 \uC911... (${curr} / ${total} iters)`);
          }
        }
      }
    }
  );
  ctx.onLog("\u2713 4DGS \uCD5C\uC801\uD654 \uC644\uB8CC");
  ctx.onProgress(90, "\uCD5C\uC801\uD654 \uC644\uB8CC \u2014 PLY \uD30C\uC77C \uD0D0\uC0C9 \uC911");
}
async function stageExport(ctx) {
  ctx.onLog("\uCD9C\uB825 PLY \uD30C\uC77C\uC744 \uC218\uC9D1\uD569\uB2C8\uB2E4.");
  ctx.onProgress(92, "PLY \uD30C\uC77C \uC218\uC9D1 \uC911...");
  const outputDir = path.join(ctx.gsDir, "output");
  const plyFiles = findPlyFiles(outputDir);
  if (plyFiles.length === 0) {
    throw new Error(
      `PLY \uCD9C\uB825 \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uACBD\uB85C: ${outputDir}
4DGS \uD559\uC2B5 \uC2A4\uD06C\uB9BD\uD2B8\uAC00 PLY \uD30C\uC77C\uC744 \uC62C\uBC14\uB974\uAC8C \uCD9C\uB825\uD588\uB294\uC9C0 \uD655\uC778\uD558\uC138\uC694.`
    );
  }
  ctx.onLog(`\u2713 PLY \uD30C\uC77C ${plyFiles.length}\uAC1C \uBC1C\uACAC`);
  plyFiles.slice(0, 5).forEach((f) => ctx.onLog(`  - ${path.basename(f)}`));
  ctx.onProgress(100, `\uD2B8\uB808\uC774\uB2DD \uC644\uB8CC \u2014 PLY ${plyFiles.length}\uAC1C \uC0DD\uC131`);
  return { folderPath: outputDir, plyFiles };
}
function findPlyFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ply")) {
        results.push(full);
      }
    }
  }
  walk(dir);
  return results.sort();
}

// main/pipeline/TrainingPipeline.ts
var TrainingPipeline = class {
  constructor(window) {
    this.abortController = null;
    this.window = window;
  }
  /** 파이프라인 취소 */
  cancel() {
    var _a;
    (_a = this.abortController) == null ? void 0 : _a.abort();
  }
  /** 파이프라인 실행 */
  async run(videoPath) {
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const baseName = path2.basename(videoPath, path2.extname(videoPath));
    const workDir = path2.join(path2.dirname(videoPath), `4dgs_${baseName}_${timestamp}`);
    const framesDir = path2.join(workDir, "frames");
    const colmapDir = path2.join(workDir, "colmap");
    const gsDir = path2.join(workDir, "gs");
    const ctx = {
      videoPath,
      workDir,
      framesDir,
      colmapDir,
      gsDir,
      signal,
      onLog: (message, level = "info") => {
        this.send("training-log", { message, level, timestamp: Date.now() });
      },
      onProgress: (progress, status) => {
        this.send("training-progress", progress, status);
      }
    };
    const stages = [
      { name: "validate", label: "\uD30C\uC77C \uAC80\uC99D", fn: stageValidate },
      { name: "extract", label: "\uD504\uB808\uC784 \uCD94\uCD9C", fn: stageExtract },
      { name: "colmap", label: "COLMAP SfM", fn: stageColmap },
      { name: "init", label: "GS \uCD08\uAE30\uD654", fn: stageInit },
      { name: "optimize", label: "4DGS \uCD5C\uC801\uD654", fn: stageOptimize },
      { name: "export", label: "PLY \uC218\uC9D1", fn: stageExport }
    ];
    try {
      let exportResult = null;
      for (const stage of stages) {
        if (signal.aborted) {
          this.send("training-stage", "cancelled");
          return { success: false, folderPath: "", plyFiles: [], fileCount: 0, error: "CANCELLED" };
        }
        this.send("training-stage", stage.name);
        ctx.onLog(`
\u2501\u2501\u2501 [${stage.label}] \u2501\u2501\u2501`);
        const result = await stage.fn(ctx);
        if (stage.name === "export" && result) {
          exportResult = result;
        }
      }
      this.send("training-stage", "done");
      if (!exportResult) {
        throw new Error("Export \uB2E8\uACC4\uC5D0\uC11C \uACB0\uACFC\uB97C \uBC18\uD658\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.");
      }
      return {
        success: true,
        folderPath: exportResult.folderPath,
        plyFiles: exportResult.plyFiles,
        fileCount: exportResult.plyFiles.length
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "CANCELLED") {
        this.send("training-stage", "cancelled");
        return { success: false, folderPath: "", plyFiles: [], fileCount: 0, error: "CANCELLED" };
      }
      ctx.onLog(`
\u2717 \uC624\uB958: ${message}`, "error");
      this.send("training-stage", "error");
      this.send("training-error", message);
      return { success: false, folderPath: "", plyFiles: [], fileCount: 0, error: message };
    }
  }
  send(channel, ...args) {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, ...args);
    }
  }
};

// main/main.ts
var mainWindow = null;
var activePipeline = null;
function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path3.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    },
    backgroundColor: "#000000",
    titleBarStyle: "hiddenInset"
    // Premium feel on macOS
  });
  const isDev = !import_electron.app.isPackaged;
  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path3.join(__dirname, "../out/index.html"));
  }
  mainWindow.on("closed", () => {
    activePipeline == null ? void 0 : activePipeline.cancel();
    activePipeline = null;
    mainWindow = null;
  });
}
import_electron.app.whenReady().then(() => {
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron.app.on("window-all-closed", () => {
  activePipeline == null ? void 0 : activePipeline.cancel();
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
import_electron.ipcMain.handle("open-video-file", async () => {
  if (!mainWindow) return null;
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Videos & Images", extensions: ["mp4", "mov", "heic", "jpg", "png", "avi", "mkv"] }
    ],
    title: "4D GS \uD2B8\uB808\uC774\uB2DD\uC5D0 \uC0AC\uC6A9\uD560 \uC601\uC0C1 \uD30C\uC77C \uC120\uD0DD"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return { videoPath: result.filePaths[0] };
});
import_electron.ipcMain.handle("start-local-training", async (_event, videoPath) => {
  if (!mainWindow) return { success: false, folderPath: "", plyFiles: [], fileCount: 0, error: "No window" };
  if (activePipeline) {
    activePipeline.cancel();
    activePipeline = null;
  }
  activePipeline = new TrainingPipeline(mainWindow);
  const result = await activePipeline.run(videoPath);
  activePipeline = null;
  return result;
});
import_electron.ipcMain.handle("cancel-training", async () => {
  if (activePipeline) {
    activePipeline.cancel();
    activePipeline = null;
  }
});
