import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface UserProfile {
  name: string;
  role: 'student' | 'teacher' | 'researcher' | 'professor' | 'engineer' | 'other';
  roleLabel: string;
  field: string;
  researchDirection: string;
  needs?: string;
  institution?: string;
  targetJournals?: string[];
  language: 'zh' | 'en' | 'bilingual';
  createdAt: string;
  updatedAt: string;
}

const PROFILE_PATH = path.join(os.homedir(), '.tzukwan', 'user-profile.json');

export class UserProfileManager {
  private profilePath: string;

  constructor(profilePath?: string) {
    this.profilePath = profilePath ?? PROFILE_PATH;
  }

  exists(): boolean {
    return fs.existsSync(this.profilePath);
  }

  load(): UserProfile | null {
    try {
      const data = JSON.parse(fs.readFileSync(this.profilePath, 'utf-8')) as UserProfile;
      if (!this.isValidProfile(data)) {
        console.error('[UserProfileManager] Invalid profile data structure');
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Validates that the loaded data conforms to UserProfile interface.
   */
  private isValidProfile(data: unknown): data is UserProfile {
    if (!data || typeof data !== 'object') return false;
    const profile = data as Record<string, unknown>;

    // Check required string fields
    if (typeof profile.name !== 'string' || profile.name.trim() === '') return false;
    if (typeof profile.role !== 'string') return false;
    if (typeof profile.roleLabel !== 'string' || profile.roleLabel.trim() === '') return false;
    if (typeof profile.field !== 'string' || profile.field.trim() === '') return false;
    if (typeof profile.language !== 'string') return false;

    // Check valid role values
    const validRoles: UserProfile['role'][] = ['student', 'teacher', 'researcher', 'professor', 'engineer', 'other'];
    if (!validRoles.includes(profile.role as UserProfile['role'])) return false;

    // Check valid language values
    const validLanguages: UserProfile['language'][] = ['zh', 'en', 'bilingual'];
    if (!validLanguages.includes(profile.language as UserProfile['language'])) return false;

    // Check date fields exist
    if (typeof profile.createdAt !== 'string') return false;
    if (typeof profile.updatedAt !== 'string') return false;

    // Check optional array fields if present
    if (profile.targetJournals !== undefined && !Array.isArray(profile.targetJournals)) return false;

    return true;
  }

  save(profile: UserProfile): void {
    try {
      fs.mkdirSync(path.dirname(this.profilePath), { recursive: true });
      fs.writeFileSync(this.profilePath, JSON.stringify(profile, null, 2), 'utf-8');
    } catch (err) {
      console.error('[UserProfileManager] Failed to save profile:', err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  update(partial: Partial<UserProfile>): UserProfile {
    const existing = this.load();
    if (!existing) {
      throw new Error('No user profile found. Run the setup wizard first.');
    }

    const updated: UserProfile = {
      ...existing,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    this.save(updated);
    return updated;
  }

  buildSystemPromptAddendum(): string {
    const profile = this.load();
    if (!profile) return '';

    const lines: string[] = ['\n\n## User Profile'];

    if (profile.name) lines.push(`- Name: ${profile.name}`);
    lines.push(`- Role: ${profile.roleLabel}`);
    lines.push(`- Field: ${profile.field}`);
    if (profile.researchDirection) lines.push(`- Research direction: ${profile.researchDirection}`);
    if (profile.needs) lines.push(`- Current goals and needs: ${profile.needs}`);
    if (profile.institution) lines.push(`- Institution: ${profile.institution}`);
    if (profile.targetJournals && profile.targetJournals.length > 0) {
      lines.push(`- Target journals or venues: ${profile.targetJournals.join(', ')}`);
    }

    const languageGuidance: Record<UserProfile['language'], string> = {
      zh: 'Prefer responding in Chinese.',
      en: 'Prefer responding in English.',
      bilingual: 'Match the user language and use bilingual terminology where helpful.',
    };
    lines.push(`- Language preference: ${languageGuidance[profile.language]}`);

    const roleGuidance: Record<UserProfile['role'], string> = {
      student: 'Use step-by-step explanations and surface the core concepts before advanced details.',
      teacher: 'Provide teaching-friendly framing, reusable explanations, and course-ready structure.',
      researcher: 'Go deeper on methodology, evidence quality, and frontier tradeoffs.',
      professor: 'Engage at peer level and emphasize novelty, impact, and publication strategy.',
      engineer: 'Balance theory with implementation detail and give operational next steps.',
      other: 'Adapt the level of abstraction to the user context.',
    };
    lines.push(`- Guidance: ${roleGuidance[profile.role]}`);
    lines.push('Adjust answer depth, terminology, and recommendations to fit this profile.');

    return lines.join('\n');
  }

  buildPersonalizedConfig(): Record<string, unknown> {
    const profile = this.load();
    if (!profile) return {};

    const config: Record<string, unknown> = {
      writing: { temperature: 0.6, maxTokens: 8192 },
      experiment: { temperature: 0.3, maxTokens: 8192 },
      review: { temperature: 0.4, maxTokens: 8192 },
      literature: { temperature: 0.5, maxTokens: 8192 },
      advisor: { temperature: 0.7, maxTokens: 8192 },
    };

    switch (profile.role) {
      case 'student':
        (config['advisor'] as Record<string, number>).temperature = 0.8;
        (config['writing'] as Record<string, number>).temperature = 0.7;
        break;
      case 'professor':
        (config['review'] as Record<string, number>).maxTokens = 12000;
        (config['literature'] as Record<string, number>).maxTokens = 12000;
        (config['writing'] as Record<string, number>).maxTokens = 12000;
        break;
      case 'engineer':
        (config['experiment'] as Record<string, number>).temperature = 0.2;
        break;
      default:
        break;
    }

    return config;
  }
}

export default UserProfileManager;
