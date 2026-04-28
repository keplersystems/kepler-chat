export interface ModelSelection {
  providerID: string;
  modelID: string;
}

export type Modality = "text" | "audio" | "image" | "video" | "pdf";
export type AttachmentModality = Exclude<Modality, "text">;

export interface ModelCapabilityModalities {
  text?: boolean;
  audio?: boolean;
  image?: boolean;
  video?: boolean;
  pdf?: boolean;
}

export interface ModelCapabilities {
  temperature?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
  toolcall?: boolean;
  input?: ModelCapabilityModalities;
  output?: ModelCapabilityModalities;
  interleaved?: boolean | { field: "reasoning_content" | "reasoning_details" };
}

export interface ProviderModel {
  id?: string;
  name?: string;
  family?: string;
  status?: "alpha" | "beta" | "deprecated" | "active";
  capabilities?: ModelCapabilities;
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
  release_date?: string;
}

export interface Provider {
  id: string;
  name?: string;
  models?: Record<string, ProviderModel>;
  env?: string[];
}

export interface MirroredCredential {
  providerId: string;
  authType: string;
  keyVersion: number;
  updatedAt: string;
}

export interface NormalizedProvider {
  providerId: string;
  providerName: string;
  connected: boolean;
  authMode: "oauth" | "api_key" | "manual_env" | null;
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
  placeholder?: string;
  description?: string;
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
