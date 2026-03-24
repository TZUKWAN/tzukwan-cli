import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Permission {
  name: string;
  description: string;
  allowed: boolean;
}

const DEFAULT_PERMISSIONS: Permission[] = [
  { name: 'file-read', description: 'Read files from disk', allowed: true },
  { name: 'file-write', description: 'Write files to disk', allowed: true },
  { name: 'shell-execute', description: 'Run shell commands', allowed: true },
  { name: 'web-fetch', description: 'Fetch external URLs', allowed: true },
  { name: 'arxiv-search', description: 'Search arXiv papers', allowed: true },
  { name: 'pubmed-search', description: 'Search PubMed literature', allowed: true },
  { name: 'paper-generate', description: 'Generate paper drafts', allowed: true },
  { name: 'dataset-access', description: 'Access public datasets', allowed: true },
  { name: 'agent-collaborate', description: 'Run multi-agent collaboration', allowed: true },
  { name: 'loop-create', description: 'Create automation loops', allowed: true },
  { name: 'hook-execute', description: 'Execute hook commands', allowed: true },
  { name: 'session-save', description: 'Save session history', allowed: true },
  { name: 'config-write', description: 'Modify configuration files', allowed: true },
];

export class PermissionManager {
  private permissions: Map<string, Permission> = new Map();
  private permissionsFile: string;

  constructor() {
    this.permissionsFile = path.join(os.homedir(), '.tzukwan', 'permissions.json');
    this.load();
  }

  /** Normalize permission name (trim whitespace) to prevent bypass via padded names */
  private normalizeName(name: string): string {
    return name.trim();
  }

  check(name: string): boolean {
    const perm = this.permissions.get(this.normalizeName(name));
    return perm ? perm.allowed : false;
  }

  allow(name: string): void {
    const key = this.normalizeName(name);
    const perm = this.permissions.get(key);
    if (perm) {
      perm.allowed = true;
    } else {
      this.permissions.set(key, { name: key, description: key, allowed: true });
    }
    this.save();
  }

  deny(name: string): void {
    const key = this.normalizeName(name);
    const perm = this.permissions.get(key);
    if (perm) {
      perm.allowed = false;
    } else {
      this.permissions.set(key, { name: key, description: key, allowed: false });
    }
    this.save();
  }

  list(): Permission[] {
    return Array.from(this.permissions.values());
  }

  private load(): void {
    for (const perm of DEFAULT_PERMISSIONS) {
      this.permissions.set(perm.name, { ...perm });
    }

    try {
      const saved = JSON.parse(fs.readFileSync(this.permissionsFile, 'utf-8')) as Permission[];
      for (const perm of saved) {
        // Normalize key on load so manually edited files with padded names don't silently mismatch
        const key = this.normalizeName(perm.name);
        this.permissions.set(key, { ...perm, name: key });
      }
    } catch {
      // Fall back to defaults (file may not exist or be malformed).
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(path.dirname(this.permissionsFile), { recursive: true });
      const tempPath = `${this.permissionsFile}.tmp`;
      fs.writeFileSync(
        tempPath,
        JSON.stringify(Array.from(this.permissions.values()), null, 2),
        'utf-8',
      );
      fs.renameSync(tempPath, this.permissionsFile);
    } catch (error) {
      console.error(`[PermissionManager] Failed to save permissions: ${(error as Error).message}`);
    }
  }
}
