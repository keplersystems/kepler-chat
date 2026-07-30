import type {
  AttachmentModality,
  ModelSelection,
  Provider,
  ProviderModel,
} from "$lib/types";

export interface ModelOption {
  value: string;
  label: string;
  providerId: string;
  providerName: string;
  modelId: string;
  model: ProviderModel;
}

export interface ProviderGroup {
  providerId: string;
  providerName: string;
  options: ModelOption[];
}

export function buildProviderGroups(
  providers: Provider[],
  connectedProviders: string[],
): ProviderGroup[] {
  const groups: ProviderGroup[] = [];
  for (const provider of providers) {
    if (!connectedProviders.includes(provider.id)) continue;
    const options = Object.values(provider.models).map((model) => ({
      value: `${provider.id}:${model.id}`,
      label: model.name,
      providerId: provider.id,
      providerName: provider.name,
      modelId: model.id,
      model,
    }));
    if (options.length === 0) continue;
    groups.push({ providerId: provider.id, providerName: provider.name, options });
  }
  return groups;
}

export function findModelOption(
  groups: ProviderGroup[],
  selected: ModelSelection | null,
): ModelOption | null {
  if (!selected) return null;
  const value = `${selected.providerID}:${selected.modelID}`;
  for (const group of groups) {
    const match = group.options.find((option) => option.value === value);
    if (match) return match;
  }
  return null;
}

export function fileToModality(file: File): AttachmentModality | null {
  const mime = file.type.toLowerCase();
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime === "application/pdf") return "pdf";
  return null;
}

export function getInputModalities(model: ProviderModel): Set<AttachmentModality> {
  const input = model.capabilities.input;
  const set = new Set<AttachmentModality>();
  if (input.audio) set.add("audio");
  if (input.image) set.add("image");
  if (input.video) set.add("video");
  if (input.pdf) set.add("pdf");
  return set;
}

export function formatContext(value: number | undefined): string | null {
  if (typeof value !== "number" || value <= 0) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}
