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
var import_child_process2 = require("child_process");

// main/pipeline/TrainingPipeline.ts
var path2 = __toESM(require("path"));

// main/pipeline/stages.ts
var import_child_process = require("child_process");
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function runProcess(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const proc = (0, import_child_process.spawn)(cmd, args, {
      cwd: opts.cwd,
      shell: false,
      windowsHide: true
    });
    opts.onLog(`[CMD] ${cmd} ${args.join(" ")}`);
    proc.stdout?.on("data", (d) => {
      d.toString().split("\n").filter(Boolean).forEach(opts.onLog);
    });
    proc.stderr?.on("data", (d) => {
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
  } catch {
    return false;
  }
}
async function stageValidate(ctx) {
  ctx.onLog("\uC785\uB825 \uD30C\uC77C \uBC0F \uC2E4\uD589 \uD658\uACBD\uC744 \uAC80\uC99D\uD569\uB2C8\uB2E4.");
  ctx.onProgress(2, "\uC785\uB825 \uD30C\uC77C \uAC80\uC99D \uC911...");
  if (ctx.videoPaths.length < 2) {
    throw new Error("\uBA40\uD2F0\uBDF0 \uD559\uC2B5\uC5D0\uB294 \uCD5C\uC18C 2\uAC1C \uC774\uC0C1\uC758 \uC601\uC0C1\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
  }
  let totalSize = 0;
  for (const vp of ctx.videoPaths) {
    if (!fs.existsSync(vp)) throw new Error(`\uC785\uB825 \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${vp}`);
    totalSize += fs.statSync(vp).size;
  }
  ctx.onLog(`\uC785\uB825 \uD30C\uC77C ${ctx.videoPaths.length}\uAC1C (${(totalSize / 1024 / 1024).toFixed(1)} MB)`);
  ctx.videoPaths.forEach(
    (vp, i) => ctx.onLog(`  [cam${String(i + 1).padStart(2, "0")}] ${vp}`)
  );
  const missing = [];
  if (!commandExists("ffmpeg"))
    missing.push("ffmpeg");
  else
    ctx.onLog("\u2713 ffmpeg");
  const colmapBin = process.env.COLMAP_BIN;
  if (!commandExists("colmap") && (!colmapBin || !fs.existsSync(colmapBin)))
    missing.push("COLMAP (PATH \uB610\uB294 COLMAP_BIN \uD658\uACBD\uBCC0\uC218)");
  else
    ctx.onLog("\u2713 COLMAP");
  if (!commandExists("python") && !commandExists("python3"))
    missing.push("Python 3.10+");
  else
    ctx.onLog("\u2713 Python");
  const scriptPath = process.env["4DGS_SCRIPT_PATH"];
  if (!scriptPath || !fs.existsSync(scriptPath))
    missing.push("4DGS_SCRIPT_PATH \uD658\uACBD\uBCC0\uC218 (train.py \uACBD\uB85C)");
  else
    ctx.onLog(`\u2713 4DGS \uC2A4\uD06C\uB9BD\uD2B8: ${scriptPath}`);
  if (missing.length > 0)
    throw new Error(`\uB2E4\uC74C \uB3C4\uAD6C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4:
${missing.map((m) => `  \u2022 ${m}`).join("\n")}`);
  for (const dir of [ctx.workDir, ctx.gsDir, ctx.colmapTmpDir])
    fs.mkdirSync(dir, { recursive: true });
  ctx.onLog(`\uC791\uC5C5 \uB514\uB809\uD1A0\uB9AC: ${ctx.workDir}`);
  ctx.onProgress(5, "\uD658\uACBD \uAC80\uC99D \uC644\uB8CC");
}
async function stageExtract(ctx) {
  ctx.onLog("ffmpeg\uC73C\uB85C \uD504\uB808\uC784\uC744 \uCD94\uCD9C\uD569\uB2C8\uB2E4.");
  ctx.onProgress(8, "ffmpeg \uD504\uB808\uC784 \uCD94\uCD9C \uC911...");
  const fps = process.env["4DGS_EXTRACT_FPS"] ?? "2";
  let totalExtracted = 0;
  for (let i = 0; i < ctx.videoPaths.length; i++) {
    const camId = `cam${String(i + 1).padStart(2, "0")}`;
    const camDir = path.join(ctx.gsDir, camId);
    fs.mkdirSync(camDir, { recursive: true });
    ctx.onLog(`[${camId}] \uD504\uB808\uC784 \uCD94\uCD9C: ${path.basename(ctx.videoPaths[i])}`);
    await runProcess(
      "ffmpeg",
      [
        "-y",
        "-i",
        ctx.videoPaths[i],
        "-r",
        fps,
        "-q:v",
        "1",
        "-f",
        "image2",
        path.join(camDir, "frame_%05d.jpg")
        // frame_00001.jpg …
      ],
      { cwd: ctx.workDir, signal: ctx.signal, onLog: ctx.onLog }
    );
    const count = fs.readdirSync(camDir).filter((f) => f.endsWith(".jpg")).length;
    if (count < 5)
      throw new Error(`[${camId}] \uD504\uB808\uC784 \uC218 \uBD80\uC871 (${count}\uC7A5, \uCD5C\uC18C 5\uC7A5 \uD544\uC694)`);
    ctx.onLog(`\u2713 [${camId}] ${count}\uC7A5 \uCD94\uCD9C \uC644\uB8CC`);
    totalExtracted += count;
    const pct = 8 + Math.round((i + 1) / ctx.videoPaths.length * 12);
    ctx.onProgress(pct, `\uD504\uB808\uC784 \uCD94\uCD9C \uC911... (${i + 1}/${ctx.videoPaths.length})`);
  }
  ctx.onProgress(20, `\uCD1D ${totalExtracted}\uD504\uB808\uC784 \uCD94\uCD9C \uC644\uB8CC`);
}
async function stageColmap(ctx) {
  ctx.onLog("COLMAP \uCE74\uBA54\uB77C \uCE98\uB9AC\uBE0C\uB808\uC774\uC158\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4 (\uCCAB \uD504\uB808\uC784 \uAE30\uC900).");
  ctx.onProgress(22, "COLMAP \uC900\uBE44 \uC911...");
  const colmapCmd = commandExists("colmap") ? "colmap" : process.env.COLMAP_BIN ?? "colmap";
  const python = commandExists("python3") ? "python3" : "python";
  const scriptDir = path.dirname(process.env["4DGS_SCRIPT_PATH"]);
  const colmapImagesDir = path.join(ctx.colmapTmpDir, "images");
  fs.mkdirSync(colmapImagesDir, { recursive: true });
  const camDirs = ctx.videoPaths.map((_, i) => `cam${String(i + 1).padStart(2, "0")}`);
  for (let i = 0; i < camDirs.length; i++) {
    const firstFrame = path.join(ctx.gsDir, camDirs[i], "frame_00001.jpg");
    if (!fs.existsSync(firstFrame))
      throw new Error(`\uCCAB \uBC88\uC9F8 \uD504\uB808\uC784\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${firstFrame}`);
    fs.copyFileSync(firstFrame, path.join(colmapImagesDir, `image${i + 1}.jpg`));
    ctx.onLog(`  [cam${String(i + 1).padStart(2, "0")}] image${i + 1}.jpg \uBCF5\uC0AC`);
  }
  ctx.onLog(`\u2713 COLMAP \uC785\uB825 \uC774\uBBF8\uC9C0 ${camDirs.length}\uC7A5 \uC900\uBE44`);
  const dbPath = path.join(ctx.colmapTmpDir, "database.db");
  const sparseDir = path.join(ctx.colmapTmpDir, "sparse");
  fs.mkdirSync(sparseDir, { recursive: true });
  const useGpu = process.env.COLMAP_USE_GPU !== "0";
  function extractorArgs(gpu) {
    return [
      "feature_extractor",
      "--database_path",
      dbPath,
      "--image_path",
      colmapImagesDir,
      "--ImageReader.single_camera",
      "1",
      // 모든 카메라가 동일한 내부 파라미터 공유
      "--ImageReader.camera_model",
      "PINHOLE",
      "--FeatureExtraction.use_gpu",
      gpu ? "1" : "0"
    ];
  }
  ctx.onProgress(25, "COLMAP \uD2B9\uC9D5\uC810 \uCD94\uCD9C \uC911...");
  try {
    await runProcess(colmapCmd, extractorArgs(useGpu), { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog });
  } catch (e) {
    if (!useGpu) throw e;
    ctx.onLog("[WARN] GPU \uCD94\uCD9C \uC2E4\uD328 \u2192 CPU\uB85C \uC7AC\uC2DC\uB3C4", "warn");
    await runProcess(colmapCmd, extractorArgs(false), { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog });
  }
  ctx.onProgress(30, "COLMAP \uD2B9\uC9D5\uC810 \uB9E4\uCE6D \uC911...");
  function matcherArgs(gpu) {
    return ["exhaustive_matcher", "--database_path", dbPath, "--FeatureMatching.use_gpu", gpu ? "1" : "0"];
  }
  try {
    await runProcess(colmapCmd, matcherArgs(useGpu), { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog });
  } catch (e) {
    if (!useGpu) throw e;
    ctx.onLog("[WARN] GPU \uB9E4\uCE6D \uC2E4\uD328 \u2192 CPU\uB85C \uC7AC\uC2DC\uB3C4", "warn");
    await runProcess(colmapCmd, matcherArgs(false), { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog });
  }
  ctx.onProgress(35, "COLMAP 3D \uC7AC\uAC74 \uC911...");
  await runProcess(
    colmapCmd,
    ["mapper", "--database_path", dbPath, "--image_path", colmapImagesDir, "--output_path", sparseDir],
    { cwd: ctx.colmapTmpDir, signal: ctx.signal, onLog: ctx.onLog }
  );
  const model0 = path.join(sparseDir, "0");
  if (!fs.existsSync(model0))
    throw new Error("COLMAP \uC7AC\uAC74 \uC2E4\uD328. \uCE74\uBA54\uB77C \uD3EC\uC988\uB97C \uCD94\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  ctx.onProgress(40, "COLMAP \uC644\uB8CC \u2014 \uD3EC\uC778\uD2B8 \uD074\uB77C\uC6B0\uB4DC \uC0DD\uC131 \uC911...");
  const sparsePlyPath = path.join(ctx.colmapTmpDir, "points3D_sparse.ply");
  await runProcess(
    python,
    [path.join(scriptDir, "scripts", "export_sparse_ply.py"), model0, sparsePlyPath],
    { cwd: scriptDir, signal: ctx.signal, onLog: ctx.onLog }
  );
  ctx.onProgress(44, "\uD3EC\uC778\uD2B8 \uD074\uB77C\uC6B0\uB4DC \uB2E4\uC6B4\uC0D8\uD50C \uC911...");
  const outputPlyPath = path.join(ctx.gsDir, "points3D_multipleview.ply");
  await runProcess(
    python,
    [path.join(scriptDir, "scripts", "downsample_point.py"), sparsePlyPath, outputPlyPath],
    { cwd: scriptDir, signal: ctx.signal, onLog: ctx.onLog }
  );
  ctx.onLog(`\u2713 points3D_multipleview.ply \uC0DD\uC131 \uC644\uB8CC`);
  const gsSparseDir = path.join(ctx.gsDir, "sparse_");
  fs.mkdirSync(gsSparseDir, { recursive: true });
  for (const f of ["cameras.bin", "images.bin", "points3D.bin"]) {
    const src = path.join(model0, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(gsSparseDir, f));
  }
  ctx.onLog("\u2713 sparse_ \uB514\uB809\uD1A0\uB9AC \uC0DD\uC131 \uC644\uB8CC");
  ctx.onProgress(48, "COLMAP \uC644\uB8CC");
}
async function stagePoses(ctx) {
  ctx.onLog("\uCE74\uBA54\uB77C \uD3EC\uC988 \uD30C\uC77C\uC744 \uC0DD\uC131\uD569\uB2C8\uB2E4 (LLFF \uD615\uC2DD).");
  ctx.onProgress(50, "poses_bounds \uC0DD\uC131 \uC911...");
  const python = commandExists("python3") ? "python3" : "python";
  const scriptDir = path.dirname(process.env["4DGS_SCRIPT_PATH"]);
  const sparseDir = path.join(ctx.gsDir, "sparse_");
  const outputNpy = path.join(ctx.gsDir, "poses_bounds_multipleview.npy");
  await runProcess(
    python,
    [path.join(scriptDir, "scripts", "gen_poses_bounds.py"), sparseDir, outputNpy],
    { cwd: scriptDir, signal: ctx.signal, onLog: ctx.onLog }
  );
  ctx.onLog("\u2713 poses_bounds_multipleview.npy \uC0DD\uC131 \uC644\uB8CC");
  ctx.onProgress(55, "\uD3EC\uC988 \uC0DD\uC131 \uC644\uB8CC");
}
async function stageInit(ctx) {
  ctx.onLog("4DGaussians \uC124\uC815\uC744 \uD655\uC778\uD569\uB2C8\uB2E4.");
  ctx.onProgress(57, "\uC124\uC815 \uD655\uC778 \uC911...");
  const scriptDir = path.dirname(process.env["4DGS_SCRIPT_PATH"]);
  const configPath = path.join(scriptDir, "arguments", "multipleview", "default.py");
  if (!fs.existsSync(configPath))
    throw new Error(`4DGaussians config \uD30C\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4: ${configPath}
4DGaussians arguments/multipleview/default.py \uD30C\uC77C\uC744 \uD655\uC778\uD558\uC138\uC694.`);
  ctx.onLog(`\u2713 config: ${configPath}`);
  ctx.onProgress(58, "\uCD08\uAE30\uD654 \uC644\uB8CC");
}
async function stageOptimize(ctx) {
  ctx.onLog("4D Gaussian Splatting \uD559\uC2B5\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4.");
  ctx.onProgress(60, "4DGS \uBAA8\uB378 \uCD5C\uC801\uD654 \uC911...");
  const scriptPath = process.env["4DGS_SCRIPT_PATH"];
  const scriptDir = path.dirname(scriptPath);
  const python = commandExists("python3") ? "python3" : "python";
  const expname = `multipleview/${path.basename(ctx.workDir).replace(/[^a-zA-Z0-9_\-]/g, "_")}`;
  let lastProgress = 60;
  await runProcess(
    python,
    [
      scriptPath,
      "-s",
      ctx.gsDir,
      "-m",
      path.join(ctx.gsDir, "output"),
      "--expname",
      expname,
      "--configs",
      path.join(scriptDir, "arguments", "multipleview", "default.py"),
      "--port",
      "6009"
    ],
    {
      cwd: scriptDir,
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
  if (plyFiles.length === 0)
    throw new Error(`PLY \uD30C\uC77C\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${outputDir}`);
  ctx.onLog(`\u2713 PLY \uD30C\uC77C ${plyFiles.length}\uAC1C \uBC1C\uACAC`);
  plyFiles.slice(0, 5).forEach((f) => ctx.onLog(`  - ${path.basename(f)}`));
  ctx.onProgress(100, `\uC644\uB8CC \u2014 PLY ${plyFiles.length}\uAC1C`);
  return { folderPath: outputDir, plyFiles };
}
function findPlyFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ply")) results.push(full);
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
  cancel() {
    this.abortController?.abort();
  }
  async run(videoPaths) {
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const workDir = path2.join(path2.dirname(videoPaths[0]), `4dgs_${videoPaths.length}cams_${timestamp}`);
    const gsDir = path2.join(workDir, "gs");
    const colmapTmpDir = path2.join(workDir, "colmap_tmp");
    const ctx = {
      videoPaths,
      workDir,
      gsDir,
      colmapTmpDir,
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
      { name: "colmap", label: "COLMAP \uCE98\uB9AC\uBE0C\uB808\uC774\uC158", fn: stageColmap },
      { name: "poses", label: "\uD3EC\uC988 \uC0DD\uC131", fn: stagePoses },
      { name: "init", label: "\uC124\uC815 \uD655\uC778", fn: stageInit },
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
      if (!exportResult) throw new Error("Export \uB2E8\uACC4 \uACB0\uACFC \uC5C6\uC74C");
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
    if (this.window.isDestroyed()) return;
    try {
      this.window.webContents.send(channel, ...args);
    } catch {
    }
  }
};

// main/main.ts
var mainWindow = null;
var activePipeline = null;
var activeRender = null;
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
    activePipeline?.cancel();
    activePipeline = null;
    mainWindow = null;
  });
}
import_electron.app.whenReady().then(() => {
  import_electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Cross-Origin-Opener-Policy": ["same-origin"],
        "Cross-Origin-Embedder-Policy": ["require-corp"]
      }
    });
  });
  createWindow();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
import_electron.app.on("window-all-closed", () => {
  activePipeline?.cancel();
  if (process.platform !== "darwin") {
    import_electron.app.quit();
  }
});
import_electron.ipcMain.handle("open-video-files", async () => {
  if (!mainWindow) return null;
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Videos", extensions: ["mp4", "mov", "avi", "mkv"] }
    ],
    title: "\uBA40\uD2F0\uBDF0 \uC601\uC0C1 \uD30C\uC77C \uC120\uD0DD (\uC5EC\uB7EC \uAC01\uB3C4\uC5D0\uC11C \uCD2C\uC601\uD55C \uC601\uC0C1\uC744 \uBAA8\uB450 \uC120\uD0DD)"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return { videoPaths: result.filePaths };
});
import_electron.ipcMain.handle("start-local-training", async (_event, videoPaths) => {
  if (!mainWindow) return { success: false, folderPath: "", plyFiles: [], fileCount: 0, error: "No window" };
  if (activePipeline) {
    activePipeline.cancel();
    activePipeline = null;
  }
  activePipeline = new TrainingPipeline(mainWindow);
  const result = await activePipeline.run(videoPaths);
  activePipeline = null;
  return result;
});
import_electron.ipcMain.handle("cancel-training", async () => {
  if (activePipeline) {
    activePipeline.cancel();
    activePipeline = null;
  }
});
import_electron.ipcMain.handle("read-ply-file", async (_event, filePath) => {
  const fs2 = require("fs");
  try {
    const buf = fs2.readFileSync(filePath);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return null;
  }
});
import_electron.ipcMain.handle("open-output-folder", async () => {
  if (!mainWindow) return null;
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "4DGS \uD559\uC2B5 output \uD3F4\uB354 \uC120\uD0DD (train.py \uC2E4\uD589 \uACB0\uACFC \uD3F4\uB354)"
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const outputDir = result.filePaths[0];
  const pcDir = path3.join(outputDir, "point_cloud");
  const fs2 = require("fs");
  if (!fs2.existsSync(pcDir)) {
    return { folderPath: outputDir, plyFiles: [] };
  }
  const iterDirs = fs2.readdirSync(pcDir).filter((d) => /^(coarse_|fine_)?iteration_/.test(d)).sort((a, b) => {
    const na = parseInt(a.replace(/\D+/g, ""), 10);
    const nb = parseInt(b.replace(/\D+/g, ""), 10);
    return na - nb;
  });
  const plyFiles = iterDirs.map((d) => path3.join(pcDir, d, "point_cloud.ply")).filter((f) => fs2.existsSync(f));
  return { folderPath: outputDir, plyFiles };
});
import_electron.ipcMain.handle("open-ply-sequence-folder", async () => {
  if (!mainWindow) return null;
  const result = await import_electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "PLY \uC2DC\uD000\uC2A4 \uD3F4\uB354 \uC120\uD0DD (point_pertimestamp \uB4F1)"
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const fs2 = require("fs");
  const folderPath = result.filePaths[0];
  const plyFiles = fs2.readdirSync(folderPath).filter((f) => f.toLowerCase().endsWith(".ply")).sort().map((f) => path3.join(folderPath, f));
  return { folderPath, plyFiles };
});
function sendRender(channel, ...args) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    mainWindow.webContents.send(channel, ...args);
  } catch {
  }
}
import_electron.ipcMain.handle("start-render", async (_event, config) => {
  if (!mainWindow) return { success: false, error: "No window" };
  if (activeRender) {
    activeRender.kill();
    activeRender = null;
  }
  const fs2 = require("fs");
  const scriptPath = process.env["4DGS_SCRIPT_PATH"];
  if (!scriptPath) return { success: false, error: "4DGS_SCRIPT_PATH \uD658\uACBD\uBCC0\uC218\uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4." };
  const scriptDir = path3.dirname(scriptPath);
  const renderScript = path3.join(scriptDir, "render_path.py");
  if (!fs2.existsSync(renderScript)) {
    return { success: false, error: `render_path.py\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${renderScript}` };
  }
  fs2.mkdirSync(config.outputDir, { recursive: true });
  const pathJsonFile = path3.join(config.outputDir, "camera_path.json");
  fs2.writeFileSync(pathJsonFile, config.pathJsonContent, "utf8");
  const python = require("child_process").spawnSync(
    process.platform === "win32" ? "where" : "which",
    ["python3"],
    { encoding: "utf8" }
  ).status === 0 ? "python3" : "python";
  return new Promise((resolve) => {
    activeRender = (0, import_child_process2.spawn)(python, [
      renderScript,
      "--model_path",
      config.modelPath,
      "--source_path",
      config.sourcePath,
      "--path_json",
      pathJsonFile,
      "--output_dir",
      config.outputDir,
      "--width",
      String(config.width),
      "--height",
      String(config.height),
      "--iteration",
      String(config.iteration)
    ], { cwd: scriptDir, windowsHide: true });
    activeRender.stdout?.on("data", (d) => {
      for (const line of d.toString().split("\n").filter(Boolean)) {
        const m = line.match(/\[PROGRESS\]\s+(\d+)\/(\d+)/);
        if (m) sendRender("render-progress", parseInt(m[1]), parseInt(m[2]));
        else sendRender("render-log", line);
      }
    });
    activeRender.stderr?.on("data", (d) => {
      d.toString().split("\n").filter(Boolean).forEach((l) => sendRender("render-log", l));
    });
    activeRender.on("close", (code) => {
      activeRender = null;
      if (code === 0 || code === null) {
        sendRender("render-done", config.outputDir);
        resolve({ success: true, outputDir: config.outputDir });
      } else {
        sendRender("render-error", `\uB80C\uB354\uB9C1 \uC2E4\uD328 (exit ${code})`);
        resolve({ success: false, error: `exit code ${code}` });
      }
    });
    activeRender.on("error", (err) => {
      activeRender = null;
      sendRender("render-error", err.message);
      resolve({ success: false, error: err.message });
    });
  });
});
import_electron.ipcMain.handle("cancel-render", () => {
  if (activeRender) {
    activeRender.kill("SIGTERM");
    activeRender = null;
  }
});
import_electron.ipcMain.handle("save-video", async (_event, buffer, defaultName) => {
  if (!mainWindow) return false;
  const result = await import_electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [
      { name: "WebM Video", extensions: ["webm"] },
      { name: "MP4 Video", extensions: ["mp4"] }
    ],
    title: "\uB0B4\uBCF4\uB0BC \uD30C\uC77C \uC704\uCE58 \uC120\uD0DD"
  });
  if (result.canceled || !result.filePath) return false;
  const fs2 = require("fs");
  fs2.writeFileSync(result.filePath, Buffer.from(buffer));
  return true;
});
