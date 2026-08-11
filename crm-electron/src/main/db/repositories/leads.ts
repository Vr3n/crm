import type { Database } from "better-sqlite3";
import { baseColumns, nowIso, softDelete, type Paged } from "./helpers";

export type LeadStatus = "NEW" | "INTERESTED" | "CONVERTED" | "DROPPED";
export type LeadGender = "M" | "F" | "O";

export interface LeadRow {
  uuid: string;
  created_at: string;
  updated_at: string;
  is_deleted: number;
  deleted_at: string | null;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: LeadGender | null;
  status: LeadStatus;
}

export interface CreateLeadInput {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  gender?: LeadGender | null;
  status?: LeadStatus;
  mobileNumbers?: string[];
  emails?: string[];
}

export interface ListLeadsParams {
  search?: string;
  status?: LeadStatus;
  page: number;
  pageSize: number;
}

export const leadRepo = {
  list(db: Database, opts: ListLeadsParams): Paged<LeadRow> {
    const where: string[] = ["l.is_deleted = 0"];
    const params: Record<string, unknown> = {};
    if (opts.status) {
      where.push("l.status = @status");
      params.status = opts.status;
    }
    if (opts.search) {
      where.push(
        `(
          l.first_name LIKE @q OR l.middle_name LIKE @q OR l.last_name LIKE @q
          OR l.uuid IN (SELECT lead_id FROM lead_mobile_numbers WHERE mobile_number = @exact)
          OR l.uuid IN (SELECT lead_id FROM lead_email_addresses WHERE email LIKE @q)
        )`,
      );
      params.q = `%${opts.search}%`;
      params.exact = opts.search;
    }
    const whereSql = where.join(" AND ");
    const total = (
      db.prepare(`SELECT COUNT(*) AS c FROM leads l WHERE ${whereSql}`).get(params) as {
        c: number;
      }
    ).c;
    const rows = db
      .prepare(
        `SELECT * FROM leads l
         WHERE ${whereSql}
         ORDER BY l.created_at DESC
         LIMIT @pageSize OFFSET @offset`,
      )
      .all({
        ...params,
        pageSize: opts.pageSize,
        offset: (opts.page - 1) * opts.pageSize,
      }) as LeadRow[];
    return { rows, total, page: opts.page, pageSize: opts.pageSize };
  },

  get(db: Database, id: string): LeadRow | undefined {
    return db
      .prepare("SELECT * FROM leads WHERE uuid = ? AND is_deleted = 0")
      .get(id) as LeadRow | undefined;
  },

  /** Insert lead + mobile/email rows in ONE transaction (Django inlineformsets). */
  create(db: Database, input: CreateLeadInput): LeadRow {
    return db.transaction(() => {
      const base = baseColumns();
      db.prepare(
        `INSERT INTO leads (uuid, created_at, updated_at, is_deleted, deleted_at,
           first_name, middle_name, last_name, gender, status)
         VALUES (@uuid, @created_at, @updated_at, @is_deleted, @deleted_at,
           @first_name, @middle_name, @last_name, @gender, @status)`,
      ).run({
        ...base,
        first_name: input.first_name,
        middle_name: input.middle_name ?? null,
        last_name: input.last_name,
        gender: input.gender ?? null,
        status: input.status ?? "NEW",
      });

      const insMobile = db.prepare(
        `INSERT INTO lead_mobile_numbers (uuid, created_at, updated_at, is_deleted, deleted_at, lead_id, mobile_number)
         VALUES (@uuid, @created_at, @updated_at, 0, NULL, @lead_id, @mobile_number)`,
      );
      for (const m of input.mobileNumbers ?? []) {
        insMobile.run({ ...baseColumns(), lead_id: base.uuid, mobile_number: m });
      }

      const insEmail = db.prepare(
        `INSERT INTO lead_email_addresses (uuid, created_at, updated_at, is_deleted, deleted_at, lead_id, email)
         VALUES (@uuid, @created_at, @updated_at, 0, NULL, @lead_id, @email)`,
      );
      for (const e of input.emails ?? []) {
        insEmail.run({ ...baseColumns(), lead_id: base.uuid, email: e });
      }

      return leadRepo.get(db, base.uuid)!;
    })();
  },

  update(db: Database, id: string, patch: Partial<Pick<LeadRow, "first_name" | "middle_name" | "last_name" | "gender" | "status">>): LeadRow {
    const existing = leadRepo.get(db, id);
    if (!existing) throw new Error("NOT_FOUND");
    const next = { ...existing, ...patch, updated_at: nowIso() };
    db.prepare(
      `UPDATE leads SET first_name = @first_name, middle_name = @middle_name,
         last_name = @last_name, gender = @gender, status = @status, updated_at = @updated_at
       WHERE uuid = @uuid`,
    ).run({
      uuid: id,
      first_name: next.first_name,
      middle_name: next.middle_name,
      last_name: next.last_name,
      gender: next.gender,
      status: next.status,
      updated_at: next.updated_at,
    });
    return leadRepo.get(db, id)!;
  },

  /**
   * Port of LeadMaster.delete(): soft-delete lead, cascade to memberships and
   * receipts (the leads ← memberships ← receipts FK chain).
   */
  softDelete(db: Database, id: string): void {
    db.transaction(() => {
      softDelete(db, "leads", id);
      const sales = db
        .prepare("SELECT uuid FROM memberships WHERE lead_id = ? AND is_deleted = 0")
        .all(id) as { uuid: string }[];
      for (const s of sales) {
        db.prepare(
          "UPDATE receipts SET is_deleted = 1, deleted_at = ? WHERE sale_id = ?",
        ).run(nowIso(), s.uuid);
        softDelete(db, "memberships", s.uuid);
      }
    })();
  },
};
