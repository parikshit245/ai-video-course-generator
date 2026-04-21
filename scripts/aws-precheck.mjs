import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";

const rootDir = process.cwd();

const checks = [];

const readText = (relativePath) => {
  const absolutePath = path.join(rootDir, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

const addCheck = (status, label, detail) => {
  checks.push({ status, label, detail });
};

const pass = (label, detail) => addCheck("PASS", label, detail);
const warn = (label, detail) => addCheck("WARN", label, detail);
const fail = (label, detail) => addCheck("FAIL", label, detail);

const hasValue = (env, key) => Boolean(String(env[key] || "").trim());

const parseJson = (relativePath) => {
  const text = readText(relativePath);

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const loadEnv = () => {
  const envFiles = [".env", ".env.local"].filter((file) =>
    existsSync(path.join(rootDir, file)),
  );
  const env = {};

  for (const file of envFiles) {
    Object.assign(env, dotenv.parse(readText(file)));
  }

  return { env, envFiles };
};

const checkNodeVersion = () => {
  const [major, minor] = process.versions.node.split(".").map(Number);

  if (major > 20 || (major === 20 && minor >= 16)) {
    pass("Node runtime", `Node ${process.versions.node} is compatible.`);
    return;
  }

  warn(
    "Node runtime",
    `Node ${process.versions.node} works for some flows, but Node 20.16+ or 22 is recommended for AWS.`,
  );
};

const checkBackend = () => {
  const packageJson = parseJson("package.json");

  if (!packageJson) {
    fail("Backend package", "package.json is missing or invalid.");
    return;
  }

  if (packageJson.scripts?.dev?.includes("next dev")) {
    pass("Backend dev command", "npm run dev is configured for Next.js.");
  } else {
    fail("Backend dev command", "Expected package.json scripts.dev to run Next.js.");
  }

  const requiredDeps = ["next", "drizzle-orm", "@aws-sdk/client-s3"];
  for (const dep of requiredDeps) {
    if (packageJson.dependencies?.[dep] || packageJson.devDependencies?.[dep]) {
      pass("Required dependency", `${dep} is installed.`);
    } else {
      fail("Required dependency", `${dep} is missing.`);
    }
  }
};

const checkEnv = () => {
  const { env, envFiles } = loadEnv();

  if (envFiles.length) {
    pass("Environment file", `${envFiles.join(", ")} found.`);
  } else {
    fail("Environment file", "Create .env before AWS work.");
    return;
  }

  const gitignore = readText(".gitignore");
  if (gitignore.includes(".env*")) {
    pass("Secret safety", ".env files are ignored by git.");
  } else {
    warn("Secret safety", "Add .env* to .gitignore before committing.");
  }

  const requiredEnv = [
    "DATABASE_URL",
    "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    "CLERK_SECRET_KEY",
    "AWS_BUCKET_NAME",
    "AWS_REGION",
    "PINECONE_API_KEY",
    "PINECONE_INDEX_HOST",
    "OLLAMA_BASE_URL",
    "OLLAMA_MODEL",
    "OLLAMA_EMBED_MODEL",
  ];

  for (const key of requiredEnv) {
    if (hasValue(env, key)) {
      pass("Required env", `${key} is set.`);
    } else {
      fail("Required env", `${key} is missing.`);
    }
  }

  if ((env.AUDIO_STORAGE || "local") === "s3") {
    pass("Audio storage mode", "AUDIO_STORAGE=s3 is ready for S3 demo.");

    if (hasValue(env, "AWS_ACCESS_KEY_ID") && hasValue(env, "AWS_SECRET_ACCESS_KEY")) {
      pass("Local AWS credentials", "Access key env vars are set for local S3 testing.");
    } else {
      warn(
        "Local AWS credentials",
        "Missing local AWS keys. This is okay on EC2 if you use an IAM role.",
      );
    }
  } else {
    warn("Audio storage mode", "Set AUDIO_STORAGE=s3 before demonstrating S3.");
  }

  if (hasValue(env, "DATABASE_PROVIDER")) {
    pass("Database provider", "DATABASE_PROVIDER is set.");
  } else {
    warn(
      "Database provider",
      "DATABASE_PROVIDER is not set yet. Add DATABASE_PROVIDER=postgres for RDS.",
    );
  }
};

const checkDrizzle = () => {
  const schema = readText("config/schema.ts");
  const drizzleConfig = readText("drizzle.config.ts");

  if (!schema) {
    fail("Drizzle schema", "config/schema.ts is missing.");
    return;
  }

  if (schema.includes("pgTable")) {
    pass("Drizzle schema", "PostgreSQL pgTable schema is present.");
  } else {
    fail("Drizzle schema", "Expected PostgreSQL pgTable schema.");
  }

  const requiredTables = [
    "usersTable",
    "coursesTable",
    "slidesTable",
    "conversationsTable",
    "messagesTable",
    "documentsTable",
  ];

  for (const table of requiredTables) {
    if (schema.includes(`export const ${table}`)) {
      pass("Required table", `${table} exists.`);
    } else {
      fail("Required table", `${table} is missing.`);
    }
  }

  if (schema.includes("audioMetadataTable")) {
    pass("AWS demo table", "audioMetadataTable exists.");
  } else {
    warn(
      "AWS demo table",
      "audioMetadataTable is not added yet. Add it in the AWS demo implementation phase.",
    );
  }

  if (drizzleConfig.includes("schema: './config/schema.ts'")) {
    pass("Drizzle config", "drizzle.config.ts points to config/schema.ts.");
  } else {
    warn("Drizzle config", "Check drizzle.config.ts schema path before RDS push.");
  }
};

const checkS3Upload = () => {
  const audioStorage = readText("lib/audioStorage.ts");

  if (!audioStorage) {
    fail("S3 upload logic", "lib/audioStorage.ts is missing.");
    return;
  }

  const requiredSnippets = [
    "S3Client",
    "PutObjectCommand",
    "AWS_BUCKET_NAME",
    "ContentType: \"audio/mpeg\"",
    "saveAudio",
  ];

  for (const snippet of requiredSnippets) {
    if (audioStorage.includes(snippet)) {
      pass("S3 upload logic", `${snippet} found.`);
    } else {
      fail("S3 upload logic", `${snippet} missing.`);
    }
  }

  const usesAudioS3Prefix =
    /const\s+fileName\s*=\s*`audio\//.test(audioStorage) ||
    /const\s+fileName\s*=\s*"audio\//.test(audioStorage);

  if (usesAudioS3Prefix) {
    pass("S3 key organization", "Audio uploads use the audio/ prefix.");
  } else {
    warn(
      "S3 key organization",
      "Current upload prefix is not audio/. Change it from tts/ to audio/ for the AWS demo.",
    );
  }
};

const printResults = () => {
  const statusIcon = {
    PASS: "[PASS]",
    WARN: "[WARN]",
    FAIL: "[FAIL]",
  };

  console.log("\nIBEX AWS Phase 0 Precheck\n");

  for (const check of checks) {
    console.log(`${statusIcon[check.status]} ${check.label}: ${check.detail}`);
  }

  const failCount = checks.filter((check) => check.status === "FAIL").length;
  const warnCount = checks.filter((check) => check.status === "WARN").length;

  console.log("\nSummary");
  console.log(`PASS: ${checks.length - failCount - warnCount}`);
  console.log(`WARN: ${warnCount}`);
  console.log(`FAIL: ${failCount}`);

  if (failCount > 0) {
    console.log("\nResult: Fix the failed checks before touching AWS.");
    process.exitCode = 1;
    return;
  }

  console.log("\nResult: Phase 0 is ready. Next command: npm run dev");
};

checkNodeVersion();
checkBackend();
checkEnv();
checkDrizzle();
checkS3Upload();
printResults();
