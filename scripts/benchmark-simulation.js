#!/usr/bin/env node

const path = require("path");
const {
    DEFAULT_CASES_PATH,
    loadCases,
    runCase,
} = require("./simulation-harness");

function parseArgs(argv) {
    const args = {
        casesPath: DEFAULT_CASES_PATH,
        iterations: 1,
        caseNames: new Set(),
        json: false,
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--cases") {
            args.casesPath = path.resolve(process.cwd(), argv[i + 1]);
            i += 1;
        } else if (arg === "--iterations") {
            args.iterations = Number.parseInt(argv[i + 1], 10);
            i += 1;
        } else if (arg === "--case") {
            args.caseNames.add(argv[i + 1]);
            i += 1;
        } else if (arg === "--json") {
            args.json = true;
        } else if (arg === "--help" || arg === "-h") {
            args.help = true;
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isFinite(args.iterations) || args.iterations < 1) {
        throw new Error("--iterations must be at least 1");
    }

    return args;
}

function printHelp() {
    console.log([
        "Usage: node scripts/benchmark-simulation.js [--iterations 3] [--case level_20_pill] [--json]",
        "",
        "Profiles deterministic optimizer simulation cases from tests/fixtures/simulation_cases.json.",
    ].join("\n"));
}

function stats(values) {
    const sorted = values.slice().sort((a, b) => a - b);
    const sum = values.reduce((total, value) => total + value, 0);
    return {
        minMs: sorted[0],
        meanMs: sum / values.length,
        maxMs: sorted[sorted.length - 1],
    };
}

function roundMs(value) {
    return Number(value.toFixed(3));
}

function formatInteger(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function pad(value, width) {
    const text = String(value);
    return text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;
}

function renderTable(rows) {
    const header = [
        pad("case", 32),
        pad("iterations", 10),
        pad("checks", 14),
        pad("mean ms", 10),
        pad("min ms", 10),
        pad("max ms", 10),
        "max damage",
    ].join("  ");
    console.log(header);
    console.log("-".repeat(header.length));
    for (const row of rows) {
        console.log([
            pad(row.name, 32),
            pad(row.iterations, 10),
            pad(formatInteger(row.checks), 14),
            pad(row.meanMs, 10),
            pad(row.minMs, 10),
            pad(row.maxMs, 10),
            formatInteger(row.maxDamageValue),
        ].join("  "));
    }
}

function benchmarkCase(testCase, iterations) {
    const elapsed = [];
    let sample = null;
    for (let i = 0; i < iterations; i += 1) {
        sample = runCase(testCase, { includeTiming: true });
        elapsed.push(sample.elapsedMs);
    }
    const timing = stats(elapsed);
    return {
        name: testCase.name,
        iterations,
        checks: sample.plan.checks,
        buildCount: sample.result.buildCount,
        maxDamageValue: sample.result.maxDamageValue,
        minMs: roundMs(timing.minMs),
        meanMs: roundMs(timing.meanMs),
        maxMs: roundMs(timing.maxMs),
    };
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
        printHelp();
        return;
    }

    let cases = loadCases(args.casesPath);
    if (args.caseNames.size) {
        cases = cases.filter((testCase) => args.caseNames.has(testCase.name));
    }
    if (!cases.length) {
        throw new Error("No benchmark cases matched.");
    }

    const rows = cases.map((testCase) => benchmarkCase(testCase, args.iterations));
    if (args.json) {
        process.stdout.write(`${JSON.stringify({ cases: rows }, null, 2)}\n`);
    } else {
        renderTable(rows);
    }
}

try {
    main();
} catch (error) {
    console.error(error.message || error);
    process.exit(1);
}
