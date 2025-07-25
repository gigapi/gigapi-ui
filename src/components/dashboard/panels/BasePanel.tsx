import { type ReactNode } from "react";
import { type PanelProps } from "@/types/dashboard.types";
import { transformDataForPanel } from "@/lib/dashboard/data-transformers";

abstract class BasePanel {
  abstract render(props: PanelProps): ReactNode;

  protected transformData(props: PanelProps) {
    return transformDataForPanel(props.data, props.config);
  }
}

export function withPanelWrapper<T extends PanelProps>(
  WrappedComponent: React.ComponentType<T>
) {
  return function PanelWrapper(props: T) {
    const { isEditMode, isSelected, onSelect, onTimeRangeUpdate } = props;

    // Common panel logic can be added here
    const handleClick = () => {
      if (isEditMode && !isSelected && onSelect) {
        onSelect();
      }
    };

    return (
      <div
        className="h-full w-full overflow-hidden"
        style={{ minHeight: "200px" }}
        onClick={handleClick}
      >
        <WrappedComponent {...props} onTimeRangeUpdate={onTimeRangeUpdate} />
      </div>
    );
  };
}

export default BasePanel;
