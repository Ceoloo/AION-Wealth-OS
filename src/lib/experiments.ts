/**
 * Product experiments — proposed, not imposed.
 *
 * Each flag defaults to CURRENT behaviour. Flipping one is a deliberate product
 * decision, reviewable in one line, never a silent change of what users see.
 */

/**
 * PROPOSAL: show the first useful plan BEFORE the optional starter-tools step.
 *
 * Rationale: the partner step currently sits between "I entered my data" and "I
 * can see what to do about it". Showing value first may raise the share of users
 * who complete a first action, and it removes any appearance that a plan is
 * gated behind partner sign-ups.
 *
 * What does NOT change if this is enabled: the partner list, the affiliate
 * disclosure, the foundations-first lock on speculative apps, and the user's
 * ability to sign up / mark "already use it" / skip. Only the ORDER changes; the
 * step is still presented, after the first plan.
 *
 * How to evaluate: compare `first_action_completed` (see analytics/pilotEvents)
 * between the two orderings, and watch referral click-through separately —
 * the two metrics must not be traded off silently against each other.
 *
 * Default false = today's behaviour (partner step first).
 */
export const PLAN_BEFORE_PARTNERS = false;
