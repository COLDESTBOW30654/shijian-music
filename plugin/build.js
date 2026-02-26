const fs = require("fs");
const { build } = require("esbuild");

const entryPoints = [];
const checkEntry = (path) => {
    if (fs.existsSync(path)) entryPoints.push(path);
};

checkEntry("src/main.tsx");

build({
    entryPoints,
    target: "chrome91",
    bundle: true,
    sourcemap: process.argv.includes("--dev") ? "inline" : false,
    minify: !process.argv.includes("--dev"),
    outdir: "./dist",
    define: {
        DEBUG: process.argv.includes("--dev").toString(),
    },
    watch: process.argv.includes("--watch")
        ? {
            onRebuild(err, result) {
                console.log("Rebuilding");
                if (err) {
                    console.warn(err.message);
                } else if (result) {
                    copyManifest();
                    console.log("Build success");
                }
            },
        }
        : undefined,
}).then(() => {
    copyManifest();
    console.log("Build success");
});

function copyManifest() {
    if (fs.existsSync("manifest.json")) {
        fs.copyFileSync("manifest.json", "dist/manifest.json");
    }
}
