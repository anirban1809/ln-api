import { build } from "esbuild";

await build({
  entryPoints: ["src/handler.ts"],
  bundle: true,
  platform: "node",
  target: ["node20"],
  outfile: "dist-lambda/handler.js",
  sourcemap: true,
});
console.log("Lambda built to dist-lambda/handler.js");
