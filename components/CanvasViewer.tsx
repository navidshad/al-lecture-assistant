import React, { useState, useEffect } from "react";
import { CanvasBlock } from "../types";
import MarkdownRenderer from "./MarkdownRenderer";
import { fixMarkdownContent } from "../services/genaiClient";
import { useToast } from "../hooks/useToast";
import { useApiKey } from "../hooks/useApiKey";
import { Loader2 } from "lucide-react";
import Tooltip from "./Tooltip";

const CanvasViewer: React.FC<{ content: CanvasBlock[] }> = ({ content }) => {
  const [contentBlocks, setContentBlocks] = useState<CanvasBlock[]>(content);
  const [isFixing, setIsFixing] = useState(false);
  const { showToast } = useToast();
  const { apiKey } = useApiKey();

  // Sync contentBlocks when content prop changes
  useEffect(() => {
    setContentBlocks(content);
  }, [content]);

  const handleFixRendering = async () => {
    if (!apiKey) {
      showToast("API key is required to fix markdown rendering", "error");
      return;
    }

    setIsFixing(true);
    try {
      // Join all blocks' content with double newline separator
      const markdown = contentBlocks.map((block) => block.content).join("\n\n");

      const fixedMarkdown = await fixMarkdownContent(markdown, apiKey);

      // Replace all blocks with single fixed block
      setContentBlocks([{ type: "markdown", content: fixedMarkdown }]);
    } catch (error) {
      console.error("Failed to fix markdown:", error);
      showToast(
        `Failed to fix markdown: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
    } finally {
      setIsFixing(false);
    }
  };

  if (!contentBlocks || contentBlocks.length === 0) {
    return (
      <div className="relative w-full h-full bg-black rounded-lg shadow-2xl flex items-center justify-center overflow-auto border border-gray-700 p-6">
        <div className="text-center text-gray-500 w-full self-center">
          <h3 className="text-2xl font-bold">Canvas</h3>
          <p className="mt-2">
            The AI lecturer will provide extra information here when you ask for
            it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black rounded-lg shadow-2xl flex flex-col border border-gray-700 overflow-hidden">
      {/* Header with Fix button */}
      <div className="w-full flex justify-end p-4 border-b border-gray-700 flex-shrink-0">
        <Tooltip content="Use AI to fix malformed markdown, unclosed code fences, broken math syntax, or diagram formatting issues. The content will be refined and re-rendered automatically.">
          <button
            onClick={handleFixRendering}
            disabled={isFixing || !apiKey}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md text-sm font-medium transition-colors"
          >
            {isFixing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Fixing...</span>
              </>
            ) : (
              <span>Fix rendering</span>
            )}
          </button>
        </Tooltip>
      </div>

      {/* Content area */}
      <div
        className="flex-1 w-full px-6 py-4 overflow-y-auto overflow-x-hidden min-h-0"
        dir="auto"
      >
        {contentBlocks.map((block, index) => (
          <div key={index} className="text-gray-200 w-full">
            <MarkdownRenderer markdown={block.content} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default CanvasViewer;
