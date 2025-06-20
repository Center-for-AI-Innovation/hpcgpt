declare module 'marked-terminal' {
    interface TerminalRendererOptions {
        code?: string;
        blockquote?: string;
        html?: string;
        heading?: string;
        firstHeading?: string;
        hr?: string;
        listitem?: string;
        table?: string;
        strong?: string;
        em?: string;
        codespan?: string;
        del?: string;
        link?: string;
        href?: string;
    }

    class TerminalRenderer {
        constructor(options?: TerminalRendererOptions);
        code(code: string, language?: string): string;
        blockquote(quote: string): string;
        html(html: string): string;
        heading(text: string, level: number): string;
        hr(): string;
        list(body: string, ordered: boolean): string;
        listitem(text: string): string;
        paragraph(text: string): string;
        table(header: string, body: string): string;
        tablerow(content: string): string;
        tablecell(content: string, flags: { header: boolean; align?: string }): string;
        strong(text: string): string;
        em(text: string): string;
        codespan(text: string): string;
        br(): string;
        del(text: string): string;
        link(href: string, title: string, text: string): string;
        image(href: string, title: string, text: string): string;
        text(text: string): string;
    }

    export = TerminalRenderer;
} 