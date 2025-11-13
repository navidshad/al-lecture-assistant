import React from "react";

type TabName = "slide" | "canvas";

const TabNav: React.FC<{
  activeTab: TabName;
  onChange: (tab: TabName) => void;
}> = ({ activeTab, onChange }) => {
  const tabButtonClasses = (tabName: TabName) =>
    `px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none ${
      activeTab === tabName
        ? "text-blue-400 border-b-2 border-blue-400"
        : "text-gray-400 border-b-2 border-transparent hover:bg-gray-700/50 hover:text-gray-200"
    }`;

  return (
    <div className="flex-shrink-0">
      <nav className="-mb-px flex space-x-2" aria-label="Tabs">
        <button
          onClick={() => onChange("slide")}
          className={tabButtonClasses("slide")}
        >
          Slide
        </button>
        <button
          onClick={() => onChange("canvas")}
          className={tabButtonClasses("canvas")}
        >
          Canvas
        </button>
      </nav>
    </div>
  );
};

export default TabNav;
