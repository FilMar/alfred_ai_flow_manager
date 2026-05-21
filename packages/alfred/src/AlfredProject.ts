import { AlfredStorage } from "./AlfredStorage.js";
import { AlfredDatabase } from "./AlfredDatabase.js";

export class AlfredProject {
  public readonly storage: AlfredStorage;
  private _database: AlfredDatabase | null = null;

  constructor(public readonly root: string) {
    this.storage = new AlfredStorage(this.root);
  }

  get database(): AlfredDatabase {
    if (!this._database) {
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
