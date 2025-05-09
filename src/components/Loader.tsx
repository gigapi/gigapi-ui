// src/components/Loader.js (or your preferred path)
import { useEffect, useRef } from "react";
import "../loader.css"; // We'll create this CSS file next

const Loader = ({ className, ...props }: { className?: string }) => {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (pathRef.current) {
      const pathLength = pathRef.current.getTotalLength();
      // Set the length as a CSS custom property on the path element
      pathRef.current.style.setProperty("--path-length", pathLength.toString());
    }
  }, []);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1000 1000"
      className={`animated-logo ${className || ""}`} // Combine base class with passed className
      {...props}
    >
      {/*
        We don't need the <defs><style>.cls-1{fill:#7d12ff;}</style></defs> here
        because our animation CSS will handle the fill.
        The original fill color #7d12ff will be used in the animation.
      */}
      <g id="Layer_2" data-name="Layer 2">
        <g id="Layer_1-2" data-name="Layer 1">
          {/*
            The path that will be animated.
            It uses the d attribute from your original SVG.
            The className "animated-path" will be used for styling.
          */}
          <path
            ref={pathRef}
            className="animated-path" // Target this with CSS
            d="M500,333.34,666.66,500,500,666.66,333.34,500ZM875,625l125-125L500,0,0,500l500,500L833.34,666.67l-125-125L500,750,250,500,500,250,750,500Z"
          />
        </g>
      </g>
    </svg>
  );
};

export default Loader;
