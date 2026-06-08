#!/usr/bin/env node

const path = require("path");
const {
    DEFAULT_CASES_PATH,
    buildObjectives,
    loadCases,
} = require("./simulation-harness");

function parseArgs(argv) {
    const args = { casesPath: DEFAULT_CASES_PATH };
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--cases") {
            args.casesPath = path.resolve(process.cwd(), argv[i + 1]);
            i += 1;
        } else if (arg === "--help" || arg === "-h") {
            args.help = true;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }
    return args;
}

function printHelp() {
    console.log([
        "Usage: node scripts/simulation-objectives.js [--cases tests/fixtures/simulation_cases.json]",
        "",
        "Runs deterministic optimizer simulation cases and prints the objective snapshot JSON.",
    ].join("\n"));
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    const cases = loadCases(args.casesPath);
    process.stdout.write(`${JSON.stringify(buildObjectives(cases), null, 2)}\n`);
}

try {
    main();
} catch (error) {
    console.error(error.message || error);
    process.exit(1);
}
