import { useState } from "react";
import { useMCP } from "@/atoms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus,
  MessageSquare,
  Bot,
  MoreVertical,
  Edit3,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Info,
  FileText,
  CheckCheckIcon,
} from "lucide-react";
import { toast } from "sonner";
import MCPConnectionSheet from "./MCPConnectionSheet";
import CustomInstructionsSheet from "./CustomInstructionsSheet";
import ConfirmAction from "@/components/shared/ConfirmAction";
import {
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Tooltip,
} from "../ui/tooltip";
import { Switch } from "@/components/ui/switch";

interface ChatSidebarProps {
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewChat: () => void;
}

export default function ChatSidebar({
  activeSessionId,
  onSessionSelect,
}: ChatSidebarProps) {
  const {
    connections,
    activeConnection,
    chatSessions,
    customInstructions,
    isConnected,
    createChatSession,
    deleteChatSession,
    renameChatSession,
    setActiveConnection,
    removeConnection,
    deleteCustomInstruction,
    toggleCustomInstruction,
  } = useMCP();

  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState<any>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [connectionsExpanded, setConnectionsExpanded] = useState(true);
  const [instructionsExpanded, setInstructionsExpanded] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const handleNewChat = async () => {
    if (!isConnected) {
      toast.error("Please configure an AI connection first");
      setShowConnectionDialog(true);
      return;
    }
    try {
      const newSessionId = await createChatSession();
      onSessionSelect(newSessionId);
    } catch (error) {
      toast.error("Could not create new chat session");
    }
  };

  const handleDeleteChat = (sessionId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const session = chatSessions.find((s) => s.id === sessionId);

    setConfirmDialog({
      isOpen: true,
      title: "Delete Chat",
      description: `Are you sure you want to delete "${
        session?.title || "this chat"
      }"? This action cannot be undone.`,
      onConfirm: async () => {
        await deleteChatSession(sessionId);
        if (activeSessionId === sessionId) {
          // Navigate to welcome or first available session
          if (chatSessions.length > 1) {
            const remainingSessions = chatSessions.filter(
              (s) => s.id !== sessionId
            );
            onSessionSelect(remainingSessions[0].id);
          } else {
            onSessionSelect("welcome");
          }
        }
        toast.success("Chat deleted");
      },
    });
  };

  const handleRenameStart = (
    sessionId: string,
    currentTitle: string,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    setEditingSessionId(sessionId);
    setEditingTitle(currentTitle);
  };

  const handleRenameConfirm = async () => {
    if (editingSessionId && editingTitle.trim()) {
      await renameChatSession(editingSessionId, editingTitle.trim());
    }
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const handleRenameCancel = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "Just now";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h ago`;
    } else if (diffInHours < 168) {
      return `${Math.floor(diffInHours / 24)}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleAddInstruction = () => {
    setEditingInstruction(null);
    setShowInstructionsDialog(true);
  };

  const handleEditInstruction = (instruction: any) => {
    setEditingInstruction(instruction);
    setShowInstructionsDialog(true);
  };

  const handleCloseInstructionsDialog = () => {
    setShowInstructionsDialog(false);
    setEditingInstruction(null);
  };

  const handleDeleteInstruction = (
    instructionId: string,
    instructionName: string
  ) => {
    setConfirmDialog({
      isOpen: true,
      title: "Delete Custom Instruction",
      description: `Are you sure you want to delete "${instructionName}"? This action cannot be undone.`,
      onConfirm: async () => {
        await deleteCustomInstruction(instructionId);
        toast.success("Custom instruction deleted");
      },
    });
  };

  return (
    <div className="w-80 h-full bg-muted/30 border-r flex flex-col">
      {/* Header */}
      <div className="h-[70px] border-b p-4">
        <div className="flex items-center justify-between">
          <Button
            onClick={handleNewChat}
            disabled={!isConnected}
            variant="outline"
            className="flex-1"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </Button>
        </div>
      </div>

      {/* Content */}

      <div className="p-2">
        <ScrollArea className="max-h-[calc(50vh)] overflow-y-auto">
          {/* Chat Sessions */}
          <div className="mb-4">
            <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Chats
            </div>

            {chatSessions.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No conversations yet</p>
                <p className="text-xs mt-1">
                  {isConnected ? "Start chatting" : "Configure AI first"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {[...chatSessions]
                  .sort(
                    (a, b) =>
                      new Date(b.updatedAt).getTime() -
                      new Date(a.updatedAt).getTime()
                  )
                  .map((session) => (
                    <div
                      key={session.id}
                      className={`group relative rounded-lg p-2 cursor-pointer transition-colors ${
                        activeSessionId === session.id
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => onSessionSelect(session.id)}
                    >
                      {editingSessionId === session.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleRenameConfirm();
                              } else if (e.key === "Escape") {
                                handleRenameCancel();
                              }
                            }}
                            className="h-6 text-xs"
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameConfirm();
                            }}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenameCancel();
                            }}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between">
                            <div className="font-medium text-sm truncate flex-1 max-w-[170px]">
                              {session.title}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-center rounded-full p-0.5 transition-colors">
                                      <Info className="w-3.5 h-3.5 cursor-help" />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="bottom"
                                    align="start"
                                    className="backdrop-blur-sm border shadow-xl rounded-lg p-3"
                                  >
                                    <div className="max-w-xs text-xs font-mono text-gray-700 dark:text-gray-300 space-y-1.5">
                                      <div className="flex items-center">
                                        <span className="mr-1">ID:</span>
                                        <span className="font-mono">
                                          {session.id}
                                        </span>
                                      </div>
                                      <Separator className="my-1.5" />
                                      <div className="flex items-center">
                                        <span className="mr-1">Title:</span>
                                        <span className="font-mono">
                                          {session.title}
                                        </span>
                                      </div>

                                      <div className="flex items-center">
                                        <span className="mr-1">Updated:</span>
                                        {new Date(
                                          session.updatedAt
                                        ).toLocaleString()}
                                      </div>
                                      <Separator className="my-1.5" />

                                      <div className="flex items-center">
                                        <span className="mr-1">Created:</span>
                                        {new Date(
                                          session.createdAt
                                        ).toLocaleString()}
                                      </div>
                                      <Separator className="my-1.5" />

                                      <div className="flex items-center">
                                        <span className="mr-1">Messages:</span>
                                        <span className="font-medium">
                                          {session.messages.length}
                                        </span>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              <span>
                                {formatRelativeTime(session.updatedAt)}
                              </span>
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0 transition-opacity cursor-pointer opacity-50 group-hover:opacity-100"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <MoreVertical className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleRenameStart(session.id, session.title)
                                  }
                                >
                                  <Edit3 className="w-3 h-3 mr-2" />
                                  Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDeleteChat(session.id)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-3 h-3 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <Separator />

        {/* AI Connections */}
        <div className="mt-4">
          <Collapsible
            open={connectionsExpanded}
            onOpenChange={setConnectionsExpanded}
          >
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground">
                <span>AI Connections</span>
                {connectionsExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1">
                {connections.length === 0 ? (
                  <div className="px-2 py-2 text-center">
                    <Button
                      onClick={() => setShowConnectionDialog(true)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Connection
                    </Button>
                  </div>
                ) : (
                  <>
                    {connections.map((connection) => (
                      <div
                        key={connection.id}
                        className={`group rounded-lg p-2 transition-colors ${
                          activeConnection?.id === connection.id
                            ? "bg-primary/10"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Bot className="w-4 h-4 flex-shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">
                                {connection.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {connection.model}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {activeConnection?.id === connection.id && (
                              <CheckCheckIcon className="w-4 h-4 text-green-500" />
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 p-0 opacity-50 group-hover:opacity-100"
                                >
                                  <MoreVertical className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    setActiveConnection(connection.id)
                                  }
                                  disabled={
                                    activeConnection?.id === connection.id
                                  }
                                >
                                  <Check className="w-3 h-3 mr-2" />
                                  Set Active
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setConfirmDialog({
                                      isOpen: true,
                                      title: "Remove Connection",
                                      description: `Remove "${connection.name}" connection?`,
                                      onConfirm: () => {
                                        removeConnection(connection.id);
                                        toast.success("Connection removed");
                                      },
                                    });
                                  }}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-3 h-3 mr-2" />
                                  Remove
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="px-2 pt-2 mb-2">
                      <Button
                        onClick={() => setShowConnectionDialog(true)}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Connection
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <Separator />

        {/* Custom Instructions */}
        <div className="mt-3">
          <Collapsible
            open={instructionsExpanded}
            onOpenChange={setInstructionsExpanded}
          >
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground">
                <span>Custom Instructions</span>
                {instructionsExpanded ? (
                  <ChevronDown className="w-3 h-3" />
                ) : (
                  <ChevronRight className="w-3 h-3" />
                )}
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1">
                {customInstructions.length === 0 ? (
                  <div className="px-2 py-2 text-center">
                    <Button
                      onClick={handleAddInstruction}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Instruction
                    </Button>
                  </div>
                ) : (
                  <>
                    {customInstructions.map((instruction) => (
                      <div
                        key={instruction.id}
                        className={`group rounded-lg p-1.5 transition-colors ${
                          instruction.isActive
                            ? "bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="flex items-start gap-1.5 min-w-0 flex-1">
                            <FileText className="w-3 h-3 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium truncate leading-tight">
                                {instruction.name}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Switch
                              checked={instruction.isActive}
                              onCheckedChange={() =>
                                toggleCustomInstruction(instruction.id)
                              }
                              className="scale-75"
                            />

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 p-0 hover:bg-green-500 transition-opacity"
                                >
                                  <MoreVertical className="w-3 h-3" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleEditInstruction(instruction)
                                  }
                                >
                                  <Edit3 className="w-3 h-3 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleDeleteInstruction(
                                      instruction.id,
                                      instruction.name
                                    )
                                  }
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="w-3 h-3 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="px-2 pt-1">
                      <Button
                        onClick={handleAddInstruction}
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start h-7 text-xs"
                      >
                        <Plus className="w-3 h-3 mr-1.5" />
                        Add Instruction
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      {/* Connection Dialog */}
      <MCPConnectionSheet
        isOpen={showConnectionDialog}
        onClose={() => setShowConnectionDialog(false)}
      />

      {/* Custom Instructions Dialog */}
      <CustomInstructionsSheet
        isOpen={showInstructionsDialog}
        onClose={handleCloseInstructionsDialog}
        instruction={editingInstruction}
      />

      {/* Confirm Dialog */}
      <ConfirmAction
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        description={confirmDialog.description}
        variant="destructive"
        confirmText="Delete"
        onConfirm={confirmDialog.onConfirm}
        onCancel={() =>
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }))
        }
      />
    </div>
  );
}
