importScripts("optimizer-core.js");

self.onmessage = (event) => {
    if (!event.data || !["run", "refine"].includes(event.data.type)) return;

    const options = event.data.options || {};
    try {
        if (event.data.type === "refine") {
            const response = self.WareraOptimizer.refineGearRolls(event.data.response, options, progress => self.postMessage({ type: "refinement-progress", progress }));
            self.postMessage({ type: "refined-result", response });
            return;
        }
        const result = self.WareraOptimizer.runSearch(options, (evaluated) => {
            self.postMessage({
                type: "progress",
                workerId: options.workerId,
                evaluated,
            });
        });

        self.postMessage({
            type: "result",
            workerId: options.workerId,
            result,
        });
    } catch (error) {
        self.postMessage({
            type: "error",
            workerId: options.workerId,
            error: error && error.message ? error.message : String(error),
        });
    }
};
