/* eslint-disable no-console */

// Model3D SKP -> GLB worker
//
// Railway setup notes:
// - Add a worker service that runs this script.
// - Required env: DATABASE_URL
// - Temp upload dir must be shared with the API: MODEL3D_TEMP_DIR (e.g. /data/skp-temp)
// - Output dir for GLB: MODEL3D_OUTPUT_DIR (e.g. /data/models)
// - Converter command: MODEL3D_CONVERTER_CMD (must include {input} and {output})
//   Example: "skp-to-glb --input {input} --output {output}"
// - Optional Blender flow: set BLENDER_BIN and BLENDER_CONVERT_SCRIPT if you prefer Blender.
// - Optional optimizer: MODEL3D_OPTIMIZE_CMD (must include {input})
// - Poll interval: MODEL3D_POLL_INTERVAL_MS (default 30000)
// - Max attempts: MODEL3D_MAX_ATTEMPTS (default 3)
//
// Example Railway command:
//   node scripts/model3d-worker.js
// Local run:
//   dotenv -e .env -- node scripts/model3d-worker.js

const { PrismaClient } = require("@prisma/client");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs/promises");

const prisma = new PrismaClient();

const POLL_INTERVAL_MS = Number.parseInt(process.env.MODEL3D_POLL_INTERVAL_MS || "30000", 10);
const MAX_ATTEMPTS = Number.parseInt(process.env.MODEL3D_MAX_ATTEMPTS || "3", 10);
const OUTPUT_ROOT = process.env.MODEL3D_OUTPUT_DIR || "/data/models";

const CONVERTER_CMD = process.env.MODEL3D_CONVERTER_CMD;
const BLENDER_BIN = process.env.BLENDER_BIN || "blender";
const BLENDER_CONVERT_SCRIPT = process.env.BLENDER_CONVERT_SCRIPT;
const OPTIMIZE_CMD = process.env.MODEL3D_OPTIMIZE_CMD;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeError(err) {
  const raw = err && err.message ? err.message : String(err || "unknown error");
  return raw.slice(0, 2000);
}

function renderCommand(template, values) {
  let cmd = template;
  for (const [key, value] of Object.entries(values)) {
    cmd = cmd.split(`{${key}}`).join(String(value));
  }
  return cmd;
}

async function runShellCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`Command failed (${code}): ${command}`));
    });
  });
}

async function convertSkpToGlb(inputPath, outputPath) {
  if (CONVERTER_CMD) {
    if (!CONVERTER_CMD.includes("{input}") || !CONVERTER_CMD.includes("{output}")) {
      throw new Error("MODEL3D_CONVERTER_CMD must include {input} and {output}");
    }
    const cmd = renderCommand(CONVERTER_CMD, { input: inputPath, output: outputPath });
    await runShellCommand(cmd);
    return;
  }

  if (BLENDER_CONVERT_SCRIPT) {
    const scriptPath = path.resolve(BLENDER_CONVERT_SCRIPT);
    const cmd = `${BLENDER_BIN} --background --python "${scriptPath}" -- "${inputPath}" "${outputPath}"`;
    await runShellCommand(cmd);
    return;
  }

  throw new Error("No converter configured. Set MODEL3D_CONVERTER_CMD or BLENDER_CONVERT_SCRIPT.");
}

async function optimizeGlb(outputPath) {
  if (!OPTIMIZE_CMD) {
    return;
  }
  if (!OPTIMIZE_CMD.includes("{input}")) {
    throw new Error("MODEL3D_OPTIMIZE_CMD must include {input}");
  }
  const cmd = renderCommand(OPTIMIZE_CMD, { input: outputPath });
  await runShellCommand(cmd);
}

async function markJobError(jobId, assetId, message) {
  await prisma.$transaction(async (tx) => {
    await tx.model3DJob.update({
      where: { id: jobId },
      data: {
        status: "ERROR",
        lastError: message,
      },
    });
    await tx.model3DAsset.update({
      where: { id: assetId },
      data: {
        status: "ERROR",
        processingError: message,
      },
    });
  });
}

async function markJobDone(jobId, assetId, glbPath) {
  await prisma.$transaction(async (tx) => {
    await tx.model3DJob.update({
      where: { id: jobId },
      data: {
        status: "DONE",
        lastError: null,
      },
    });
    await tx.model3DAsset.update({
      where: { id: assetId },
      data: {
        status: "READY",
        glbPath,
        originalFileTempPath: null,
        processingError: null,
      },
    });
  });
}

async function claimNextJob() {
  const job = await prisma.model3DJob.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return null;

  if (job.attempts >= MAX_ATTEMPTS) {
    await markJobError(job.id, job.model3dAssetId, "Max attempts reached");
    return null;
  }

  const updated = await prisma.model3DJob.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: {
      status: "PROCESSING",
      attempts: job.attempts + 1,
      lastError: null,
    },
  });

  if (updated.count === 0) return null;

  await prisma.model3DAsset.update({
    where: { id: job.model3dAssetId },
    data: {
      status: "PROCESSING",
      processingError: null,
    },
  });

  return job;
}

async function processJob(job) {
  const asset = await prisma.model3DAsset.findUnique({
    where: { id: job.model3dAssetId },
  });
  if (!asset) {
    throw new Error("Model3DAsset not found");
  }

  if (!asset.originalFileTempPath) {
    throw new Error("originalFileTempPath is missing");
  }

  const outputDir = path.join(OUTPUT_ROOT, asset.productId);
  await fs.mkdir(outputDir, { recursive: true });

  const outputPath = path.join(outputDir, `${asset.id}.glb`);
  await convertSkpToGlb(asset.originalFileTempPath, outputPath);
  await optimizeGlb(outputPath);

  await fs.unlink(asset.originalFileTempPath);

  await markJobDone(job.id, asset.id, outputPath);
}

async function mainLoop() {
  console.log("[model3d-worker] started");

  while (true) {
    let job = null;
    try {
      job = await claimNextJob();
    } catch (err) {
      console.error("[model3d-worker] claim error", err);
    }

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    try {
      console.log(`[model3d-worker] processing job ${job.id}`);
      await processJob(job);
      console.log(`[model3d-worker] job ${job.id} done`);
    } catch (err) {
      const message = normalizeError(err);
      console.error(`[model3d-worker] job ${job.id} failed: ${message}`);
      await markJobError(job.id, job.model3dAssetId, message);
    }
  }
}

mainLoop().catch((err) => {
  console.error("[model3d-worker] fatal error", err);
  process.exitCode = 1;
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
