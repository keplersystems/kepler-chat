export interface ProviderModelCatalog {
  id?: string;
  models?: Record<string, { id?: string }>;
}

export function hasProviderModel(
  providers: ProviderModelCatalog[],
  providerId: string,
  modelId: string,
): boolean {
  const provider = providers.find((item) => item.id === providerId);
  if (!provider?.models) {
    return false;
  }

  if (modelId in provider.models) {
    return true;
  }

  return Object.values(provider.models).some((model) => model.id === modelId);
}
