import { type SubstitutionRules } from "@fut/domain";

interface Usage {
  subs: number;
  windows: number;
  lastWindowMinute: number;
}

/**
 * Enforces the injected `SubstitutionRules`, tracking the two DISTINCT limits:
 * total substitutions and windows (stoppages). Multiple subs made at the same
 * minute count as one window; half-time may be exempt.
 */
export class SubstitutionManager {
  private readonly usage = new Map<string, Usage>();

  constructor(private readonly rules: SubstitutionRules) {}

  private usageFor(teamId: string): Usage {
    let u = this.usage.get(teamId);
    if (!u) {
      u = { subs: 0, windows: 0, lastWindowMinute: -1 };
      this.usage.set(teamId, u);
    }
    return u;
  }

  /** Whether the team may make another substitution now. */
  canSubstitute(teamId: string, minute: number, isHalftime: boolean): boolean {
    const u = this.usageFor(teamId);
    if (u.subs >= this.rules.maxSubstitutions) return false;
    if (isHalftime && !this.rules.halftimeCountsAsWindow) return true;
    if (minute === u.lastWindowMinute) return true; // same window
    return u.windows < this.rules.maxWindows;
  }

  /** Record a completed substitution, consuming a window if a new one opens. */
  record(teamId: string, minute: number, isHalftime: boolean): void {
    const u = this.usageFor(teamId);
    u.subs += 1;
    if (isHalftime && !this.rules.halftimeCountsAsWindow) return;
    if (minute !== u.lastWindowMinute) {
      u.windows += 1;
      u.lastWindowMinute = minute;
    }
  }

  subsUsed(teamId: string): number {
    return this.usageFor(teamId).subs;
  }

  windowsUsed(teamId: string): number {
    return this.usageFor(teamId).windows;
  }
}
