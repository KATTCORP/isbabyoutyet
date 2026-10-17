import { eslintCompatPlugin } from "@oxlint/plugins";

import { inferCallbackParams } from "./infer-callback-params.ts";
import { inlineJsxCallback } from "./inline-jsx-callback.ts";
import { noBannedReactReexport } from "./no-banned-react-reexport.ts";
import { noUndocumentedOptional } from "./no-convex-optional.ts";
import { noConvexQueryHooks } from "./no-convex-query-hooks.ts";
import { noCustomTestTimeout } from "./no-custom-test-timeout.ts";
import { noInvalidConvexClient } from "./no-invalid-convex-client.ts";
import { noManualMemoization } from "./no-manual-memoization.ts";
import { noMock } from "./no-mock.ts";
import { noOptional } from "./no-optional.ts";
import { noOverzealousDestructuring } from "./no-overzealous-destructuring.ts";
import { noRafQueryWaterfall } from "./no-raf-query-waterfall.ts";
import { noRhfWatch } from "./no-rhf-watch.ts";
import { noUseEffect } from "./no-use-effect.ts";
import { noUseState } from "./no-use-state.ts";

const plugin = eslintCompatPlugin({
  meta: {
    name: "workspace",
  },
  rules: {
    "infer-callback-params": inferCallbackParams,
    "inline-jsx-callback": inlineJsxCallback,
    "no-banned-react-reexport": noBannedReactReexport,
    "no-convex-query-hooks": noConvexQueryHooks,
    "no-custom-test-timeout": noCustomTestTimeout,
    "no-invalid-convex-client": noInvalidConvexClient,
    "no-manual-memoization": noManualMemoization,
    "no-mock": noMock,
    "no-optional": noOptional,
    "no-overzealous-destructuring": noOverzealousDestructuring,
    "no-raf-query-waterfall": noRafQueryWaterfall,
    "no-rhf-watch": noRhfWatch,
    "no-undocumented-optional": noUndocumentedOptional,
    "no-use-effect": noUseEffect,
    "no-use-state": noUseState,
  },
});

export default plugin;
