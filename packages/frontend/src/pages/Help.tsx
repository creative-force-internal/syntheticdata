import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar.js';

interface Section {
  id: string;
  title: string;
  icon: string;
}

const SECTIONS: Section[] = [
  { id: 'overview',     title: 'Overview',                  icon: 'lightbulb' },
  { id: 'quick-start',  title: 'Quick start',               icon: 'rocket_launch' },
  { id: 'schema',       title: 'Schema & generators',       icon: 'view_column' },
  { id: 'fk',           title: 'Foreign-key relationships', icon: 'account_tree' },
  { id: 'rules',        title: 'Conditional rules',         icon: 'rule_settings' },
  { id: 'actions',      title: 'Rule actions reference',    icon: 'play_arrow' },
  { id: 'personas',     title: 'Personas & coherent data',  icon: 'group' },
  { id: 'reproducibility', title: 'Seeds & reproducibility', icon: 'replay' },
  { id: 'recipes',      title: 'Use-case recipes',          icon: 'restaurant_menu' },
  { id: 'gotchas',      title: 'Tips & common mistakes',    icon: 'warning' },
];

export function Help() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);

  // Track which section is in view so the TOC highlights the current one.
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(entry.target.id);
          }
        }
      },
      { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen overflow-hidden">
        {/* Top Nav */}
        <header className="flex items-center justify-between px-4 md:px-8 pl-14 md:pl-8 w-full h-16 sticky top-0 z-30 bg-surface/80 backdrop-blur-md border-b border-surface-container shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-[20px]">help_outline</span>
            <span className="text-[10px] font-label uppercase tracking-widest text-on-surface">Help & Docs</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-[10px] font-label uppercase tracking-widest">
              <span className="text-primary font-bold">EN</span>
              <span className="text-on-surface-variant/40">|</span>
              <Link to="/help/vi" className="text-on-surface-variant hover:text-primary transition-colors">VI</Link>
            </div>
            <span className="font-label text-[10px] uppercase tracking-tighter text-on-surface-variant">
              Reading time: ~10 min
            </span>
          </div>
        </header>

        {/* Two-column body: TOC + content */}
        <section className="flex-1 overflow-hidden flex">
          {/* TOC */}
          <aside className="hidden lg:block w-64 shrink-0 border-r border-surface-container py-8 px-6 overflow-y-auto">
            <p className="font-label text-[10px] uppercase tracking-widest text-on-surface-variant mb-4">On this page</p>
            <nav className="space-y-1">
              {SECTIONS.map(s => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={
                    active === s.id
                      ? 'flex items-center gap-2 px-3 py-2 rounded-md bg-surface-container text-primary font-bold text-xs transition-colors'
                      : 'flex items-center gap-2 px-3 py-2 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-bright text-xs transition-colors'
                  }
                >
                  <span className="material-symbols-outlined text-[16px]">{s.icon}</span>
                  <span>{s.title}</span>
                </a>
              ))}
            </nav>
          </aside>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            <article className="max-w-3xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-12 md:space-y-16 pb-16 md:pb-24">
              {/* Hero */}
              <header className="space-y-3 border-b border-outline-variant/10 pb-10">
                <p className="font-label text-[10px] uppercase tracking-widest text-primary">Documentation</p>
                <h1 className="text-4xl font-bold font-headline tracking-tight">How to generate realistic data</h1>
                <p className="text-on-surface-variant text-sm leading-relaxed">
                  This guide explains the building blocks — schemas, foreign-key relationships, conditional
                  rules — and shows you how to combine them so the output looks like real production data
                  rather than random noise.
                </p>
              </header>

              {/* Overview */}
              <Section id="overview" title="Overview" icon="lightbulb">
                <p>
                  Synthetic Studio generates data in three steps:
                </p>
                <ol className="list-decimal pl-6 space-y-1 text-sm text-on-surface-variant">
                  <li><strong className="text-on-surface">Define a schema</strong> — tables, columns, types, and what generator each column uses.</li>
                  <li><strong className="text-on-surface">Wire up relationships</strong> — primary keys, foreign keys, and how children should be distributed across parents.</li>
                  <li><strong className="text-on-surface">Layer rules</strong> — conditional logic that overrides values to keep the data internally consistent (e.g. <em>cancelled</em> orders have <em>NULL</em> shipping dates).</li>
                </ol>
                <p>
                  You then pick a row count per table, a seed for reproducibility, and export to CSV / JSON / SQL / SQLite.
                  The <strong className="text-on-surface">Single Table</strong> mode is a quick wizard for one-off datasets;
                  the <strong className="text-on-surface">Projects</strong> mode is for multi-table data with FKs.
                </p>
              </Section>

              {/* Quick start */}
              <Section id="quick-start" title="Quick start" icon="rocket_launch">
                <p>
                  The fastest path to realistic data is to start from an existing schema, not a blank one:
                </p>
                <ul className="list-disc pl-6 space-y-1.5 text-sm text-on-surface-variant">
                  <li><strong className="text-on-surface">Paste SQL DDL</strong> — your <code className="bg-surface-container-low px-1.5 py-0.5 rounded">CREATE TABLE</code> statements with FK constraints. The parser preserves relationships.</li>
                  <li><strong className="text-on-surface">Paste a Prisma schema</strong> — model definitions are converted to multi-table projects automatically.</li>
                  <li><strong className="text-on-surface">Upload a CSV</strong> — column types are inferred from the values; useful for getting a quick wizard started.</li>
                </ul>
                <Callout kind="tip">
                  After import, every column gets a default generator picked from its type. Open each table and
                  swap defaults for richer ones (e.g. <code>email</code> → Faker email, <code>price</code> → number range).
                </Callout>
              </Section>

              {/* Schema & generators */}
              <Section id="schema" title="Schema & generators" icon="view_column">
                <p>
                  Each column has a <strong className="text-on-surface">data type</strong> and a <strong className="text-on-surface">generator config</strong>.
                  Built-in types: <code>string</code>, <code>integer</code>, <code>float</code>, <code>boolean</code>,
                  <code> date</code>, <code>datetime</code>, <code>uuid</code>, <code>email</code>, <code>phone</code>,
                  <code> url</code>, <code>enum</code>, <code>regex</code>.
                </p>
                <p>
                  Generators come from <strong className="text-on-surface">Faker.js</strong> with 30+ locales. Pick the locale that
                  matches your audience (Vietnamese names for a VN product, Japanese addresses for JP, etc.) — the
                  output is much more believable than en-US for everything.
                </p>
                <p>
                  Useful generator knobs:
                </p>
                <ul className="list-disc pl-6 space-y-1.5 text-sm text-on-surface-variant">
                  <li><strong className="text-on-surface">min / max / precision</strong> — for numbers and floats.</li>
                  <li><strong className="text-on-surface">dateFrom / dateTo</strong> — bound dates and datetimes to a window.</li>
                  <li><strong className="text-on-surface">enumValues + enumWeights</strong> — categorical fields with realistic frequencies (e.g. <code>active: 0.85, churned: 0.15</code>).</li>
                  <li><strong className="text-on-surface">pattern</strong> — regex for things like SKUs, license keys, ticket numbers.</li>
                  <li><strong className="text-on-surface">nullRate</strong> — 0–1, probability that this column is NULL on a given row.</li>
                </ul>
              </Section>

              {/* FK relationships */}
              <Section id="fk" title="Foreign-key relationships" icon="account_tree">
                <p>
                  When a column is marked <code>foreign_key</code>, you set a <strong className="text-on-surface">pool reference</strong> like
                  <code> users.id</code>. At generation time, parent rows are produced first (the engine
                  topologically sorts the tables), then the FK column samples from the parent's pool.
                </p>
                <p>
                  Click the <span className="material-symbols-outlined text-[14px] align-middle">settings</span> gear
                  icon next to a foreign-key column to open the FK config modal. The choices that matter:
                </p>

                <h3 className="font-headline font-bold text-base pt-4">Distribution mode</h3>
                <div className="space-y-3 text-sm">
                  <DistRow label="Uniform" desc="Every parent has equal probability. Use for things that don't naturally cluster — random tag assignments, lookup references." />
                  <DistRow label="Weighted" desc="Some parent values are picked more often. Requires you to set Fixed Values first, then assign a weight to each. Use for power-law-ish data: 80% of orders go to 20% of customers." />
                  <DistRow label="Fixed per parent" desc="Each parent gets between min and max children. Best for one-to-many shapes: every order has 1–5 line items, every user has 0–3 addresses. The modal estimates the suggested row count for the child table." />
                </div>

                <h3 className="font-headline font-bold text-base pt-4">Null rate</h3>
                <p>
                  Optional FKs (e.g. <code>parent_comment_id</code> on a comments table) need a non-zero null rate
                  or you'll get a fully-connected tree. Slide it up to the realistic ratio.
                </p>

                <h3 className="font-headline font-bold text-base pt-4">Fixed values subset</h3>
                <p>
                  Restrict the FK to specific parent values rather than the full pool. Useful for environments
                  ("only seed orders for tenant 1, 2, 3") or for forcing a known-good test scenario.
                </p>

                <Callout kind="tip">
                  <strong>Sizing rule of thumb.</strong> For <em>fixed_per_parent</em> distributions, set the child
                  row count to roughly <em>parent_rows × avg(min, max)</em>. The modal shows this estimate live so
                  you don't have to do the math.
                </Callout>
              </Section>

              {/* Rules */}
              <Section id="rules" title="Conditional rules" icon="rule_settings">
                <p>
                  Rules are how you turn random rows into <em>plausible</em> rows. They run after the base
                  generators, so any rule can override what was generated. Each rule has the shape:
                </p>
                <pre className="bg-surface-container-low border border-outline-variant/20 rounded-lg p-4 text-xs leading-relaxed font-mono overflow-x-auto">
{`IF   <conditions, AND-joined>
THEN <action> on <target column>`}
                </pre>

                <h3 className="font-headline font-bold text-base pt-4">Condition operators</h3>
                <p>
                  Conditions compare a column to a literal. Multiple conditions on one rule are joined with
                  AND — for OR logic, create two separate rules.
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <OpRow op="==" desc="exact match" />
                  <OpRow op="!=" desc="not equal" />
                  <OpRow op=">" desc="greater than (numbers/dates)" />
                  <OpRow op="<" desc="less than (numbers/dates)" />
                  <OpRow op=">=" desc="greater or equal" />
                  <OpRow op="<=" desc="less or equal" />
                  <OpRow op="contains" desc="substring (case-sensitive)" />
                  <OpRow op="is null" desc="value is NULL" />
                  <OpRow op="is not null" desc="value is set" />
                </div>

                <Callout kind="example">
                  <strong>Example.</strong> Mark high-value churned customers:<br />
                  <code className="block mt-2">IF status == "churned" AND lifetime_value &gt; 5000<br />THEN set_enum on churn_reason → "competitor, price, support, other"</code>
                </Callout>
              </Section>

              {/* Actions reference */}
              <Section id="actions" title="Rule actions reference" icon="play_arrow">
                <p>Seven action types, picked from the THEN dropdown:</p>
                <div className="space-y-3">
                  <ActionRow
                    name="set_null"
                    summary="Force the target column to NULL."
                    when="Cascading nullability — e.g. cancelled orders shouldn't have a shipped_at."
                    example={`IF status == "cancelled" THEN set_null on shipped_at`}
                  />
                  <ActionRow
                    name="set_not_null"
                    summary="Guarantee the target is non-null (regenerate if necessary)."
                    when="Required-field invariants that the base generator's nullRate would otherwise violate."
                    example={`IF role == "admin" THEN set_not_null on email`}
                  />
                  <ActionRow
                    name="set_value"
                    summary="Replace with a constant."
                    when="Pin a value when a flag is set — usually for status sentinels."
                    example={`IF is_test == true THEN set_value on tier → "internal"`}
                  />
                  <ActionRow
                    name="set_enum"
                    summary="Pick from a list (comma-separated). Each value equally likely."
                    when="Branchy categorical fields whose options depend on another column."
                    example={`IF kind == "refund" THEN set_enum on reason → "duplicate, fraud, customer_request, other"`}
                  />
                  <ActionRow
                    name="set_range"
                    summary="Pick a number in a min-max range (format: min-max)."
                    when="Numeric ranges that depend on a category — premium plans charge more, free plans charge zero."
                    example={`IF plan == "free" THEN set_range on monthly_fee → 0-0`}
                  />
                  <ActionRow
                    name="derive_offset"
                    summary={'Date relative to another column. Format: source_col, min_offset, max_offset, unit.'}
                    when="Sequential timestamps — shipped_at is always after ordered_at, never before."
                    example={`IF status == "shipped" THEN derive_offset on shipped_at → ordered_at, 1, 7, days`}
                  />
                  <ActionRow
                    name="derive_compute"
                    summary="Compute target as an arithmetic expression of other columns."
                    when="Totals that should equal a sum or product, not be independently random."
                    example={`THEN derive_compute on total → quantity * unit_price`}
                  />
                </div>
                <Callout kind="warn">
                  Rule order matters. Rules run top-to-bottom, and a later rule can overwrite an earlier one's
                  output. If two rules target the same column, the last matching rule wins.
                </Callout>
              </Section>

              {/* Personas */}
              <Section id="personas" title="Personas & coherent data" icon="group">
                <p>
                  Random per-column generation breaks immediately on demo screenshots: a row shows a Japanese
                  name with a German address and a Polish phone number. <strong className="text-on-surface">Personas</strong> fix
                  this by tying related fields together.
                </p>
                <p>
                  When you pick <code>persona.fullName</code>, the same row's <code>persona.email</code>,
                  <code> persona.firstName</code>, <code>persona.city</code>, <code>persona.country</code>,
                  <code> persona.phoneNumber</code>, and <code>persona.avatarUrl</code> all draw from the same
                  generated person. The locale is honored consistently.
                </p>
                <Callout kind="tip">
                  Use personas whenever the rows represent <em>people</em> (users, customers, employees,
                  patients). For non-person entities, individual Faker generators are fine.
                </Callout>
              </Section>

              {/* Reproducibility */}
              <Section id="reproducibility" title="Seeds & reproducibility" icon="replay">
                <p>
                  Every generation run takes a <strong className="text-on-surface">seed</strong> (auto-rolled if you don't set one).
                  Same seed + same schema + same row counts = byte-identical output. This is the property that
                  makes Synthetic Studio safe for:
                </p>
                <ul className="list-disc pl-6 space-y-1 text-sm text-on-surface-variant">
                  <li>Bug reports — share <code>seed=1234, rows=10k</code> and the recipient gets your exact data.</li>
                  <li>Test fixtures — pin the seed in CI so the dataset doesn't drift between runs.</li>
                  <li>Benchmarks — comparing query engines requires identical inputs.</li>
                </ul>
                <p>
                  Generation runs in 10k-row chunks and is cancellable from the UI; memory stays bounded even
                  for 10M-row exports.
                </p>
              </Section>

              {/* Recipes */}
              <Section id="recipes" title="Use-case recipes" icon="restaurant_menu">
                <Recipe
                  title="E-commerce: orders, line items, customers"
                  steps={[
                    'Customers — uniform, ~10k rows. Use persona.* generators with one locale.',
                    'Products — ~500 rows. SKU via regex (PRD-[A-Z]{3}-\\d{4}), price as float range, category as weighted enum (electronics 0.4, clothing 0.3, books 0.2, other 0.1).',
                    'Orders.customer_id — FK weighted with a Pareto-ish skew (top 20 customers placed weight 5, the rest 1). Status weighted enum: pending 0.05, paid 0.7, shipped 0.2, cancelled 0.05.',
                    'Order_items.order_id — FK fixed_per_parent, 1–5 items each. quantity range 1–5, unit_price copied from products via FK.',
                    'Rule: IF status == "cancelled" THEN set_null on shipped_at.',
                    'Rule: IF status == "shipped" THEN derive_offset on shipped_at → created_at, 1, 7, days.',
                    'Rule: THEN derive_compute on total → quantity * unit_price.',
                  ]}
                />
                <Recipe
                  title="SaaS: tenants, users, audit log"
                  steps={[
                    'Tenants — 50 rows. Plan as weighted enum (free 0.6, pro 0.3, enterprise 0.1).',
                    'Users.tenant_id — FK fixed_per_parent, 1–200 users each (skewed by plan via separate rules per tenant if needed). Role as enum (admin, member, viewer).',
                    'Audit_log.user_id — FK weighted. Action as enum (login, logout, update, delete) with realistic frequencies.',
                    'Rule: IF action == "delete" THEN set_not_null on resource_id.',
                    'Rule: IF role == "viewer" AND action == "delete" THEN set_value on action → "login" (viewers can\'t delete).',
                  ]}
                />
                <Recipe
                  title="Compliance-safe sample data"
                  steps={[
                    'Import production SQL DDL (structure only, never values).',
                    'Replace any column whose name matches name/email/phone/ssn/dob with a Faker generator.',
                    'Set seed = today\'s date. Generate, export to SQLite, share with the team.',
                    'Same seed tomorrow regenerates the same dataset for repeat testing.',
                  ]}
                />
              </Section>

              {/* Gotchas */}
              <Section id="gotchas" title="Tips & common mistakes" icon="warning">
                <ul className="space-y-3 text-sm">
                  <li>
                    <strong className="text-on-surface">FK orphans.</strong> If you set a high <code>fkNullRate</code> on
                    a non-nullable FK, you'll get rows that violate the constraint when imported. Either drop
                    NOT NULL on the column or lower the null rate.
                  </li>
                  <li>
                    <strong className="text-on-surface">Cycles in FKs.</strong> The topological sort can't order tables that
                    depend on each other. Break the cycle by making one side nullable and generating it second
                    via a derive rule.
                  </li>
                  <li>
                    <strong className="text-on-surface">Index cardinality.</strong> Uniform FK distribution gives every
                    parent the same load. That's unrealistic for performance tests — production data is usually
                    skewed. Use weighted or fixed_per_parent and your EXPLAIN plans will look much closer to
                    reality.
                  </li>
                  <li>
                    <strong className="text-on-surface">Rule conflicts.</strong> Two rules writing to the same column will
                    silently let the later one win. Name your rules and review the list to catch this.
                  </li>
                  <li>
                    <strong className="text-on-surface">Personas + non-matching locale.</strong> If you pick a Vietnamese
                    persona but a German phone format on the same row, you defeat the purpose. Pick the locale
                    on the persona itself.
                  </li>
                  <li>
                    <strong className="text-on-surface">Forgetting the seed.</strong> A regenerated dataset with a different
                    seed will break tests pinned to specific row IDs. Pin the seed early.
                  </li>
                </ul>
              </Section>

              {/* CTA */}
              <div className="pt-4 flex items-center justify-end border-t border-outline-variant/10">
                <Link
                  to="/"
                  className="text-[10px] font-label uppercase tracking-widest text-primary hover:underline"
                >
                  Start a project →
                </Link>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Section({ id, title, icon, children }: { id: string; title: string; icon: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <h2 className="text-2xl font-bold font-headline tracking-tight flex items-center gap-3">
        <span className="material-symbols-outlined text-primary">{icon}</span>
        {title}
      </h2>
      <div className="text-sm text-on-surface-variant leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

function Callout({ kind, children }: { kind: 'tip' | 'warn' | 'example'; children: React.ReactNode }) {
  const styles = {
    tip:     { border: 'border-tertiary/30',  bg: 'bg-tertiary/5',     icon: 'lightbulb',   label: 'Tip' },
    warn:    { border: 'border-error/30',     bg: 'bg-error/5',        icon: 'warning',     label: 'Watch out' },
    example: { border: 'border-primary/30',   bg: 'bg-primary/5',      icon: 'code_blocks', label: 'Example' },
  }[kind];
  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} p-4 text-sm`}>
      <div className="flex items-center gap-2 mb-2 font-label text-[10px] uppercase tracking-widest text-on-surface">
        <span className="material-symbols-outlined text-[16px]">{styles.icon}</span>
        {styles.label}
      </div>
      <div className="text-on-surface-variant">{children}</div>
    </div>
  );
}

function DistRow({ label, desc }: { label: string; desc: string }) {
  return (
    <div className="border-l-2 border-primary/40 pl-4">
      <p className="font-headline font-semibold text-on-surface">{label}</p>
      <p className="text-on-surface-variant">{desc}</p>
    </div>
  );
}

function OpRow({ op, desc }: { op: string; desc: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <code className="bg-surface-container-low px-2 py-0.5 rounded font-mono text-on-surface min-w-[70px] inline-block">{op}</code>
      <span className="text-on-surface-variant">{desc}</span>
    </div>
  );
}

function ActionRow({ name, summary, when, example }: { name: string; summary: string; when: string; example: string }) {
  return (
    <div className="border border-outline-variant/20 rounded-lg p-4 bg-surface-container-low/50 space-y-2">
      <div className="flex items-baseline gap-3">
        <code className="bg-primary/10 text-primary px-2 py-0.5 rounded font-mono text-xs font-bold">{name}</code>
        <p className="text-on-surface text-sm">{summary}</p>
      </div>
      <p className="text-xs text-on-surface-variant"><strong className="text-on-surface">Use when:</strong> {when}</p>
      <pre className="text-xs font-mono bg-surface border border-outline-variant/20 rounded px-3 py-2 text-on-surface-variant overflow-x-auto whitespace-pre-wrap">{example}</pre>
    </div>
  );
}

function Recipe({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="border border-outline-variant/20 rounded-lg p-5 bg-surface-container-low/50 space-y-3">
      <h3 className="font-headline font-bold text-base text-on-surface">{title}</h3>
      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-on-surface-variant">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  );
}
