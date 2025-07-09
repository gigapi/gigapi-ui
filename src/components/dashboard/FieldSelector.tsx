import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { getFieldTypeIcon } from "@/lib/dashboard/panel-field-utils";
import { type FieldType } from "@/lib/dashboard/schema-analyzer";

interface FieldOption {
  name: string;
  type: FieldType;
  source?: "schema" | "runtime" | "query";
}

interface FieldSelectorProps {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  fields: FieldOption[];
  placeholder?: string;
  allowNone?: boolean;
  className?: string;
}

export function FieldSelector({
  label,
  value,
  onChange,
  fields,
  placeholder = "Select field",
  allowNone = false,
  className = "",
}: FieldSelectorProps) {
  const IconComponent = getFieldTypeIcon;

  return (
    <div className={`space-y-2 ${className}`}>
      <Label className="text-sm">{label}</Label>
      <Select
        value={value || (allowNone ? "none" : "")}
        onValueChange={(newValue) => {
          if (allowNone && newValue === "none") {
            onChange(undefined);
          } else {
            onChange(newValue);
          }
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="none">None</SelectItem>}
          
          {/* Show current value if it's not in the fields list */}
          {value && !fields.some(f => f.name === value) && (
            <SelectItem value={value}>
              <div className="flex items-center gap-2 w-full">
                <span className="flex-1">{value}</span>
                <span className="text-xs bg-yellow-100 dark:bg-yellow-900 px-1.5 py-0.5 rounded text-yellow-700 dark:text-yellow-300">
                  Missing
                </span>
              </div>
            </SelectItem>
          )}
          
          {fields.map((field) => {
            const Icon = IconComponent(field.type);
            return (
              <SelectItem key={`${field.source}-${field.name}`} value={field.name}>
                <div className="flex items-center gap-2 w-full">
                  <Icon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="flex-1 truncate">{field.name}</span>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {field.type.type}
                    </span>
                    {field.type.format && (
                      <span className="text-xs bg-green-100 dark:bg-green-900 px-1.5 py-0.5 rounded text-green-700 dark:text-green-300">
                        {field.type.format}
                      </span>
                    )}
                    {field.source === "query" && (
                      <span className="text-xs bg-orange-100 dark:bg-orange-900 px-1.5 py-0.5 rounded text-orange-700 dark:text-orange-300">
                        Query
                      </span>
                    )}
                  </div>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}