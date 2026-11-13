import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const fields = [
  'order_id',
  'project_id',
  'front_order_id',
  'stage_key',
  'attempt_id',
  'operator_id',
  'approved_at',
  'reason',
  'rule',
  'anchor_order_id',
];
const stable = (credit) => Object.fromEntries(fields.map((key) => [key, credit[key] ?? null]));

export async function reconcileOperator(
  sql,
  { operator, from, to, apply = false, expectedDigest },
) {
  const validDay = (day) =>
    /^\d{4}-\d{2}-\d{2}$/.test(day ?? '') &&
    new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
  if (
    !/^[A-Za-z0-9_-]{1,128}$/.test(operator ?? '') ||
    !validDay(from) ||
    !validDay(to) ||
    from > to
  )
    throw Error('Invalid operator or date range');
  if (apply && !/^[a-f0-9]{64}$/.test(expectedDigest ?? ''))
    throw Error('Apply requires the reviewed dry-run digest');
  let report;
  const dryRollback = new Error('intentional_dry_run_rollback');
  try {
    await sql.begin(async (tx) => {
      await tx`SET LOCAL lock_timeout='5s'`;
      await tx`SET LOCAL statement_timeout='60s'`;
      const targets = await tx`SELECT c.order_id FROM tracking_upsell_operator_credits c
        WHERE (c.operator_id IS NULL OR c.operator_id=${operator})
          AND c.approved_at>=(${from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
          AND c.approved_at<((${to}::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
        ORDER BY c.approved_at,c.order_id`;
      const changes = [];
      for (const target of targets) {
        const [before] =
          await tx`SELECT to_jsonb(c) AS credit FROM tracking_upsell_operator_credits c WHERE order_id=${target.order_id}`;
        const [result] = await tx`SELECT CASE WHEN ${before.credit.reason} = 'ambiguous_front'
            THEN reconcile_upsell_operator_ambiguous_front(${target.order_id},${operator})
            ELSE reconcile_upsell_operator_sequence(${target.order_id},${operator})
            END AS changed`;
        if (!result.changed) continue;
        const [after] =
          await tx`SELECT to_jsonb(c) AS credit FROM tracking_upsell_operator_credits c WHERE order_id=${target.order_id}`;
        const [detail] = await tx`SELECT o.amount_brl_minor,o.amount_minor,o.currency,
            to_char(old_click.opened_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS old_click_day,
            to_char(new_click.opened_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS new_click_day
          FROM tracking_orders o
          LEFT JOIN tracking_upsell_operator_attempts old_click ON old_click.id=${before.credit.attempt_id}
          LEFT JOIN tracking_upsell_operator_attempts new_click ON new_click.id=${after.credit.attempt_id}
          WHERE o.id=${target.order_id}`;
        changes.push({ before: stable(before.credit), after: stable(after.credit), ...detail });
      }
      const digest = createHash('sha256')
        .update(
          JSON.stringify(
            changes
              .map(({ before, after }) => ({ before, after }))
              .sort((a, b) => a.after.order_id.localeCompare(b.after.order_id)),
          ),
        )
        .digest('hex');
      const byClickMonth = {};
      for (const change of changes) {
        const month = change.new_click_day.slice(0, 7);
        byClickMonth[month] ??= {
          newlyAttributed: 0,
          retimed: 0,
          addedBrlMinor: 0,
          unconverted: 0,
        };
        if (change.before.operator_id == null) {
          byClickMonth[month].newlyAttributed++;
          if (change.amount_brl_minor != null)
            byClickMonth[month].addedBrlMinor += Number(change.amount_brl_minor);
          else byClickMonth[month].unconverted++;
        } else byClickMonth[month].retimed++;
      }
      report = {
        mode: apply ? 'applied' : 'dry_run_rolled_back',
        operator,
        from,
        to,
        scanned: targets.length,
        changed: changes.length,
        digest,
        byClickMonth,
        changes,
      };
      if (apply && digest !== expectedDigest)
        throw Error('Reconciliation changed since dry-run; nothing was committed');
      if (!apply) throw dryRollback;
    });
  } catch (error) {
    if (error !== dryRollback) throw error;
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const options = { apply: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === '--apply') options.apply = true;
    else if (['--operator', '--from', '--to', '--expected-digest'].includes(key) && args[i + 1])
      options[key === '--expected-digest' ? 'expectedDigest' : key.slice(2)] = args[++i];
    else
      throw Error(
        'Use --operator ID --from YYYY-MM-DD --to YYYY-MM-DD [--apply --expected-digest SHA256]',
      );
  }
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL required');
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
    onnotice: () => {},
  });
  try {
    console.log(JSON.stringify(await reconcileOperator(sql, options)));
  } finally {
    await sql.end();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
