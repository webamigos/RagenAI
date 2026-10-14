/**
 * The slice of basal's HTTP API this repository uses.
 *
 * basal (github.com/rkinas/basal, Apache-2.0) is a typed-decision model: a
 * request carries a `state` and named questions, each listing its allowed
 * answers, and the server returns a calibrated probability per answer instead
 * of generated text. Only `choice` and `noul` are typed here, because they are
 * the two the first-pass spec measures; `score`, `multi`, `act` and `tool`
 * exist upstream and get a type when something asks them.
 *
 * Written against engine v2.0.0. The shapes below were checked against a
 * running server, not only against the README — `max_error` is accepted on
 * every type but only defers on `act` and `tool`, which the README says once
 * and the launch article does not.
 */

export type ChoiceQuestion = {
  readonly type: 'choice';
  readonly instructions: string;
  /** Option key → what the option means. Two to 255 options. */
  readonly criteria: Readonly<Record<string, string>>;
};

export type NoulQuestion = {
  readonly type: 'noul';
  readonly instructions: string;
  /** Optional descriptions of what `true` and `false` mean. */
  readonly criteria?: Readonly<{ true?: string; false?: string }>;
};

export type BasalQuestion = ChoiceQuestion | NoulQuestion;

export type DecideRequest = {
  /** The text to decide about. */
  readonly state: string;
  readonly questions: Readonly<Record<string, BasalQuestion>>;
  /** Needed only when the state is not text; harmless otherwise. */
  readonly lang?: 'pl' | 'en';
};

export type ChoiceAnswer = {
  readonly type: 'choice';
  readonly choice: string;
  readonly probabilities: Readonly<Record<string, number>>;
  /** The chosen option's calibrated probability. */
  readonly confidence: number;
};

export type NoulAnswer = {
  readonly type: 'noul';
  /** P(yes). */
  readonly noul: number;
  readonly probabilities: Readonly<{ true: number; false: number }>;
  readonly confidence: number;
};

export type BasalAnswer = ChoiceAnswer | NoulAnswer;

export type DecideResponse = {
  /** The served model, e.g. `basal-2.0-4.5B-MLX-8bit`. */
  readonly model: string;
  readonly answers: Readonly<Record<string, BasalAnswer>>;
  readonly usage?: Readonly<{ latency_ms?: number; input_tokens?: number }>;
};

/**
 * Why there is no answer. Never an exception: every caller of this client has
 * a slower path that works without basal, and a client that throws is one
 * missing `catch` away from taking that path down with it.
 */
export type UnavailableReason =
  | 'timeout'
  | 'network'
  | 'http'
  | 'malformed'
  | 'breaker-open';

export type DecideResult =
  | { readonly outcome: 'answered'; readonly response: DecideResponse }
  | { readonly outcome: 'unavailable'; readonly reason: UnavailableReason };
