import React, { useEffect, useRef } from "react";
import mermaid from "mermaid";
import { useToast } from "../hooks/useToast";

interface MermaidProps {
  content: string;
}

const Mermaid: React.FC<MermaidProps> = ({ content }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const { showToast } = useToast();
  const errorShownRef = useRef(false);

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

    // Reset error flag when content changes
    errorShownRef.current = false;

    const id = `mermaid-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    mermaid
      .render(id, content)
      .then((result) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = result.svg;
        }
      })
      .catch((err) => {
        console.error("Mermaid rendering error:", err);
        if (containerRef.current) {
          containerRef.current.innerHTML = "";
        }
        // Show toast only once per content change
        if (!errorShownRef.current) {
          errorShownRef.current = true;
          const errorMessage = err.message || "Unknown error";
          showToast(
            `Failed to render Mermaid diagram: ${errorMessage}`,
            "error"
          );
        }
      });
  }, [content, showToast]);

  return (
    <div
      ref={containerRef}
      className="mermaid-container my-4 flex items-center justify-center"
    />
  );
};

export default Mermaid;
