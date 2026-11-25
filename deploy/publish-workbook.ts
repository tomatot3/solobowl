import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { reviewedRecipe, workbookDictionary } from "../scripts/content/reviewed-workbook";
import type { Workbook } from "../src/domain/content/normalize";
import { filterEligible } from "../src/domain/recommendations/eligibility";
import { readConfig } from "../src/server/config";
import { publicationInput, publishReviewed } from "../src/server/content/publish";
import { loadReviewConfig, reviewConfig } from "../src/server/content/review-config";
import { saveStagedContent, stageContent } from "../src/server/content/staging";
import { createDatabasePool, withTransaction } from "../src/server/db/pool";
import { genericContext } from "../src/server/recipes/availability";
import { createRecipeRepository } from "../src/server/recipes/repository";

const approvalSchema = z.object({
  workbook: z.string().min(1), coverDirectory: z.string().min(1),
  sourceIds: z.array(z.string().regex(/^R\d+$/)).min(1), excludedOrphans: z.array(z.string()).default([]),
  reviewer: z.string().trim().min(1).max(100), reviewedAt: z.iso.datetime(),
  reviewRef: z.string().trim().min(1).max(240), calendar: reviewConfig.shape.calendar.unwrap(),
}).strict();
const coverSchema = z.object({
  sourceHash: z.string(), covers: z.array(z.object({ sourceId: z.string(), version: z.string(),
    file: z.string().regex(/^[a-f0-9]{64}\.(?:png|jpg|webp)$/) })),
});

async function loadJson(file: string) {
  return JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, "")) as unknown;
}

async function main() {
  const [approvalPath] = process.argv.slice(2);
  if (!approvalPath) throw new Error("Use publish-workbook.ts <approved-release.json> with the web environment loaded.");
  const approval = approvalSchema.parse(await loadJson(approvalPath));
  const config = readConfig({ ...process.env, NODE_ENV: "production" });
  if (!config.DATABASE_URL) throw new Error("WEB_DATABASE_REQUIRED");
  const target = new URL(config.DATABASE_URL);
  if (target.hostname !== "127.0.0.1" || target.port !== "55434" || target.username !== "shiyoushu_app" || target.pathname !== "/shiyoushu_web") {
    throw new Error("WEB_DATABASE_REQUIRED");
  }

  const workbookReader = spawnSync(process.env.SHIYOUSHU_PYTHON ?? "python", ["-X", "utf8",
    resolve("scripts/content/read_workbook.py"), resolve(approval.workbook)],
    { windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (workbookReader.error || workbookReader.status !== 0) throw new Error("WORKBOOK_READ_FAILED");
  const source = JSON.parse(workbookReader.stdout) as Workbook;
  const staged = stageContent(source);
  const approvedIds = new Set(approval.sourceIds);
  if (approvedIds.size !== staged.staged.drafts.length || staged.staged.drafts.some(draft => !approvedIds.has(draft.sourceId))) {
    throw new Error("APPROVED_RECIPE_SET_MISMATCH");
  }
  const importErrors = staged.report.issues.filter(issue => issue.severity === "error" &&
    !(issue.code === "ORPHAN_ROW" && approval.excludedOrphans.includes(`${issue.sheet}!${issue.cell}`)));
  if (importErrors.length) throw new Error(`WORKBOOK_ERRORS: ${importErrors.map(issue => `${issue.sheet}!${issue.cell} ${issue.code}`).join(", ")}`);
  const covers = coverSchema.parse(await loadJson(resolve(approval.coverDirectory, "manifest.json")));
  if (covers.sourceHash !== source.sourceHash) throw new Error("COVER_WORKBOOK_MISMATCH");
  const directory = resolve("public/content");
  await mkdir(directory, { recursive: true });
  const images = new Map<string, string>();
  for (const draft of staged.staged.drafts) {
    const cover = covers.covers.find(item => item.sourceId === draft.sourceId && item.version === draft.rawVersion);
    if (!cover) throw new Error(`COVER_MISSING:${draft.sourceId}`);
    await copyFile(resolve(approval.coverDirectory, cover.file), resolve(directory, cover.file), constants.COPYFILE_EXCL)
      .catch(error => { if (error.code !== "EEXIST") throw error; });
    images.set(draft.sourceId, `/content/${cover.file}`);
  }

  const { options, ingredientAllergies } = workbookDictionary(staged.staged.drafts);
  const dictionary = options.map(option => ({ ...option, sourceRef: "已审核的菜谱及用料工作表",
    reviewRef: approval.reviewRef, approvedAt: approval.reviewedAt }));
  const pool = createDatabasePool(config.DATABASE_URL);
  try {
    const result = await withTransaction(pool, async client => {
      const { rows: [database] } = await client.query("SELECT current_database() AS name, current_user AS role, current_setting('server_version_num')::int AS version");
      if (database.name !== "shiyoushu_web" || database.role !== "shiyoushu_app" || database.version < 180000 || database.version >= 190000) throw new Error("WEB_DATABASE_REQUIRED");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shiyoushu.workbook.release', 0))");
      await saveStagedContent(pool, source, staged, client);
      const { rows: [active] } = await client.query("SELECT calendar_version FROM calendar_active WHERE singleton");
      if (active?.calendar_version !== approval.calendar.version) {
        await loadReviewConfig(pool, { calendar: approval.calendar, dictionary }, client);
      } else {
        const { rows } = await client.query("SELECT term_code, season, start_date::text, end_date::text FROM calendar_period WHERE calendar_version=$1 ORDER BY start_date", [approval.calendar.version]);
        const expected = approval.calendar.periods.map(p => [p.startDate, p.endDate, p.termCode, p.season].join("/")).sort();
        const existing = rows.map(p => [p.start_date, p.end_date, p.term_code, p.season].join("/"));
        if (JSON.stringify(existing) !== JSON.stringify(expected)) throw new Error("CALENDAR_VERSION_CONFLICT");
        await loadReviewConfig(pool, { dictionary }, client);
      }

      let added = 0;
      for (const draft of staged.staged.drafts) {
        const { rows: [stored] } = await client.query(`SELECT id, content_hash, published_version_id FROM content_draft
          WHERE source_hash=$1 AND source_id=$2 AND raw_version=$3`, [source.sourceHash, draft.sourceId, draft.rawVersion]);
        if (!stored) throw new Error(`STAGED_RECIPE_MISSING:${draft.sourceId}`);
        const { rows: [existing] } = await client.query(`SELECT r.id, r.current_published_version_id,
          (SELECT COALESCE(max(v.internal_revision),0)::int FROM recipe_version v WHERE v.recipe_id=r.id) AS revision
          FROM recipe r WHERE r.source_id=$1`, [draft.sourceId]);
        if (stored.published_version_id && stored.published_version_id === existing?.current_published_version_id) continue;
        const version = reviewedRecipe(draft, source.sourceHash, existing?.id ?? null, (existing?.revision ?? 0) + 1,
          images.get(draft.sourceId)!, approval, ingredientAllergies);
        await publishReviewed(pool, publicationInput.parse({ draftId: stored.id, draftHash: stored.content_hash,
          sourceHash: source.sourceHash, operatorRef: "Codex 代操作", reviewRef: approval.reviewRef,
          dictionaryReviewRef: approval.reviewRef, allowUnknownTotal: version.totalMinutes === null, version }), client);
        added++;
      }
      const catalogue = await createRecipeRepository(pool, client).listCurrentWinter();
      const eligible = filterEligible(catalogue, genericContext).eligible.filter(item => approvedIds.has(item.recipe.sourceId));
      if (eligible.length !== approvedIds.size) throw new Error("PUBLISHED_RECIPE_SET_MISMATCH");
      return { published: eligible.length, added, calendarVersion: approval.calendar.version, periods: approval.calendar.periods.length };
    });
    console.log(JSON.stringify(result));
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "WORKBOOK_RELEASE_FAILED");
  process.exitCode = 1;
});
