import { Select as SelectPrimitive } from "bits-ui";

import Content from "./select-content.svelte";
import Item from "./select-item.svelte";
import Trigger from "./select-trigger.svelte";

const Root = SelectPrimitive.Root;
const Group = SelectPrimitive.Group;
const GroupHeading = SelectPrimitive.GroupHeading;

export { Content, Group, GroupHeading, Item, Root, Trigger };
