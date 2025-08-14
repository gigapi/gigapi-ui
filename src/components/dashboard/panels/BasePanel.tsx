import { type PanelProps } from "@/types/dashboard.types";

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
        className="h-full w-full overflow-visible p-4"
        style={{ minHeight: "200px" }}
        onClick={handleClick}
      >
        <WrappedComponent {...props} onTimeRangeUpdate={onTimeRangeUpdate} />
      </div>
    );
  };
}
