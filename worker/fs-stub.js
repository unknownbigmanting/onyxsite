// The API modules only touch fs in local-development mode. On the edge there is
// no filesystem, so every call throws a clear error instead of a module load
// failure. GitHub is the store whenever GITHUB_TOKEN / GITHUB_REPO are set.
function unavailable() {
  throw new Error("Filesystem access is not available in this runtime. Set GITHUB_TOKEN and GITHUB_REPO.");
}

export default {
  existsSync: function () { return false; },
  readFileSync: unavailable,
  writeFileSync: unavailable,
  mkdirSync: unavailable,
  createReadStream: unavailable
};
