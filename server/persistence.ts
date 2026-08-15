import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AuditRecord } from "../shared/types";

export interface AuditRepository {
  append(record: AuditRecord): Promise<void>;
  list(limit: number): Promise<AuditRecord[]>;
}

export class JsonAuditRepository implements AuditRepository {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(dataDirectory = process.env.DATA_DIR || path.join(process.cwd(), "data")) {
    this.filePath = path.resolve(dataDirectory, "audit.json");
  }

  async append(record: AuditRecord): Promise<void> {
    this.writeQueue = this.writeQueue.then(async () => {
      const records = await this.read();
      records.unshift(record);
      await mkdir(path.dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(records.slice(0, 100), null, 2), "utf8");
      await rename(temporaryPath, this.filePath);
    });
    return this.writeQueue;
  }

  async list(limit: number): Promise<AuditRecord[]> {
    const records = await this.read();
    return records.slice(0, Math.max(1, Math.min(100, limit)));
  }

  private async read(): Promise<AuditRecord[]> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(contents) as unknown;
      return Array.isArray(parsed) ? parsed as AuditRecord[] : [];
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
