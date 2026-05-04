// <define:__ROUTES__>
var define_ROUTES_default = { version: 1, description: "Built with @cloudflare/next-on-pages@1.13.10.", include: ["/*"], exclude: ["/_next/static/*"] };

// node_modules/wrangler/templates/pages-dev-pipeline.ts
import worker from "/Users/apple/Desktop/t5/server/.wrangler/tmp/pages-0Jfpl1/bundledWorker-0.8342097911845825.mjs";
import { isRoutingRuleMatch } from "/Users/apple/Desktop/t5/server/node_modules/wrangler/templates/pages-dev-util.ts";
export * from "/Users/apple/Desktop/t5/server/.wrangler/tmp/pages-0Jfpl1/bundledWorker-0.8342097911845825.mjs";
var routes = define_ROUTES_default;
var pages_dev_pipeline_default = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url);
    for (const exclude of routes.exclude) {
      if (isRoutingRuleMatch(pathname, exclude)) {
        return env.ASSETS.fetch(request);
      }
    }
    for (const include of routes.include) {
      if (isRoutingRuleMatch(pathname, include)) {
        const workerAsHandler = worker;
        if (workerAsHandler.fetch === void 0) {
          throw new TypeError("Entry point missing `fetch` handler");
        }
        return workerAsHandler.fetch(request, env, context);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
export {
  pages_dev_pipeline_default as default
};
//# sourceMappingURL=4j8xwdlgkb.js.map
