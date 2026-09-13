import { TableHistory } from "convex-table-history";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation } from "./_generated/server";

// Table history for the baby table, recorded via triggers on every write.
const babyAuditLog = new TableHistory<DataModel, "baby">(components.babyAuditLog);

const triggers = new Triggers<DataModel>();
triggers.register("baby", babyAuditLog.trigger());

/**
 * Mutation wrapper that records baby-table writes to the audit log.
 * Use for any mutation that writes to the `baby` table.
 */
export const mutationWithTriggers = customMutation(mutation, customCtx(triggers.wrapDB));
