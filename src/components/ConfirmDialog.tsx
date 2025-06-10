import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Trash2, AlertCircle } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";

  // Enhanced type-to-confirm props
  requireTypeToConfirm?: boolean;
  typeToConfirmText?: string;
  typeToConfirmLabel?: string;
  typeToConfirmPlaceholder?: string;
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "default",
  requireTypeToConfirm = false,
  typeToConfirmText = "",
  typeToConfirmLabel = "Type to confirm",
  typeToConfirmPlaceholder = "Enter confirmation text",
}: ConfirmDialogProps) {
  const [confirmationInput, setConfirmationInput] = useState("");
  const [isConfirmEnabled, setIsConfirmEnabled] = useState(
    !requireTypeToConfirm
  );

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmationInput("");
      setIsConfirmEnabled(!requireTypeToConfirm);
    }
  }, [isOpen, requireTypeToConfirm]);

  // Check if confirmation input matches required text
  useEffect(() => {
    if (requireTypeToConfirm && typeToConfirmText) {
      setIsConfirmEnabled(
        confirmationInput.trim().toLowerCase() ===
          typeToConfirmText.toLowerCase()
      );
    } else {
      setIsConfirmEnabled(true);
    }
  }, [confirmationInput, requireTypeToConfirm, typeToConfirmText]);

  const handleConfirm = (): void => {
    if (!isConfirmEnabled) return;

    onConfirm();
    onClose();
    setConfirmationInput(""); // Reset for next time
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && isConfirmEnabled) {
      handleConfirm();
    }
  };

  const handleClose = (): void => {
    onClose();
    setConfirmationInput(""); // Reset for next time
  };

  // Icon selection based on variant
  const getIcon = () => {
    switch (variant) {
      case "destructive":
        return <AlertTriangle className="w-5 h-5 text-destructive" />;
      default:
        return <AlertCircle className="w-5 h-5 text-blue-500" />;
    }
  };

  // Color classes for the input border when type-to-confirm is required
  const getInputClassName = (): string => {
    if (!requireTypeToConfirm) return "";

    if (!confirmationInput) {
      return "border-muted-foreground/20";
    }

    return isConfirmEnabled
      ? "border-green-500 bg-green-50/50 dark:bg-green-950/20"
      : "border-red-500 bg-red-50/50 dark:bg-red-950/20";
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getIcon()}
            {title}
          </DialogTitle>
          <DialogDescription className="text-left">
            {description}
          </DialogDescription>
        </DialogHeader>

        {/* Type-to-confirm input section */}
        {requireTypeToConfirm && (
          <div className="space-y-3 py-4">
            <div className="p-3 rounded-lg bg-muted/50 border border-muted">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-foreground mb-1">
                    This action cannot be undone
                  </p>
                  <p className="text-muted-foreground">
                    Please type{" "}
                    <code className="px-1.5 py-0.5 bg-background rounded text-xs font-mono border">
                      {typeToConfirmText}
                    </code>{" "}
                    to confirm.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label
                htmlFor="confirmation-input"
                className="text-sm font-medium"
              >
                {typeToConfirmLabel}
              </Label>
              <Input
                id="confirmation-input"
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={typeToConfirmPlaceholder}
                className={`font-mono text-sm ${getInputClassName()}`}
                autoComplete="off"
                autoFocus={requireTypeToConfirm}
              />
              {requireTypeToConfirm &&
                confirmationInput &&
                !isConfirmEnabled && (
                  <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Text does not match. Please type "{typeToConfirmText}"
                    exactly.
                  </p>
                )}
            </div>
          </div>
        )}

        <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={handleClose}>
            {cancelText}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={!isConfirmEnabled}
            className={!isConfirmEnabled ? "opacity-50 cursor-not-allowed" : ""}
          >
            {variant === "destructive" && <Trash2 className="w-4 h-4 mr-2" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
