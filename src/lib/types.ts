export type { Model as ProviderModel, Provider } from "@opencode-ai/sdk/v2";

export interface ModelSelection {
  providerID: string;
  modelID: string;
}

export type Modality = "text" | "audio" | "image" | "video" | "pdf";
export type AttachmentModality = Exclude<Modality, "text">;

export interface NormalizedProvider {
  providerId: string;
  providerName: string;
  connected: boolean;
  authMode: "oauth" | "api_key" | "manual_env";
  oauthMethods: Array<{ index: number; type: "oauth" | "api"; label: string }>;
  envVars: string[];
  keyLikeEnvVars: string[];
  primaryApiKeyEnvVar: string | null;
  requiresAdditionalEnv: boolean;
  envProfileStatus: {
    configuredCount: number;
    totalCount: number;
    configuredKeys: string[];
    missingKeys: string[];
    ready: boolean;
  };
}

export interface EnvSchemaField {
  key: string;
  required: boolean;
  inputKind: "text" | "secret" | "file_path";
  description: string;
}

export interface EnvSchema {
  providerId: string;
  envSchema: EnvSchemaField[];
}

export interface EnvProfileValue {
  key: string;
  value: string | null;
  configured: boolean;
}

export interface EnvProfile {
  providerId: string;
  values: EnvProfileValue[];
}
