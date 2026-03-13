import fs from "node:fs";
import path from "node:path";

const allFiles = fs.readdirSync("projects", {
  recursive: true,
  withFileTypes: true,
});

console.dir(allFiles, { colors: true, depth: null });
