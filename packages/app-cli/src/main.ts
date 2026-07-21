import { MatchRules, SubstitutionRules } from "@fut/domain";
import { MatchSimulator } from "@fut/engine";
import { getCatalog, isLocale, type Locale } from "@fut/i18n";
import { renderMatch } from "./render.js";
import { defaultMatchup } from "./teamFactory.js";

interface CliOptions {
  locale: Locale;
  seed: number;
  knockout: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  let locale: Locale = "en";
  let seed = 42;
  let knockout = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const [key, inlineValue] = arg.split("=");
    const value = inlineValue ?? argv[i + 1];
    if (key === "--locale" && value) {
      if (isLocale(value)) locale = value;
      if (!inlineValue) i++;
    } else if (key === "--seed" && value) {
      const n = Number(value);
      if (Number.isFinite(n)) seed = Math.trunc(n);
      if (!inlineValue) i++;
    } else if (key === "--knockout") {
      knockout = true;
    }
  }
  return { locale, seed, knockout };
}

function main(): void {
  const { locale, seed, knockout } = parseArgs(process.argv.slice(2));
  const { home, away } = defaultMatchup();
  const simulator = new MatchSimulator();
  const result = simulator.simulate({
    home,
    away,
    seed,
    matchRules: knockout ? MatchRules.knockout() : MatchRules.league(),
    substitutionRules: SubstitutionRules.brasileirao(),
  });
  console.log(renderMatch(result, getCatalog(locale)));
}

main();
