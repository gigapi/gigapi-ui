import React, { useState } from "react";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import {
  tabsAtom,
  activeTabIdAtom,
  switchTabAtom,
  createTabAtom,
  closeTabAtom,
  renameTabAtom,
  duplicateTabAtom,
  runningQueriesAtom,
} from "@/atoms/tab-atoms";
import { cn } from "@/lib/utils/class-utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  X,
  Plus,
  MoreVertical,
  Copy,
  Edit2,
  Loader2,
} from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { toast } from "sonner";

export function TabBar() {
  const [tabs] = useAtom(tabsAtom);
  const [activeTabId] = useAtom(activeTabIdAtom);
  const runningQueries = useAtomValue(runningQueriesAtom);
  const switchTab = useSetAtom(switchTabAtom);
  const createTab = useSetAtom(createTabAtom);
  const closeTab = useSetAtom(closeTabAtom);
  const renameTab = useSetAtom(renameTabAtom);
  const duplicateTab = useSetAtom(duplicateTabAtom);

  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTabId, setRenameTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCreateTab = () => {
    createTab();
    toast.success("New tab created");
  };

  const handleCloseTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (tabs.length <= 1) {
      toast.error("Cannot close the last tab");
      return;
    }
    closeTab(tabId);
  };

  const handleRenameTab = (tabId: string, currentName: string) => {
    setRenameTabId(tabId);
    setRenameValue(currentName);
    setRenameDialogOpen(true);
  };

  const handleRenameSubmit = () => {
    if (renameTabId && renameValue.trim()) {
      renameTab({ tabId: renameTabId, name: renameValue.trim() });
      setRenameDialogOpen(false);
      toast.success("Tab renamed");
    }
  };

  const handleDuplicateTab = (tabId: string) => {
    duplicateTab(tabId);
    toast.success("Tab duplicated");
  };

  return (
    <>
      <div className="flex items-center border-b bg-background">
        <ScrollArea className="flex-1">
          <div className="flex items-center">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={cn(
                  "group relative flex items-center gap-2 px-4 py-2 cursor-pointer border-r hover:bg-accent/50 transition-colors",
                  "min-w-[140px] max-w-[240px]",
                  activeTabId === tab.id && "bg-accent"
                )}
                onClick={() => switchTab(tab.id)}
              >
                <span className="flex-1 truncate text-sm flex items-center gap-2">
                  {tab.name}
                  {runningQueries.has(tab.id) && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </span>

                {/* Tab Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRenameTab(tab.id, tab.name);
                        }}
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateTab(tab.id);
                        }}
                      >
                        <Copy className="mr-2 h-4 w-4" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => handleCloseTab(e, tab.id)}
                        disabled={tabs.length <= 1}
                        className="text-destructive"
                      >
                        <X className="mr-2 h-4 w-4" />
                        Close
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {tabs.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={(e) => handleCloseTab(e, tab.id)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* New Tab Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCreateTab}
          className="h-full px-3 rounded-none border-l"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Tab</DialogTitle>
            <DialogDescription>
              Enter a new name for this tab.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameSubmit();
                }}
                className="col-span-3"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}