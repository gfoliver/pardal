import type { Attestation, MatchRecord, TeamInput } from "@fut/protocol";

/**
 * Talking to the match server.
 *
 * Deliberately a plain module with no React in it, so the rules below can be tested against a stubbed
 * `fetch` instead of only through a rendered screen. The wire contract itself is covered by the server's
 * own tests against workerd; what lives here is everything the CLIENT has to get right:
 *
 *  - THE ACCESS TOKEN EXPIRES (an hour) and the refresh token does not (thirty days). A request that
 *    comes back 401 is retried ONCE behind a refresh, so a session that has been open over lunch does
 *    not read as being logged out.
 *  - THE API CAN BE DOWN ON PURPOSE. Staying on the Cloudflare free plan means a flood REFUSES work
 *    rather than billing for it, so the honest failure is "the daily allowance is spent, come back after
 *    00:00 UTC" — not a spinner and not "something went wrong". The static site and the single-player
 *    career keep working throughout, and the UI has to be able to say so.
 *  - POLLING IS A QUOTA PROBLEM. Two endpoints at ten-second intervals is 72,000 requests a day against
 *    a 100,000 daily allowance, so `watch` fetches when the tab becomes visible with a floor between
 *    calls, and sends `If-None-Match` so an unchanged fixture costs a 304.
 */

/** Why a call failed, in the terms a screen has to distinguish. */
export type ApiFailure =
  /** The daily free-plan allowance is spent. Not our bug, and not the user's — it comes back at 00:00 UTC. */
  | { kind: "quota" }
  /** No session, or one the server no longer accepts. The screen should offer to sign in again. */
  | { kind: "auth" }
  /** The server said no, with a reason worth showing: a spent code, a sealed lineup, a stale dataset. */
  | { kind: "refused"; code: string; detail?: string }
  /** The request never arrived. Retrying is reasonable; saying "offline" is honest. */
  | { kind: "offline" };

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure) {
    super(failure.kind === "refused" ? `${failure.code}: ${failure.detail ?? ""}` : failure.kind);
    this.name = "ApiError";
  }
}

export interface Session {
  readonly userId: string;
  readonly kind: "guest" | "full";
  readonly accessToken: string;
  readonly refreshToken: string;
}

/** What a locked fixture looks like to a client, and what an open one does NOT show. */
export interface MatchView {
  readonly matchId: string
  readonly state: "awaiting_lineups" | "determined" | "provisional" | "confirmed" | "void";
  readonly homeClubId: string;
  readonly awayClubId: string | null;
  readonly joinCode: string | null;
  readonly homeSubmitted: boolean;
  readonly awaySubmitted: boolean;
  readonly rosterSnapshotHash: string;
  /** Present only once both lineups are sealed — before that there is nothing to reveal. */
  readonly record?: MatchRecord;
}

export interface ApiOptions {
  readonly baseUrl: string;
  /** Injected so the client is testable without a network, and so the app can share one instance. */
  readonly fetch?: typeof globalThis.fetch;
  /** Where the session lives between reloads. Absent means an in-memory session. */
  readonly store?: SessionStore;
}

export interface SessionStore {
  read(): Session | null;
  write(session: Session | null): void;
}

/**
 * `localStorage`-backed, and tolerant of a browser that refuses it.
 *
 * A refused write must not break signing in — private mode and a full quota both throw here — so the
 * session simply stops surviving a reload, which is worse than working but far better than a crash.
 */
export function localSessionStore(key = "onze.mp.session"): SessionStore {
  return {
    read() {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<Session>;
        if (typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string") return null;
        if (typeof parsed.userId !== "string") return null;
        return {
          userId: parsed.userId,
          kind: parsed.kind === "full" ? "full" : "guest",
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
        };
      } catch {
        return null;
      }
    },
    write(session) {
      try {
        if (session) localStorage.setItem(key, JSON.stringify(session));
        else localStorage.removeItem(key);
      } catch {
        /* private mode, quota — a session is not worth an error */
      }
    },
  };
}

export class MatchApi {
  private readonly http: typeof globalThis.fetch;
  private readonly store: SessionStore;
  private session: Session | null;
  /** In-flight refresh, so five requests failing at once trigger one refresh rather than five. */
  private refreshing: Promise<boolean> | null = null;
  /** matchId → the ETag we last saw, so an unchanged fixture costs a 304 and no body. */
  private readonly tags = new Map<string, { etag: string; view: MatchView }>();

  constructor(private readonly options: ApiOptions) {
    this.http = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.store = options.store ?? memoryStore();
    this.session = this.store.read();
  }

  get current(): Session | null {
    return this.session;
  }

  private setSession(session: Session | null): void {
    this.session = session;
    this.store.write(session);
  }

  // ------------------------------------------------------------------ auth

  /** A throwaway account, which is all a friendly needs. A season league will require a real one. */
  async signInAsGuest(): Promise<Session> {
    const body = await this.call<Session>("POST", "/auth/guest", {}, { anonymous: true });
    this.setSession(body);
    return body;
  }

  signOut(): void {
    this.setSession(null);
    this.tags.clear();
  }

  // ----------------------------------------------------------------- match

  challenge(clubId: string, rosterSnapshotHash: string): Promise<MatchView> {
    return this.call<MatchView>("POST", "/match/challenge", { clubId, rosterSnapshotHash });
  }

  join(code: string, clubId: string, rosterSnapshotHash: string): Promise<MatchView> {
    return this.call<MatchView>("POST", "/match/join", { code: code.trim().toUpperCase(), clubId, rosterSnapshotHash });
  }

  /**
   * Seal a lineup. ONE-SHOT: the server refuses a different second submission, because the match seed is
   * derived from what was sealed.
   */
  submitLineup(matchId: string, input: TeamInput): Promise<MatchView> {
    return this.call<MatchView>("POST", "/match/lineup", { matchId, input });
  }

  report(attestation: Attestation): Promise<{ status: string }> {
    return this.call<{ status: string }>("POST", "/match/attest", attestation);
  }

  /**
   * The fixture as it stands, cached against its ETag.
   *
   * A 304 returns the view we already had, which is the whole point: a client waiting for an opponent
   * asks repeatedly and a locked fixture never changes again.
   */
  async match(matchId: string): Promise<MatchView> {
    const known = this.tags.get(matchId);
    const response = await this.send("GET", `/match/${matchId}`, undefined, {
      headers: known ? { "if-none-match": known.etag } : {},
    });
    if (response.status === 304 && known) return known.view;
    const view = (await this.decode<MatchView>(response)) satisfies MatchView;
    const etag = response.headers.get("etag");
    if (etag) this.tags.set(matchId, { etag, view });
    return view;
  }

  // ------------------------------------------------------------ the plumbing

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: { anonymous?: boolean } = {},
  ): Promise<T> {
    const response = await this.send(method, path, body, opts);
    return this.decode<T>(response);
  }

  private async send(
    method: string,
    path: string,
    body?: unknown,
    opts: { anonymous?: boolean; headers?: Record<string, string> } = {},
  ): Promise<Response> {
    if (!opts.anonymous && !this.session) throw new ApiError({ kind: "auth" });
    const attempt = (): Promise<Response> =>
      this.request(method, path, body, {
        ...opts.headers,
        ...(opts.anonymous || !this.session ? {} : { authorization: `Bearer ${this.session.accessToken}` }),
      });

    const first = await attempt();
    // ONE retry, and only behind a successful refresh. Retrying a genuine 401 in a loop would lock an
    // account out through the rate limiter for a password that is simply wrong.
    if (first.status !== 401 || opts.anonymous) return first;
    if (!(await this.refresh())) throw new ApiError({ kind: "auth" });
    return attempt();
  }

  private async request(method: string, path: string, body: unknown, headers: Record<string, string>): Promise<Response> {
    try {
      return await this.http(`${this.options.baseUrl}${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      // A thrown fetch is a network fault, not a server answer. Told apart because the two want
      // different words on screen and only one of them is worth retrying.
      throw new ApiError({ kind: "offline" });
    }
  }

  /** At most one refresh in flight, however many requests discovered the expiry at once. */
  private refresh(): Promise<boolean> {
    if (!this.session) return Promise.resolve(false);
    this.refreshing ??= (async () => {
      try {
        const response = await this.request("POST", "/auth/refresh", { refreshToken: this.session!.refreshToken }, {});
        if (!response.ok) {
          // The refresh token is gone or revoked: this session is over, and holding a dead one would
          // make every later call fail the same way with no way out.
          this.setSession(null);
          return false;
        }
        const next = (await response.json()) as Session;
        this.setSession({ ...this.session!, ...next });
        return true;
      } catch {
        return false;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  private async decode<T>(response: Response): Promise<T> {
    if (response.ok) return (await response.json()) as T;
    /*
     * 1027 is Cloudflare refusing the request because the day's free allowance is spent — it is not an
     * error in the app and it is not the user's fault, and it comes back at 00:00 UTC. It arrives as an
     * HTML error page from the edge rather than as our JSON, so it is recognised by status alone.
     */
    if (response.status === 1027 || response.status === 503) throw new ApiError({ kind: "quota" });
    if (response.status === 401) throw new ApiError({ kind: "auth" });
    const body = (await response.json().catch(() => ({}))) as { error?: string; detail?: string };
    throw new ApiError({ kind: "refused", code: body.error ?? String(response.status), detail: body.detail });
  }
}

function memoryStore(): SessionStore {
  let held: Session | null = null;
  return { read: () => held, write: (s) => void (held = s) };
}
