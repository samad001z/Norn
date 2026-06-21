"use client";

import * as React from "react";
import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { EASE_OUT, Reveal, Row } from "@/components/landing/primitives";
import { joinEarlyAccess } from "@/app/actions";

const VALUES = [
  { lead: "Remembers across sessions and projects.", sub: "Stop re-pasting CLAUDE.md by hand." },
  { lead: "See everything it knows.", sub: "No black box, ever." },
  { lead: "Edit or forget any memory.", sub: "Full control, always." },
  { lead: "Lives in your tools over MCP.", sub: "Claude Code, Cursor, and more." },
  { lead: "Local-first.", sub: "Your context stays on your machine." },
];

const STEPS = [
  { n: "1", lead: "Install the MCP server.", sub: "One command connects Norn to Claude Code or Cursor." },
  { n: "2", lead: "It remembers as you work.", sub: "Decisions, preferences, and context, captured as you go." },
  { n: "3", lead: "Manage it in the dashboard.", sub: "See, search, edit, and forget. Anything, anytime." },
];

function EarlyAccess() {
  const [email, setEmail] = React.useState("");
  const [done, setDone] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  if (done) {
    return (
      <p role="status" className="font-mono text-sm text-candle">
        You are on the list. We will be in touch.
      </p>
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!email.trim() || pending) return;
        setPending(true);
        try {
          await joinEarlyAccess(email);
          setDone(true);
        } finally {
          setPending(false);
        }
      }}
      className="flex w-full max-w-md flex-col gap-3 sm:flex-row"
    >
      <label htmlFor="early-email" className="sr-only">
        Email address
      </label>
      <input
        id="early-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@dev.com"
        className="h-12 flex-1 rounded-lg border border-silt bg-tide px-4 text-mist outline-none transition-colors placeholder:text-fathom focus-visible:border-candle/50 focus-visible:ring-2 focus-visible:ring-candle/35"
      />
      <button
        type="submit"
        disabled={pending}
        className="h-12 shrink-0 rounded-lg bg-candle px-5 font-medium text-well transition-colors outline-none hover:bg-ember focus-visible:ring-2 focus-visible:ring-candle/60 disabled:opacity-60"
      >
        {pending ? "Joining…" : "Get early access"}
      </button>
    </form>
  );
}

export function BelowFold() {
  const reduce = useReducedMotion();

  return (
    <>
      {/* PROBLEM — felt, no reveal flourish; the words land plainly. */}
      <section className="py-24 sm:py-32">
        <Row>
          <p className="max-w-[34ch] font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-snug text-mist">
            Every new session, your agent starts from zero.
          </p>
          <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-fathom">
            You re-paste the same context, re-explain the same decisions, and fix the same
            mistakes.
          </p>
        </Row>
      </section>

      {/* WHAT IT PROVIDES — staggered list reveal */}
      <section className="py-12">
        <Row>
          <Reveal y={12}>
            <h2 className="font-display text-[clamp(1.875rem,3.2vw,2.75rem)] leading-tight text-mist">
              What Norn keeps for you.
            </h2>
          </Reveal>
        </Row>
        <ul className="mt-6">
          {VALUES.map((v, i) => (
            <li key={v.lead}>
              <Row marker="bead" markerTop="top-6">
                <Reveal y={16} delay={i * 0.05} className="py-5">
                  <p className="font-display text-xl text-mist">{v.lead}</p>
                  <p className="mt-1 text-fathom">{v.sub}</p>
                </Reveal>
              </Row>
            </li>
          ))}
        </ul>
      </section>

      {/* WHY IT'S DIFFERENT — figure gets its own scale-in, distinct from the list */}
      <section className="py-24 sm:py-32">
        <Row>
          <Reveal y={12}>
            <h2 className="max-w-[20ch] font-display text-[clamp(1.875rem,3.2vw,2.75rem)] leading-tight text-mist">
              You can see what it remembers.
            </h2>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-fathom">
              Most AI memory is a black box. You cannot see what it stored or fix it when it
              is wrong. Norn shows you everything and hands you the controls.
            </p>
          </Reveal>

          <motion.figure
            initial={reduce ? false : { opacity: 0, scale: 0.985 }}
            whileInView={reduce ? undefined : { opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
            className="mt-10 overflow-hidden rounded-xl border border-silt bg-tide shadow-[0_0_60px_-15px_rgba(233,184,122,0.15)]"
          >
            <Image
              src="/app-screenshot.png"
              alt="The Norn dashboard: every remembered memory shown with its tags, project, and time, each one editable or forgettable."
              width={1440}
              height={900}
              className="block w-full"
            />
            <figcaption className="border-t border-silt px-4 py-2 font-mono text-xs text-fathom">
              norn /app · your memories, visible
            </figcaption>
          </motion.figure>
        </Row>
      </section>

      {/* HOW IT WORKS — staggered steps */}
      <section id="how" className="scroll-mt-20 py-12">
        <Row>
          <Reveal y={12}>
            <h2 className="font-display text-[clamp(1.875rem,3.2vw,2.75rem)] leading-tight text-mist">
              Three steps to a memory that stays.
            </h2>
          </Reveal>
        </Row>
        <ol className="mt-6">
          {STEPS.map((s, i) => (
            <li key={s.n}>
              <Row marker="bead" markerTop="top-6">
                <Reveal y={16} delay={i * 0.06}>
                  <div className="flex gap-4 py-5">
                    <span className="font-mono text-sm text-candle">{s.n}</span>
                    <div>
                      <p className="font-display text-xl text-mist">{s.lead}</p>
                      <p className="mt-1 text-fathom">{s.sub}</p>
                    </div>
                  </div>
                </Reveal>
              </Row>
            </li>
          ))}
        </ol>
      </section>

      {/* CLOSER + CTA */}
      <section id="early-access" className="scroll-mt-20 py-24 sm:py-32">
        <Row marker="knot" markerTop="bottom-0">
          <Reveal y={14}>
            <h2 className="max-w-[18ch] font-display text-[clamp(2rem,3.6vw,3rem)] leading-tight text-mist">
              Give your AI a memory it keeps.
            </h2>
            <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-fathom">
              Persistent, visible, and yours to control. Get early access.
            </p>
            <div className="mt-8">
              <EarlyAccess />
            </div>
          </Reveal>
        </Row>
      </section>
    </>
  );
}
