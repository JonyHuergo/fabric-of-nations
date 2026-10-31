/**
 * M11e simulation dependency-graph validation.
 *
 * The Metro/Expo development bundle reports a `Require cycle` warning for every
 * runtime cycle in `packages/sim/dist`. This script builds the module graph from
 * both the TypeScript source (ignoring type-only imports, which are erased) and
 * the generated JavaScript, and fails if any strongly connected component
 * contains more than one module.
 *
 * Usage:
 *   node scripts/m11e/check-sim-dependencies.mjs
 *   node scripts/m11e/check-sim-dependencies.mjs --source-only
 *   node scripts/m11e/check-sim-dependencies.mjs --require-dist
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..", "..");
const SIM = resolve(ROOT, "packages/sim");
const SRC = resolve(SIM, "src");
const DIST = resolve(SIM, "dist");

const args = new Set(process.argv.slice(2));
const sourceOnly = args.has("--source-only");
const requireDist = args.has("--require-dist");

function walk(dir, suffix) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...walk(path, suffix));
    else if (entry.endsWith(suffix)) files.push(path);
  }
  return files.sort();
}

/** Resolve a relative source import to an existing `.ts` file. */
function resolveSourceImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier.replace(/\.(js|ts)$/u, ""));
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Resolve a relative dist import to an existing `.js` file. */
function resolveDistImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const candidate = resolve(dirname(fromFile), specifier);
  return existsSync(candidate) ? candidate : null;
}

function statementIsTypeOnly(fullMatch, typeKeyword, clause) {
  if (typeKeyword !== undefined) return true;
  const trimmed = clause.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return false;
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return false;
  return inner
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .every((part) => part.startsWith("type "));
}

function sourceDependencies(file) {
  const source = readFileSync(file, "utf8");
  const deps = new Set();
  const importOrExport = /\b(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["']/gu;
  let match;
  while ((match = importOrExport.exec(source)) !== null) {
    const [, , typeKeyword, clause, specifier] = match;
    if (statementIsTypeOnly(match[0], typeKeyword, clause)) continue;
    const target = resolveSourceImport(file, specifier);
    if (target !== null) deps.add(target);
  }
  const dynamic = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
  while ((match = dynamic.exec(source)) !== null) {
    const target = resolveSourceImport(file, match[1]);
    if (target !== null) deps.add(target);
  }
  return deps;
}

function distDependencies(file) {
  const source = readFileSync(file, "utf8");
  const deps = new Set();
  const from = /\bfrom\s+["']([^"']+)["']/gu;
  let match;
  while ((match = from.exec(source)) !== null) {
    const target = resolveDistImport(file, match[1]);
    if (target !== null) deps.add(target);
  }
  const dynamic = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu;
  while ((match = dynamic.exec(source)) !== null) {
    const target = resolveDistImport(file, match[1]);
    if (target !== null) deps.add(target);
  }
  return deps;
}

/** Tarjan strongly connected components. */
function stronglyConnectedComponents(files, edges) {
  const indexOf = new Map(files.map((file, index) => [file, index]));
  const adjacency = files.map((file) =>
    [...(edges.get(file) ?? [])].filter((dep) => indexOf.has(dep)).map((dep) => indexOf.get(dep)),
  );
  const indices = new Array(files.length).fill(-1);
  const low = new Array(files.length).fill(0);
  const onStack = new Set();
  const stack = [];
  const components = [];
  let nextIndex = 0;

  function visit(node) {
    indices[node] = nextIndex;
    low[node] = nextIndex;
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);
    for (const neighbour of adjacency[node] ?? []) {
      if (indices[neighbour] === -1) {
        visit(neighbour);
        low[node] = Math.min(low[node], low[neighbour]);
      } else if (onStack.has(neighbour)) {
        low[node] = Math.min(low[node], indices[neighbour]);
      }
    }
    if (low[node] === indices[node]) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(files[member]);
      } while (member !== node);
      components.push(component);
    }
  }

  for (let node = 0; node < files.length; node += 1) {
    if (indices[node] === -1) visit(node);
  }
  return components;
}

export function analyze(referenceDir, files, dependencyOf) {
  const edges = new Map();
  for (const file of files) edges.set(file, dependencyOf(file));
  const components = stronglyConnectedComponents(files, edges);
  const cyclic = components.filter(
    (component) =>
      component.length > 1 ||
      (component.length === 1 && (edges.get(component[0]) ?? new Set()).has(component[0])),
  );
  return { edges, components, cyclic };
}

function report(label, root, analysis) {
  console.log(
    `${label}: ${String(analysis.components.length)} modules, ${String(analysis.cyclic.length)} cyclic component(s)`,
  );
  if (analysis.cyclic.length === 0) return true;
  for (const component of analysis.cyclic) {
    const members = component
      .map((file) => relative(root, file).replaceAll("\\", "/"))
      .sort();
    console.log(`  cycle: ${members.join(" -> ")}`);
    for (const member of members) {
      const deps = [...(analysis.edges.get(join(root, member)) ?? [])]
        .filter((dep) => component.includes(dep))
        .map((dep) => relative(root, dep).replaceAll("\\", "/"));
      if (deps.length > 0) console.log(`    ${member} -> ${deps.join(", ")}`);
    }
  }
  return false;
}

const sourceFiles = walk(SRC, ".ts");
const sourceAnalysis = analyze(SRC, sourceFiles, sourceDependencies);
let ok = report("simulation source (runtime imports)", SRC, sourceAnalysis);

if (!sourceOnly) {
  const distFiles = existsSync(DIST) ? walk(DIST, ".js") : [];
  if (distFiles.length === 0) {
    if (requireDist) {
      console.error("simulation dist: missing; run pnpm -F @century/sim build first");
      ok = false;
    } else {
      console.log("simulation dist: missing (skipped)");
    }
  } else {
    const distAnalysis = analyze(DIST, distFiles, distDependencies);
    ok = report("simulation dist (runtime imports)", DIST, distAnalysis) && ok;
  }
}

process.exitCode = ok ? 0 : 1;
