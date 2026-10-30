"use client";

import Dexie, { type Table } from "dexie";
import type { MealType, RedemptionMethod } from "./types";
import { encryptText, decryptText } from "./device-crypto";

export interface QueuedValidation {
  id?: number;
  token_encrypted: string;
  meal_type: MealType;
  method: RedemptionMethod;
  idempotency_key: string;
  created_at: string;
  status: "pendiente" | "sincronizado" | "error";
  error?: string;
}

class ComedorOfflineDB extends Dexie {
  pending!: Table<QueuedValidation, number>;

  constructor() {
    super("comedor-digital-offline");
    this.version(1).stores({
      pending: "++id, &idempotency_key, status, created_at",
    });
  }
}

export const offlineDb = new ComedorOfflineDB();

export async function queueOfflineValidation(input: {
  token: string;
  meal_type: MealType;
  method: RedemptionMethod;
  idempotency_key: string;
}) {
  return offlineDb.pending.add({
    token_encrypted: await encryptText(input.token),
    meal_type: input.meal_type,
    method: input.method,
    idempotency_key: input.idempotency_key,
    created_at: new Date().toISOString(),
    status: "pendiente",
  });
}

export async function listPendingValidations() {
  return offlineDb.pending.where("status").equals("pendiente").sortBy("created_at");
}

export async function readQueuedToken(item: QueuedValidation) {
  return decryptText(item.token_encrypted);
}

export async function markQueued(id: number, status: "sincronizado" | "error", error?: string) {
  return offlineDb.pending.update(id, { status, error });
}

export async function pendingCount() {
  return offlineDb.pending.where("status").equals("pendiente").count();
}

export async function clearSynced() {
  return offlineDb.pending.where("status").equals("sincronizado").delete();
}
