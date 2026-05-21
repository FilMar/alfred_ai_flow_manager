import { AlfredStorage } from "./AlfredStorage.js";
import { AlfredDatabase } from "./AlfredDatabase.js";

export class AlfredProject {
  public readonly storage: AlfredStorage;
  public readonly database: AlfredDatabase;

  constructor(public readonly root: string) {
    this.storage = new AlfredStorage(this.root);
    this.database = new AlfredDatabase(this.root);
  }

  dispose(): void {
    this.database.close();
  }
}
