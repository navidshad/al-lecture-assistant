import React, { useEffect } from 'react';
import { CanvasBlock } from '../types';

// Let TypeScript know that 'mermaid' is available on the window object
declare const mermaid: any;

const parseMarkdown = (text: string): string => {
  if (!text) return '';

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  const blocks: string[] = [];
  
  // Extract and process code blocks
  html = html.replace(/```([\s\S]*?)```/gim, (match) => {
    const codeContent = match.substring(3, match.length - 3).trim();
    blocks.push(`<pre class="bg-gray-900 p-4 rounded-md overflow-x-auto text-sm my-4"><code class="font-mono text-white">${codeContent}</code></pre>`);
    return `__BLOCK__${blocks.length - 1}__`;
  });

  // Extract and process lists
  html = html.replace(/^(?:-|\*|\+) .*(?:\n(?:-|\*|\+) .*)*(?:\n|$)/gim, (match) => {
    const items = match.trim().split('\n').map(item => `<li class="ml-6 list-disc">${item.substring(2)}</li>`).join('');
    blocks.push(`<ul class="space-y-1">${items}</ul>`);
    return `__BLOCK__${blocks.length - 1}__`;
  });

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold mb-2">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-bold mb-3">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-bold mb-4">$1</h1>');
  
  // Bold, Italic, Inline Code
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong class="font-semibold">$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
  html = html.replace(/`(.*?)`/gim, '<code class="bg-gray-900 px-1 py-0.5 rounded-sm text-sm font-mono">$1</code>');

  // Replace remaining newlines with <br>
  html = html.replace(/\n/g, '<br />');
  
  // Re-insert the processed blocks
  html = html.replace(/__BLOCK__(\d+)__/g, (match, p1) => blocks[parseInt(p1, 10)]);

  return html;
};

const parseTable = (markdown: string): string => {
  if (!markdown) return '';
  const lines = markdown.trim().split('\n').map(l => l.trim()).filter(Boolean);
  
  if (lines.length < 2) return `<p class="text-red-400">Invalid table format.</p>`;
  
  const isTableRow = (line: string) => line.startsWith('|') && line.endsWith('|');

  const headerLine = lines[0];
  const separatorLine = lines[1];
  const rowLines = lines.slice(2);

  if (!isTableRow(headerLine) || !separatorLine.match(/^ *\| *[:-]+ *\|/)) {
    return `<p class="text-red-400">Invalid table format: Missing or malformed header or separator line.</p>`;
  }
  
  const headers = headerLine.split('|').slice(1, -1).map(h => h.trim());

  const thead = `<thead><tr class="bg-gray-700/50">${headers.map(h => `<th class="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">${h}</th>`).join('')}</tr></thead>`;

  const tbody = `<tbody>${rowLines.map(row => {
    if (!isTableRow(row)) return ''; // Skip malformed rows
    const cells = row.split('|').slice(1, -1).map(c => c.trim());
    
    while (cells.length < headers.length) {
      cells.push('');
    }
    return `<tr class="border-t border-gray-700 hover:bg-gray-800/50">${cells.slice(0, headers.length).map(c => `<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-200">${c}</td>`).join('')}</tr>`;
  }).join('')}</tbody>`;

  return `<div class="w-full overflow-x-auto rounded-lg border border-gray-700"><table class="min-w-full divide-y divide-gray-700">${thead}${tbody}</table></div>`;
};

const prepareDiagramContent = (content: string): string => {
  const trimmedContent = content.trim();
  const diagramTypes = [
    'graph', 
    'flowchart', 
    'sequenceDiagram', 
    'classDiagram', 
    'stateDiagram-v2', 
    'stateDiagram',
    'erDiagram', 
    'journey', 
    'gantt', 
    'pie', 
    'quadrantChart', 
    'requirementDiagram', 
    'gitGraph', 
    'mindmap', 
    'timeline', 
    'C4Context'
  ];
  
  const startsWithDiagramType = diagramTypes.some(type => trimmedContent.startsWith(type));

  if (startsWithDiagramType) {
    return trimmedContent;
  }

  // If no diagram type is specified, default to flowchart (graph TD)
  return `graph TD\n${trimmedContent}`;
};


const CanvasViewer: React.FC<{ content: CanvasBlock[] }> = ({ content }) => {
  useEffect(() => {
    if (typeof mermaid === 'undefined') return;

    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      fontFamily: '"Inter", sans-serif',
      securityLevel: 'loose',
    });

    if (content && content.some(block => block.type === 'diagram')) {
      try {
        mermaid.run({
          nodes: document.querySelectorAll('.mermaid-diagram-render'),
        });
      } catch (e) {
        console.error("Mermaid.js rendering error:", e);
      }
    }
  }, [content]);

  if (!content || content.length === 0) {
    return (
      <div className="relative w-full h-full bg-black rounded-lg shadow-2xl flex items-center justify-center overflow-auto border border-gray-700 p-6">
        <div className="text-center text-gray-500 w-full self-center">
            <h3 className="text-2xl font-bold">Canvas</h3>
            <p className="mt-2">The AI lecturer will provide extra information here when you ask for it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black rounded-lg shadow-2xl flex flex-col items-start justify-start overflow-auto border border-gray-700 p-6 space-y-4">
      {content.map((block, index) => {
        switch (block.type) {
          case 'markdown':
            return (
              <div
                key={index}
                className="text-left text-gray-200 w-full"
                dangerouslySetInnerHTML={{ __html: parseMarkdown(block.content) }}
              />
            );
          case 'diagram':
            return (
              <div key={index} className="mermaid-diagram-render w-full flex justify-center bg-gray-800 rounded-lg p-4">
                {prepareDiagramContent(block.content)}
              </div>
            );
          case 'ascii':
            return (
              <pre key={index} className="bg-gray-900 p-4 rounded-md overflow-x-auto text-sm w-full">
                <code className="font-mono text-white whitespace-pre">{block.content}</code>
              </pre>
            );
          case 'table':
            return (
              <div
                key={index}
                className="text-left text-gray-200 w-full"
                dangerouslySetInnerHTML={{ __html: parseTable(block.content) }}
              />
            );
          default:
            return null;
        }
      })}
    </div>
  );
};

export default CanvasViewer;