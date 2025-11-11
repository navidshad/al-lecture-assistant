import React from "react";
import { Slide, SlideGroup } from "../../types";
import SlidesThumbStrip from "./SlidesThumbStrip";

interface GroupedSlidesThumbStripProps {
  slides: Slide[];
  groups: SlideGroup[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onHover?: (index: number | null) => void;
}

const GroupedSlidesThumbStrip: React.FC<GroupedSlidesThumbStripProps> = ({
  slides,
  groups,
  currentIndex,
  onSelect,
  onHover,
}) => {
  return (
    <div className="space-y-3">
      {groups.map((group, gi) => {
        const groupSlides = group.slideNumbers
          .map((n) => slides[n - 1])
          .filter(Boolean);
        const groupIndices = group.slideNumbers.map((n) => n - 1);
        return (
          <div key={`${group.title}-${gi}`} className="rounded-md border border-gray-700 overflow-hidden">
            <div className="px-2 py-1 bg-gray-800/70 text-gray-300 text-xs font-semibold">
              {group.title}
            </div>
            <div className="p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {groupSlides.map((slide, idx) => {
                  const absoluteIndex = groupIndices[idx];
                  return (
                    <div key={slide.pageNumber}>
                      <SlidesThumbStrip
                        slides={[slide]}
                        currentIndex={currentIndex === absoluteIndex ? 0 : -1}
                        onSelect={() => onSelect(absoluteIndex)}
                        onHover={(local) =>
                          onHover?.(local != null ? absoluteIndex : null)
                        }
                        itemClassName="w-full"
                        imageClassName="w-full h-auto"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default GroupedSlidesThumbStrip;


