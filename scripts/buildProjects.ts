import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateProject } from "./validateProjects";
import YAML from "yaml";
import { Objective, Project } from "../schema/projects.schema";
import z from "zod";

const PROJECT_DIR = "projects";
const DIST_DIR = "dist";
const OUTPUT_FILE = "dist/projects.json";

const projects: Project[] = [];
const ids = new Set<string>();
let repoMap = new Map<string, Repo>();

type Objective = z.infer<typeof Objective>;

const objCoverage = new Map<Objective, number>();

type Repo = {
  name: string;
  description: string | null;
  url: string;
  homepageUrl: string | null;
  pushedAt: string;
  stargazerCount: number;
  repositoryTopics: { nodes: { topic: { name: string } }[] };
  languages: Languages;
};

interface Languages {
  totalSize: number;
  edges: {
    size: number;
    node: {
      name: string;
      color: string;
    };
  }[];
}

interface Topics {
  nodes: {
    topic: {
      name: string;
    };
  }[];
}

type CoverageResult<T extends string> = {
  key: T;
  count: number;
  required: number;
  percent: number;
  complete: boolean;
};

// Find all files in the projects directory
const allFiles = readdirSync(PROJECT_DIR, {
  recursive: true,
  withFileTypes: true,
}).filter((f) => !f.name.startsWith("_"));

for (const file of allFiles) {
  if (
    !file.isFile() ||
    ![".json", ".yaml", ".yml"].includes(path.extname(file.name))
  )
    continue;

  const fullPath = path.join(file.parentPath, file.name);
  const raw = readFileSync(fullPath, "utf8");

  let parsed;

  try {
    if (file.name.endsWith(".yaml")) {
      parsed = YAML.parse(raw);
    } else {
      parsed = JSON.parse(raw);
    }
  } catch (err) {
    console.error(`❌ Failed to parse ${fullPath}`);
    throw err;
  }

  const validated = await validateProject(parsed);

  if (!validated) throw new Error("Project Error");

  if (ids.has(validated.id)) {
    console.error(`❌ Duplicate project id: "${validated.id}"`);
    process.exit(1);
  }

  if (validated.objectives) {
    for (const obj of validated.objectives) {
      objCoverage.set(obj.code, (objCoverage.get(obj.code) ?? 0) + 1);
    }
  }

  if (validated.repo) ids.add(validated.repo);

  projects.push(normalizeVideos(validated));
}

for (const group of chunk<string>(toArr<string>(ids), 20)) {
  const query = buildRepoQuery(group);
  const res = await fetchGitHubStats(query);

  repoMap = createRepoMap(res);
}

mkdirSync(DIST_DIR, { recursive: true });

writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(
    { projects: mergeProjectsWithRepos(projects, repoMap) },
    null,
    2,
  ),
);

const coverage = getCoverage(objCoverage, Objective.options, 2);
printCoverage(coverage);

console.log(`✅ Built ${projects.length} projects → ${OUTPUT_FILE}`);

function getEmbedUrl(url: string) {
  if (url.includes("youtube.com/watch")) {
    const id = new URL(url).searchParams.get("v");
    return `https://www.youtube.com/embed/${id}`;
  }

  if (url.includes("youtu.be")) {
    const id = url.split("/").pop();
    return `https://www.youtube.com/embed/${id}`;
  }

  if (url.includes("/shorts/")) {
    const id = url.split("/").pop();
    return `https://youtube.com/embed/${id}`;
  }

  return url;
}

function normalizeVideos(project: Project) {
  if (project.media?.videos) {
    return {
      ...project,
      media: {
        videos: project.media.videos.map((vid) => getEmbedUrl(vid)),
        docs: project.media.docs,
        images: project.media.images,
      },
    };
  }

  return project;
}

//#region GitHub Repo Details
function buildRepoQuery(repos: string[]) {
  let query = "query {";

  repos.map((repo, i) => {
    const [owner, name] = repo.split("/");

    query += `
      repo${i}: repository(owner: "${owner}", name: "${name}") {
        name
        description
        url
        homepageUrl
        pushedAt
        stargazerCount
        isFork

        repositoryTopics(first: 10) {
          nodes { topic { name } }
        }

        languages(first: 5) {
          totalSize
          edges {
            size
            node { name color }
          }
        }
      }\n
    `;
  });

  return query + "\n}";
}

async function fetchGitHubStats(query: string) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
    }),
  });
  const json = await res.json();
  const normalized = normalizeRepos(json.data);

  return normalized;
}

function normalizeRepos(data: Record<string, Repo>): Repo[] {
  return Object.values(data);
}

type NormalizedLanguage = {
  name: string;
  color: string;
  percent: number;
};

function normalizeLanguages(languages: Languages): {
  totalSize: number;
  items: NormalizedLanguage[];
} {
  const total = languages.totalSize;

  const langs: Set<NormalizedLanguage> = new Set();
  const percentages: Record<string, number> = {};

  for (const [_, lang] of Object.entries(languages.edges)) {
    percentages[lang.node.name] = Math.round((lang.size / total) * 100);
  }

  languages.edges.map((lang) => {
    langs.add({
      name: lang.node.name,
      color: lang.node.color,
      percent: percentages[lang.node.name],
    });
  });

  return {
    totalSize: total,
    items: toArr(langs),
  };
}

function normalizeTopics(topics: Topics) {
  return topics.nodes.map((node) => node.topic.name);
}

function createRepoMap(repos: Repo[]) {
  return new Map(repos.map((repo) => [repo.name.toLowerCase(), repo]));
}

function mergeProjectsWithRepos(
  projects: Project[],
  repoMap: Map<string, Repo>,
) {
  return projects.map((project) => {
    const repoName = project.repo?.toLowerCase().split("/").pop();

    const repo = repoName ? repoMap.get(repoName) : undefined;

    return {
      ...project,
      github: repo
        ? {
            url: repo.url,
            homepageUrl: repo.homepageUrl,
            pushedAt: repo.pushedAt,
            stars: repo.stargazerCount,
            topics: normalizeTopics(repo.repositoryTopics),
            languages: normalizeLanguages(repo.languages),
            lastUpdated: repo.pushedAt,
          }
        : null,
    };
  });
}
//#endregion

//#region Coverage
export function getCoverage<const T extends readonly string[]>(
  map: Map<T[number], number>,
  allKeys: T,
  required: number,
) /*: CoverageResult<T>[]*/ {
  {
    return allKeys.map((key) => {
      const count = map.get(key) ?? 0;
      const percent = Math.min((count / required) * 100, 100);

      return {
        key,
        count,
        required,
        percent,
        complete: count >= required,
      };
    });
  }
}

export function printCoverage<T extends string>(results: CoverageResult<T>[]) {
  const missing = results.filter((r) => !r.complete);

  console.log("\n=== OBJECTIVE COVERAGE ===\n");

  for (const r of results) {
    let filled = Math.min(Math.round((r.count / r.required) * 10), 10);
    const bar = "█".repeat(filled) + "░".repeat(10 - filled);

    const coloredBar = colorize(r.percent, bar);

    const status = r.complete ? "✅" : "❌";

    console.log(
      `${r.key.padEnd(6)} | ${coloredBar} | ${r.count}/${r.required} ${status}`,
    );
  }

  const totalNeeded = results.reduce(
    (sum, r) => sum + Math.max(0, r.required - r.count),
    0,
  );

  const completed = results.filter((r) => r.complete).length;

  if (missing.length === 0) {
    console.log("🎉 All objectives satisfied. You're done.");
    return;
  }

  // Group by prefix (before "-")
  const groups = groupBy(missing, (r) => r.key.split("-")[0]);

  console.log("\n=== MISSING COVERAGE ===\n");

  for (const [group, items] of Object.entries(groups)) {
    console.log(`== ${group} ==`);

    const tableData = items
      .sort((a, b) => {
        const needDiff = b.required - b.count - (a.required - a.count);
        if (needDiff !== 0) return needDiff;
        return a.key.localeCompare(b.key);
      })
      .map((r) => ({
        Code: r.key,
        Needed: `${r.required - r.count}x`,
        Current: r.count,
        Required: r.required,
      }));

    console.table(tableData);

    console.log(""); // spacing between groups
  }

  const totalPercent =
    results.reduce((sum, r) => sum + r.percent, 0) / results.length;

  console.log(`\nOverall progress: ${totalPercent.toFixed(1)}%`);

  console.log("\n=== SUMMARY ===");
  console.log(`Completed: ${completed}/${results.length}`);
  console.log(`Total remaining: ${totalNeeded}`);

  if (totalPercent < 30) {
    console.log("You've got some work to do 😅");
  } else if (totalPercent < 70) {
    console.log("Getting there 👀");
  } else {
    console.log("Almost done 🔥");
  }

  function groupBy<T, K extends string>(
    arr: T[],
    getKey: (item: T) => K,
  ): Record<K, T[]> {
    return arr.reduce(
      (acc, item) => {
        const key = getKey(item);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      },
      {} as Record<K, T[]>,
    );
  }

  function colorize(percent: number, text: string) {
    if (percent <= 33) return `\x1b[31m${text}\x1b[0m`; // red
    if (percent <= 66) return `\x1b[33m${text}\x1b[0m`; // yellow
    return `\x1b[32m${text}\x1b[0m`; // green
  }
}
//#endregion

//#region Utils
function chunk<T>(arr: T[], size: number) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function toArr<T>(set: Set<T>) {
  let arr = [];
  for (const item of set.keys()) {
    arr.push(item);
  }

  return arr;
}
//#endregion
