import { useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  globalInstructionsAtom,
  addGlobalInstructionAtom,
  removeGlobalInstructionAtom,
  updateGlobalInstructionAtom,
} from "@/atoms/chat-atoms";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";

interface GlobalInstructionsSheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function GlobalInstructionsSheet({
  isOpen,
  onOpenChange,
}: GlobalInstructionsSheetProps) {
  const [instructions] = useAtom(globalInstructionsAtom);
  const addInstruction = useSetAtom(addGlobalInstructionAtom);
  const removeInstruction = useSetAtom(removeGlobalInstructionAtom);
  const updateInstruction = useSetAtom(updateGlobalInstructionAtom);

  const [newInstruction, setNewInstruction] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const handleAdd = () => {
    if (!newInstruction.trim()) return;
    
    addInstruction(newInstruction.trim());
    setNewInstruction("");
    toast.success("Instruction added");
  };

  const handleUpdate = (index: number) => {
    if (!editingValue.trim()) return;
    
    updateInstruction(index, editingValue.trim());
    setEditingIndex(null);
    setEditingValue("");
    toast.success("Instruction updated");
  };

  const handleDelete = (index: number) => {
    removeInstruction(index);
    toast.success("Instruction removed");
  };

  const startEdit = (index: number, value: string) => {
    setEditingIndex(index);
    setEditingValue(value);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValue("");
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="w-[500px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Global Instructions</SheetTitle>
          <SheetDescription>
            Add instructions that will be included in every chat conversation.
            These help guide the AI's responses across all sessions.
          </SheetDescription>
        </SheetHeader>

        <div className="p-3">
          {/* Add new instruction */}
          <div className="space-y-2">
            <Textarea
              placeholder="Enter a new instruction..."
              value={newInstruction}
              onChange={(e) => setNewInstruction(e.target.value)}
              className="h-[120px] min-h-[80px] max-h-[320px]"
            />
            <Button
              onClick={handleAdd}
              disabled={!newInstruction.trim()}
              className="w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Instruction
            </Button>
          </div>

          {/* List of instructions */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted-foreground">
              Active Instructions ({instructions.length})
            </h3>
            <ScrollArea className="h-[400px]">
              {instructions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No instructions added yet
                </p>
              ) : (
                <div className="space-y-2">
                  {instructions.map((instruction, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border bg-muted/30"
                    >
                      {editingIndex === index ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            className="min-h-[60px]"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleUpdate(index)}
                              disabled={!editingValue.trim()}
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={cancelEdit}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm whitespace-pre-wrap">
                            {instruction}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => startEdit(index, instruction)}
                            >
                              <Edit2 className="w-4 h-4 mr-1" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDelete(index)}
                              className="text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}