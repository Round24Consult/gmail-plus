import type { AppConfig } from '../src/configTypes';

export declare const ENV_VARS: Record<string, string>;
export declare function validatePlaybook(playbook: unknown, fileName?: string): string[];
export declare function validateConfig(config: AppConfig): { errors: string[]; warnings: string[] };
export declare function loadConfig(options?: {
  useEnv?: boolean;
  env?: Record<string, string | undefined>;
  root?: string;
}): { config: AppConfig; warnings: string[] };
