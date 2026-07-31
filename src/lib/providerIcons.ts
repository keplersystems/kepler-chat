// Provider id → inline SVG, keyed by models.dev provider id. LobeHub mono SVGs
// use fill="currentColor" so they inherit the parent's colour; unmapped
// providers render no logo.

import aihubmix from "@lobehub/icons-static-svg/icons/aihubmix.svg?raw";
import ai302 from "@lobehub/icons-static-svg/icons/ai302.svg?raw";
import alibaba from "@lobehub/icons-static-svg/icons/alibaba.svg?raw";
import anthropic from "@lobehub/icons-static-svg/icons/anthropic.svg?raw";
import azure from "@lobehub/icons-static-svg/icons/azure.svg?raw";
import baseten from "@lobehub/icons-static-svg/icons/baseten.svg?raw";
import bedrock from "@lobehub/icons-static-svg/icons/bedrock.svg?raw";
import cerebras from "@lobehub/icons-static-svg/icons/cerebras.svg?raw";
import cloudflare from "@lobehub/icons-static-svg/icons/cloudflare.svg?raw";
import cohere from "@lobehub/icons-static-svg/icons/cohere.svg?raw";
import deepinfra from "@lobehub/icons-static-svg/icons/deepinfra.svg?raw";
import deepseek from "@lobehub/icons-static-svg/icons/deepseek.svg?raw";
import fireworks from "@lobehub/icons-static-svg/icons/fireworks.svg?raw";
import friendli from "@lobehub/icons-static-svg/icons/friendli.svg?raw";
import github from "@lobehub/icons-static-svg/icons/github.svg?raw";
import githubcopilot from "@lobehub/icons-static-svg/icons/githubcopilot.svg?raw";
import google from "@lobehub/icons-static-svg/icons/google.svg?raw";
import groq from "@lobehub/icons-static-svg/icons/groq.svg?raw";
import huggingface from "@lobehub/icons-static-svg/icons/huggingface.svg?raw";
import inception from "@lobehub/icons-static-svg/icons/inception.svg?raw";
import inference from "@lobehub/icons-static-svg/icons/inference.svg?raw";
import kimi from "@lobehub/icons-static-svg/icons/kimi.svg?raw";
import lmstudio from "@lobehub/icons-static-svg/icons/lmstudio.svg?raw";
import llmapi from "@lobehub/icons-static-svg/icons/llmapi.svg?raw";
import meta from "@lobehub/icons-static-svg/icons/meta.svg?raw";
import minimax from "@lobehub/icons-static-svg/icons/minimax.svg?raw";
import mistral from "@lobehub/icons-static-svg/icons/mistral.svg?raw";
import modelscope from "@lobehub/icons-static-svg/icons/modelscope.svg?raw";
import morph from "@lobehub/icons-static-svg/icons/morph.svg?raw";
import nebius from "@lobehub/icons-static-svg/icons/nebius.svg?raw";
import nova from "@lobehub/icons-static-svg/icons/nova.svg?raw";
import novita from "@lobehub/icons-static-svg/icons/novita.svg?raw";
import nvidia from "@lobehub/icons-static-svg/icons/nvidia.svg?raw";
import ollama from "@lobehub/icons-static-svg/icons/ollama.svg?raw";
import opencode from "@lobehub/icons-static-svg/icons/opencode.svg?raw";
import openai from "@lobehub/icons-static-svg/icons/openai.svg?raw";
import openrouter from "@lobehub/icons-static-svg/icons/openrouter.svg?raw";
import perplexity from "@lobehub/icons-static-svg/icons/perplexity.svg?raw";
import poe from "@lobehub/icons-static-svg/icons/poe.svg?raw";
import qiniu from "@lobehub/icons-static-svg/icons/qiniu.svg?raw";
import sambanova from "@lobehub/icons-static-svg/icons/sambanova.svg?raw";
import siliconcloud from "@lobehub/icons-static-svg/icons/siliconcloud.svg?raw";
import stepfun from "@lobehub/icons-static-svg/icons/stepfun.svg?raw";
import submodel from "@lobehub/icons-static-svg/icons/submodel.svg?raw";
import together from "@lobehub/icons-static-svg/icons/together.svg?raw";
import upstage from "@lobehub/icons-static-svg/icons/upstage.svg?raw";
import v0 from "@lobehub/icons-static-svg/icons/v0.svg?raw";
import venice from "@lobehub/icons-static-svg/icons/venice.svg?raw";
import vercel from "@lobehub/icons-static-svg/icons/vercel.svg?raw";
import vertexai from "@lobehub/icons-static-svg/icons/vertexai.svg?raw";
import workersai from "@lobehub/icons-static-svg/icons/workersai.svg?raw";
import xai from "@lobehub/icons-static-svg/icons/xai.svg?raw";
import xiaomimimo from "@lobehub/icons-static-svg/icons/xiaomimimo.svg?raw";
import zai from "@lobehub/icons-static-svg/icons/zai.svg?raw";
import zenmux from "@lobehub/icons-static-svg/icons/zenmux.svg?raw";
import zhipu from "@lobehub/icons-static-svg/icons/zhipu.svg?raw";

function normalize(raw: string): string {
  return raw
    .replace(/\sheight="[^"]*"/g, "")
    .replace(/\swidth="[^"]*"/g, "")
    .replace(/\sstyle="[^"]*"/g, "")
    .replace(
      /<svg\b/,
      '<svg style="width:100%;height:100%;display:block"',
    );
}

const PROVIDER_ICONS: Record<string, string> = {
  "302ai": ai302,
  "aihubmix": aihubmix,
  "alibaba": alibaba,
  "alibaba-cn": alibaba,
  "amazon-bedrock": bedrock,
  "anthropic": anthropic,
  "azure": azure,
  "azure-cognitive-services": azure,
  "baseten": baseten,
  "cerebras": cerebras,
  "cloudflare-ai-gateway": cloudflare,
  "cloudflare-workers-ai": workersai,
  "cohere": cohere,
  "deepinfra": deepinfra,
  "deepseek": deepseek,
  "fireworks-ai": fireworks,
  "friendli": friendli,
  "github-copilot": githubcopilot,
  "github-models": github,
  "google": google,
  "google-vertex": vertexai,
  "google-vertex-anthropic": vertexai,
  "groq": groq,
  "huggingface": huggingface,
  "inception": inception,
  "inference": inference,
  "kimi-for-coding": kimi,
  "llama": meta,
  "llmgateway": llmapi,
  "lmstudio": lmstudio,
  "minimax": minimax,
  "minimax-cn": minimax,
  "minimax-cn-coding-plan": minimax,
  "minimax-coding-plan": minimax,
  "mistral": mistral,
  "modelscope": modelscope,
  "moonshotai": kimi,
  "moonshotai-cn": kimi,
  "morph": morph,
  "nebius": nebius,
  "nova": nova,
  "novita-ai": novita,
  "nvidia": nvidia,
  "ollama-cloud": ollama,
  "opencode": opencode,
  "opencode-go": opencode,
  "openai": openai,
  "openrouter": openrouter,
  "perplexity": perplexity,
  "poe": poe,
  "qiniu-ai": qiniu,
  "sambanova": sambanova,
  "siliconflow": siliconcloud,
  "siliconflow-cn": siliconcloud,
  "stepfun": stepfun,
  "submodel": submodel,
  "togetherai": together,
  "upstage": upstage,
  "v0": v0,
  "venice": venice,
  "vercel": vercel,
  "xai": xai,
  "xiaomi": xiaomimimo,
  "zai": zai,
  "zai-coding-plan": zai,
  "zenmux": zenmux,
  "zhipuai": zhipu,
  "zhipuai-coding-plan": zhipu,
};

const NORMALIZED: Record<string, string> = Object.fromEntries(
  Object.entries(PROVIDER_ICONS).map(([id, raw]) => [id, normalize(raw)]),
);

export function getProviderIconSvg(providerId: string): string | null {
  return NORMALIZED[providerId] ?? null;
}

/** Model families whose bare ids (no "provider/" prefix) map to a known provider. */
const MODEL_PREFIX_PROVIDERS: Array<[RegExp, string]> = [
  [/^claude/, "anthropic"],
  [/^(gpt|o[134]|codex)/, "openai"],
  [/^gemini/, "google"],
  [/^grok/, "xai"],
  [/^(deepseek|ds-)/, "deepseek"],
  [/^(qwen|qwq)/, "alibaba"],
  [/^glm/, "zhipuai"],
  [/^kimi/, "moonshotai"],
  [/^mistral|^magistral|^devstral/, "mistral"],
  [/^llama/, "llama"],
];

export function providerIdForModelValue(modelValue: string): string | null {
  const slash = modelValue.indexOf("/");
  if (slash > 0) {
    const providerId = modelValue.slice(0, slash);
    if (NORMALIZED[providerId]) return providerId;
  }
  const bare = (slash > 0 ? modelValue.slice(slash + 1) : modelValue).toLowerCase();
  return MODEL_PREFIX_PROVIDERS.find(([pattern]) => pattern.test(bare))?.[1] ?? null;
}
