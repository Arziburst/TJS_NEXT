import { describe, expect, it } from "vitest";
import { richTextToPlain, sanitizeRichText } from "./rich-text";

describe("sanitizeRichText", () => {
  it("keeps headings, paragraphs, lists and links", () => {
    const html =
      '<h2>My story</h2><p>Line<br>two</p><h3>Orders</h3><ul><li>One</li></ul><ol><li>Two</li></ol><p><a href="mailto:a@b.cd">mail</a></p>';
    expect(sanitizeRichText(html)).toBe(
      '<h2>My story</h2><p>Line<br />two</p><h3>Orders</h3><ul><li>One</li></ul><ol><li>Two</li></ol><p><a href="mailto:a@b.cd">mail</a></p>',
    );
  });

  it("drops scripts, styles and frames with their content", () => {
    expect(sanitizeRichText('<p>Hi</p><script>alert(1)</script><style>p{}</style><iframe src="x">y</iframe>')).toBe("<p>Hi</p>");
    expect(sanitizeRichText("<p>a<script>document.cookie</script>b</p>")).toBe("<p>ab</p>");
  });

  it("drops every attribute but a safe href", () => {
    expect(sanitizeRichText('<p onclick="x()" style="color:red" class="c" id="i">Text</p>')).toBe("<p>Text</p>");
    expect(sanitizeRichText('<p><img src=x onerror="alert(1)">Text</p>')).toBe("<p>Text</p>");
  });

  it("turns a link with an unsafe href into its text", () => {
    expect(sanitizeRichText('<p><a href="javascript:alert(1)">click</a></p>')).toBe("<p>click</p>");
    expect(sanitizeRichText('<p><a href=" JaVaScRiPt:alert(1)">click</a></p>')).toBe("<p>click</p>");
    expect(sanitizeRichText('<p><a href="data:text/html,x">click</a></p>')).toBe("<p>click</p>");
    expect(sanitizeRichText('<p><a href="//evil.example">click</a></p>')).toBe("<p>click</p>");
    expect(sanitizeRichText("<p><a>click</a></p>")).toBe("<p>click</p>");
  });

  it("opens external links safely and keeps internal ones in place", () => {
    expect(sanitizeRichText('<p><a href="https://example.com" target="_top" rel="opener">x</a></p>')).toBe(
      '<p><a href="https://example.com" rel="noopener noreferrer" target="_blank">x</a></p>',
    );
    expect(sanitizeRichText('<p><a href="/uk/shop" target="_blank">shop</a></p>')).toBe('<p><a href="/uk/shop">shop</a></p>');
  });

  it("maps other headings and divs to the format and unwraps other elements", () => {
    expect(sanitizeRichText("<h1>A</h1><h4>B</h4><div>C</div><p><b>bold</b> <span>s</span></p>")).toBe(
      "<h2>A</h2><h3>B</h3><p>C</p><p>bold s</p>",
    );
  });

  it("removes empty blocks and lists, and keeps nothing for an empty editor", () => {
    expect(sanitizeRichText("<p><br></p><h2> </h2><ul><li></li></ul><p>&nbsp;</p>")).toBe("");
    expect(sanitizeRichText("<p>Text</p><p><br></p>")).toBe("<p>Text</p>");
  });

  it("escapes text that looks like markup", () => {
    expect(sanitizeRichText("<p>1 &lt; 2 &amp; &lt;script&gt;</p>")).toBe("<p>1 &lt; 2 &amp; &lt;script&gt;</p>");
  });
});

describe("richTextToPlain", () => {
  it("joins the blocks with spaces and decodes entities", () => {
    expect(richTextToPlain("<h2>Hello</h2><p>Tom &amp; Jerry<br />here</p><ul><li>a</li><li>b</li></ul>")).toBe(
      "Hello Tom & Jerry here a b",
    );
  });
});
