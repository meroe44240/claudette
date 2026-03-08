/**
 * Simple markdown to HTML renderer for job descriptions.
 * Handles: headers, bold, italic, lists, links, paragraphs.
 */

export function renderMarkdown(md: string): string {
  if (!md) return '';

  let html = md
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers (must be before other replacements)
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>')
    // Bold & italic
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary-600 underline">$1</a>')
    // Unordered lists (- items)
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    // Ordered lists (1. items)
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>');

  // Wrap consecutive <li> elements in <ul>
  html = html.replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="list-disc space-y-1 my-3">$1</ul>');

  // Paragraphs: wrap lines that aren't already in HTML tags
  const lines = html.split('\n');
  const result: string[] = [];
  let inParagraph = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      continue;
    }
    if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<li') || trimmed.startsWith('</ul')) {
      if (inParagraph) {
        result.push('</p>');
        inParagraph = false;
      }
      result.push(trimmed);
    } else {
      if (!inParagraph) {
        result.push('<p class="my-2 leading-relaxed">');
        inParagraph = true;
      }
      result.push(trimmed);
    }
  }
  if (inParagraph) result.push('</p>');

  return result.join('\n');
}
