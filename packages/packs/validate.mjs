// AJV validator for pack data: walks base/*/pack.yaml and industries/*/pack.yaml,
// each with a sibling intents/*.yaml directory, and checks them against pack.schema.json.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { load } from "js-yaml";
import Ajv from "ajv";

const root = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(root, "schema/pack.schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true });
const validatePack = ajv.compile(schema);
const validateIntent = ajv.compile({ ...schema.$defs.intent, $defs: schema.$defs });

let failed = false;
const check = (name, ok, errors) => {
  if (ok) {
    console.log(`✓ ${name}`);
    return;
  }
  failed = true;
  console.error(`✗ ${name}`);
  for (const e of errors ?? []) console.error(`   ${e.instancePath || "/"} ${e.message}`);
};

function findPackDirs(groupDir) {
  const dirs = [];
  if (!existsSync(groupDir)) return dirs;
  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packDir = join(groupDir, entry.name);
    if (existsSync(join(packDir, "pack.yaml"))) dirs.push(packDir);
  }
  return dirs;
}

const packDirs = [...findPackDirs(join(root, "base")), ...findPackDirs(join(root, "industries"))];

for (const dir of packDirs) {
  const rel = dir.slice(root.length + 1);
  check(`${rel}/pack.yaml`, validatePack(load(readFileSync(join(dir, "pack.yaml"), "utf8"))), validatePack.errors);
  const intentsDir = join(dir, "intents");
  if (existsSync(intentsDir)) {
    for (const f of readdirSync(intentsDir).filter((f) => f.endsWith(".yaml"))) {
      check(
        `${rel}/intents/${f}`,
        validateIntent(load(readFileSync(join(intentsDir, f), "utf8"))),
        validateIntent.errors,
      );
    }
  }
}

process.exit(failed ? 1 : 0);
