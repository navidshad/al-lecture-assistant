import React, { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

interface MermaidProps {
  content: string;
}

const Mermaid: React.FC<MermaidProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!initializedRef.current) {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        securityLevel: "loose",
        fontFamily: "monospace",
      });
      initializedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || !content) return;

    setError(null);
    const id = `mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    mermaid
      .render(id, content)
      .then((result) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = result.svg;
        }
      })
      .catch((err) => {
        console.error("Mermaid rendering error:", err);
        setError(`Failed to render diagram: ${err.message}`);
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
      });
  }, [content]);

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-500/50 rounded-md p-4 text-red-300 text-sm">
        <p className="font-semibold mb-1">Diagram Error</p>
        <p>{error}</p>
        <pre className="mt-2 text-xs bg-black/30 p-2 rounded overflow-x-auto">
          {content}
        </pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-container my-4 flex items-center justify-center"
    />
  );
};

export default Mermaid;

