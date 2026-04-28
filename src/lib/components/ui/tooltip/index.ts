import { Tooltip as TooltipPrimitive } from "bits-ui";

import Content from "./tooltip-content.svelte";

const Provider = TooltipPrimitive.Provider;
const Root = TooltipPrimitive.Root;
const Trigger = TooltipPrimitive.Trigger;
const Portal = TooltipPrimitive.Portal;

export { Content, Portal, Provider, Root, Trigger };
