import { Children, ReactNode } from "react";

export function SectionSlider({ children }: { children: ReactNode }) {
  const arr = Children.toArray(children);
  return (
    <div className="slide-deck relative">
      {arr.map((child, i) => (
        <div
          key={i}
          id={`section-${i}`}
          data-snap-section
          className="slide-snap relative w-full"
          style={{ zIndex: i + 1 }}
        >
          <div className="slide-stage sticky top-0 w-full">
            <div className="slide-inner">{child}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default SectionSlider;
