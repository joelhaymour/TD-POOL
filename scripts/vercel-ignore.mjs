// Vercel skips a build on exit 0, and builds on exit 1.
import { PRODUCTION_VERCEL_PROJECT } from "./environment.mjs";
const isLiveProject = process.env.VERCEL_PROJECT_ID === PRODUCTION_VERCEL_PROJECT;
const branch = process.env.VERCEL_GIT_COMMIT_REF;
const skip = isLiveProject ? branch !== "main" : process.env.TD_POOL_ENV === "staging" && branch === "main";
console.log(skip ? "Skipping branch in this environment." : "Building in the selected environment.");
process.exit(skip ? 0 : 1);
