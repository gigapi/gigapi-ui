import { type ReactNode } from "react";
import { type PanelProps } from "@/types/dashboard.types";
import { transformDataForPanel } from "@/lib/dashboard/data-transformers";

export interface BasePanelProps extends PanelProps {
  children?: ReactNode;
}

export abstract class BasePanel {
  abstract render(props: PanelProps): ReactNode;

  protected transformData(props: PanelProps) {
    return transformDataForPanel(props.data, props.config);
  }
}

export function withPanelWrapper<T extends PanelProps>(
  WrappedComponent: React.ComponentType<T>
) {
  return function PanelWrapper(props: T) {
    const { isEditMode, isSelected, onSelect, config } = props;

    // Common panel logic can be added here
    const handleClick = () => {
      if (isEditMode && !isSelected && onSelect) {
        onSelect(config.id);
      }
    };

    return (
      <div className="h-full w-full overflow-hidden" onClick={handleClick}>
        <WrappedComponent {...props} />
      </div>
    );
  };
}

export default BasePanel;
