import { AlfredStorage } from "./AlfredStorage.js";
import type { AlfredDatabase } from "./AlfredDatabase.js";

export class AlfredProject {
  public readonly storage: AlfredStorage;
  private _database: AlfredDatabase | null = null;

  constructor(public readonly root: string) {
    this.storage = new AlfredStorage(this.root);
  }

  // Dynamic import keeps node:sqlite out of the module graph at load time,
  // which prevents jiti (used by pi's Bun binary) from hanging on it.
  async getDatabase(): Promise<AlfredDatabase> {
    if (!this._database) {
      const { AlfredDatabase } = await import("./AlfredDatabase.js");
      this._database = new AlfredDatabase(this.root);
    }
    return this._database;
  }

  dispose(): void {
    if (this._database) {
      this._database.close();
      this._database = null;
    }
  }
}
