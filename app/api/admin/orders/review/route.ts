import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import {
  isOrderStatus,
  type OrderStatus,
} from "@/lib/duplicate-orders.mjs";
import { isDuplicateReviewSchemaMissing } from "@/lib/duplicate-review-errors.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REVIEW_STATUSES = new Set<OrderStatus>([
  "pending_review",
  "confirmed_new",
  "confirmed_duplicate",
]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const orderId = Number(body?.orderId);
  const status = body?.status;
  const suppliedDuplicateOf = body?.duplicateOf;

  if (
    !Number.isSafeInteger(orderId) ||
    orderId < 1 ||
    !isOrderStatus(status) ||
    !REVIEW_STATUSES.has(status)
  ) {
    return NextResponse.json({ error: "invalid_review" }, { status: 400 });
  }

  let duplicateOf: number | null = null;
  if (status === "confirmed_duplicate") {
    duplicateOf = Number(suppliedDuplicateOf);
    if (
      !Number.isSafeInteger(duplicateOf) ||
      duplicateOf < 1 ||
      duplicateOf === orderId
    ) {
      return NextResponse.json({ error: "invalid_duplicate_reference" }, {
        status: 400,
      });
    }
  }

  let tx: Awaited<ReturnType<typeof db.transaction>> | null = null;
  try {
    tx = await db.transaction("write");
    const currentResult = await tx.execute({
      sql: `
        SELECT duplicate_status, duplicate_of
        FROM orders
        WHERE id = ?
      `,
      args: [orderId],
    });
    const current = currentResult.rows[0];
    if (!current) {
      await tx.rollback();
      return NextResponse.json({ error: "order_not_found" }, { status: 404 });
    }

    const previousStatus = String(current.duplicate_status);
    if (previousStatus !== "pending_review") {
      await tx.rollback();
      return NextResponse.json({ error: "review_already_resolved" }, {
        status: 409,
      });
    }

    if (status === "confirmed_duplicate") {
      const candidateResult = await tx.execute({
        sql: "SELECT id, duplicate_status FROM orders WHERE id = ?",
        args: [duplicateOf],
      });
      if (
        !candidateResult.rows[0] ||
        duplicateOf !==
          (current.duplicate_of == null ? null : Number(current.duplicate_of)) ||
        String(candidateResult.rows[0].duplicate_status) ===
          "confirmed_duplicate"
      ) {
        await tx.rollback();
        return NextResponse.json(
          { error: "invalid_duplicate_reference" },
          { status: 400 }
        );
      }
    } else if (status === "pending_review") {
      duplicateOf =
        current.duplicate_of == null ? null : Number(current.duplicate_of);
    }

    const nextDuplicateOf =
      status === "confirmed_new" ? null : duplicateOf;

    await tx.execute({
      sql: `
        UPDATE orders
        SET duplicate_status = ?, duplicate_of = ?
        WHERE id = ? AND duplicate_status = 'pending_review'
      `,
      args: [status, nextDuplicateOf, orderId],
    });
    const updated = await tx.execute("SELECT changes() AS count");
    if (Number(updated.rows[0]?.count ?? 0) !== 1) {
      await tx.rollback();
      return NextResponse.json({ error: "review_already_resolved" }, {
        status: 409,
      });
    }
    await tx.execute({
      sql: `
        INSERT INTO order_review_history (
          order_id, previous_status, new_status,
          previous_duplicate_of, duplicate_of, reviewed_by
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        orderId,
        previousStatus,
        status,
        current.duplicate_of == null ? null : Number(current.duplicate_of),
        nextDuplicateOf,
        "admin",
      ],
    });

    await tx.commit();
    return NextResponse.json({
      ok: true,
      orderId,
      status,
      duplicateOf: nextDuplicateOf,
    });
  } catch (error) {
    if (tx) await tx.rollback();
    if (isDuplicateReviewSchemaMissing(error)) {
      return NextResponse.json(
        {
          error: "duplicate_review_migration_required",
          message: "La base nécessite la migration de revue des doublons.",
        },
        { status: 503 }
      );
    }
    console.error("Order duplicate review failed:", error);
    return NextResponse.json({ error: "review_failed" }, { status: 500 });
  }
}
