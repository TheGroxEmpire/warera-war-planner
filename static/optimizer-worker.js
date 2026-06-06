importScripts("optimizer-core.js");

self.onmessage = (event) => {
    if (!event.data || event.data.type !== "run") return;

    const options = event.data.options || {};
    try {
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
