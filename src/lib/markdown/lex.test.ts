import { describe, expect, it } from "vitest";
import { lexMarkdown, type Tokens } from "./lex";

describe("lexMarkdown", () => {
  it("lexes fenced code with language", () => {
    const tokens = lexMarkdown("```ts\nconst a = 1;\n```");
    const code = tokens.find((t) => t.type === "code") as Tokens.Code;
    expect(code).toBeDefined();
    expect(code.lang).toBe("ts");
    expect(code.text).toBe("const a = 1;");
  });

  it("lexes nested lists", () => {
    const [list] = lexMarkdown("- a\n  - b\n  - c") as [Tokens.List];
    expect(list.type).toBe("list");
    expect(list.ordered).toBe(false);
    const inner = list.items[0].tokens.find((t) => t.type === "list") as Tokens.List;
    expect(inner).toBeDefined();
    expect(inner.items).toHaveLength(2);
  });

  it("lexes gfm tables with alignment", () => {
    const [table] = lexMarkdown("| a | b |\n|---|:-:|\n| 1 | 2 |") as [Tokens.Table];
    expect(table.type).toBe("table");
    expect(table.align).toEqual([null, "center"]);
    expect(table.header).toHaveLength(2);
    expect(table.rows).toEqual([
      [
        expect.objectContaining({ text: "1" }),
        expect.objectContaining({ text: "2" }),
      ],
    ]);
  });

  it("keeps inline html as html tokens with raw source", () => {
    const [para] = lexMarkdown("hi <b>bold</b>") as [Tokens.Paragraph];
    const html = para.tokens.find((t) => t.type === "html") as Tokens.HTML;
    expect(html).toBeDefined();
    expect(html.raw).toBe("<b>");
  });

  it("lexes task lists", () => {
    const [list] = lexMarkdown("- [x] done\n- [ ] todo") as [Tokens.List];
    expect(list.items.map((item) => item.task)).toEqual([true, true]);
    const [done, todo] = list.items;
    const doneBox = done.tokens.find((t) => t.type === "checkbox") as Tokens.Checkbox;
    const todoBox = todo.tokens.find((t) => t.type === "checkbox") as Tokens.Checkbox;
    expect(doneBox.checked).toBe(true);
    expect(todoBox.checked).toBe(false);
  });
});
