import { Lexer, type MarkedToken, type Token, type Tokens } from "marked";

export function lexMarkdown(src: string): Token[] {
  return Lexer.lex(src, { gfm: true });
}

export type { MarkedToken, Token, Tokens };
