#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");
const glob = require("glob");
const tar = require("tar");
const jsonfile = require("jsonfile");
const { copyFileSync, rmSync, mkdirSync, readdirSync } = fs;

const execPromise = promisify(exec);

async function run(cmd) {
  try {
    const { stdout, stderr } = await execPromise(cmd);
    console.log(stdout);
    console.error(stderr);
  } catch (err) {
    console.error(`Command failed: ${cmd}`);
    console.error(`Error message: ${err.message}`);
    throw err;
  }
}

// Function to read file content
function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

// Function to generate translations JSON
function genTranslations(src, dst) {
  const result = {};
  glob.sync("*.json", { cwd: src }).forEach((file) => {
    const lang = path.basename(file, ".json");
    result[lang] = JSON.parse(readFile(path.join(src, file)));
  });
  jsonfile.writeFileSync(dst, result, { spaces: 2, EOL: "\n" });
}

// Function to generate manifest JSON
function genManifest(src, dst) {
  const pkg = JSON.parse(readFile("package.json"));
  const result = JSON.parse(readFile(src));
  result.version = pkg.version;
  jsonfile.writeFileSync(dst, result, { spaces: 2, EOL: "\n" });
}

// Function to create a tar.gz archive
function genTar(src, dst) {
  tar.c(
    {
      gzip: true,
      file: dst,
      cwd: src,
      portable: true,
      noMtime: true,
    },
    readdirSync(src)
  );
}

// Function to combine CSS and JS into HTML
function combine(filePath) {
  let content = readFile(filePath);
  content = content
    .replace(
      '<link rel="stylesheet" href="./app.css">',
      `<style>\n${readFile("build/app.css")}\n</style>`
    )
    .replace(
      '<link rel="stylesheet" href="./viper_lib.css">',
      `<style>\n${readFile("build/viper_lib.css")}\n</style>`
    )
    .replace(
      '<script src="./app.js"></script>',
      `<script>\n${readFile("build/app.js")}\n</script>`
    )
    .replace(
      '<script src="./viper_lib.js"></script>',
      `<script>\n${readFile("build/viper_lib.js")}\n</script>`
    );
  fs.writeFileSync(filePath, content, "utf8");
}

// Main script execution
async function main() {
  // Prepare
  rmSync("build", { recursive: true, force: true });
  mkdirSync("build/assets", { recursive: true });
  copyFileSync("./src/webrepl_content.js", "./build/webrepl_content.js");
  fs.cpSync("./assets", "./build/assets", {
    recursive: true,
    errorOnExist: true,
  });
  genTranslations("./src/lang/", "build/translations.json");
  genManifest("./src/manifest.json", "build/manifest.json");
  genTar("src/tools_vfs", "build/assets/tools_vfs.tar.gz");
  genTar("src/vm_vfs", "build/assets/vm_vfs.tar.gz");

  // Build
  if (!fs.existsSync("node_modules")) {
    await run("npm install");
  }
  await run("npx eslint");
  await run("npm run build");

  // Combine everything
  combine("build/index.html");
  combine("build/bridge.html");
  combine("build/benchmark.html");

  // Cleanup
  fs.unlinkSync("build/translations.json");
  fs.unlinkSync("build/app.css");
  fs.unlinkSync("build/viper_lib.css");
  fs.unlinkSync("build/app.js");
  fs.unlinkSync("build/viper_lib.js");

  // Add assets from packages
  copyFileSync(
    "node_modules/@micropython/micropython-webassembly-pyscript/micropython.wasm",
    "./build/assets/micropython.wasm"
  );
  copyFileSync(
    "node_modules/@micropython/micropython-webassembly-pyscript/micropython.mjs",
    "./build/micropython.mjs"
  );
  copyFileSync(
    "node_modules/@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm",
    "./build/assets/mpy-cross-v6.wasm"
  );
  copyFileSync(
    "node_modules/@astral-sh/ruff-wasm-web/ruff_wasm_bg.wasm",
    "./build/assets/ruff_wasm_bg.wasm"
  );

  console.log("\nBuild complete.");
}

main();
