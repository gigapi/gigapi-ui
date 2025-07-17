import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bot,
  Plus,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  MoreVertical,
  FileText,
} from "lucide-react";
import { useAtom, useSetAtom } from "jotai";
import {
  sessionListAtom,
  deleteSessionAtom,
  renameSessionAtom,
  aiConnectionsAtom,
  deleteConnectionAtom,
  globalInstructionsAtom,
} from "@/atoms/chat-atoms";
import { schemaCacheAtom } from "@/atoms/database-atoms";
import { toast } from "sonner";
import AIConnectionSheet from "./AIConnectionSheet";
import GlobalInstructionsSheet from "./GlobalInstructionsSheet";
import ConfirmAction from "@/components/shared/ConfirmAction";

interface SimpleChatSidebarProps {
  activeSessionId: string | null;
  onSessionSelect: (sessionId: string) => void;
  onNewChat: () => void;
}

export default function SimpleChatSidebar({
  activeSessionId,
  onSessionSelect,
  onNewChat,
}: SimpleChatSidebarProps) {
  const [sessions] = useAtom(sessionListAtom);
  const [connections] = useAtom(aiConnectionsAtom);
  const deleteSession = useSetAtom(deleteSessionAtom);
  const renameSession = useSetAtom(renameSessionAtom);
  const deleteConnection = useSetAtom(deleteConnectionAtom);
  const [globalInstructions] = useAtom(globalInstructionsAtom);
  const [schemaCache] = useAtom(schemaCacheAtom);

  const [showConnectionDialog, setShowConnectionDialog] = useState(false);
  const [showInstructionsDialog, setShowInstructionsDialog] = useState(false);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    type: "connection" | "session" | null;
    id: string | null;
    name: string;
  }>({ type: null, id: null, name: "" });

  const navigate = useNavigate();

  const handleDeleteSession = () => {
    if (!deleteConfirmation.id) return;
    try {
      deleteSession(deleteConfirmation.id);
      toast.success("Chat deleted");
      setDeleteConfirmation({ type: null, id: null, name: "" });
      navigate("/chat");
    } catch (error) {
      toast.error("Failed to delete chat");
    }
  };

  const handleDeleteConnection = () => {
    if (!deleteConfirmation.id) return;
    try {
      deleteConnection(deleteConfirmation.id);
      toast.success("Connection deleted");
      setDeleteConfirmation({ type: null, id: null, name: "" });
    } catch (error) {
      toast.error("Failed to delete connection");
    }
  };

  const handleRenameSession = (sessionId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      renameSession(sessionId, newTitle.trim());
      setEditingSessionId(null);
      toast.success("Chat renamed");
    } catch (error) {
      toast.error("Failed to rename chat");
    }
  };

  const formatRelativeTime = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 1) {
      return "Now";
    } else if (diffInHours < 24) {
      return `${Math.floor(diffInHours)}h`;
    } else {
      return `${Math.floor(diffInHours / 24)}d`;
    }
  };

  return (
    <div className="w-72 border-r flex flex-col h-full bg-background">
      <Button
        onClick={onNewChat}
        className="m-3 transition-all duration-200 font-medium border hover:bg-accent hover:text-accent-foreground"
        variant="outline"
        disabled={connections.length === 0}
      >
        <Plus className="w-4 h-4 mr-2" />
        New Chat
      </Button>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4 max-w-72">
          {/* AI Connections */}
          <div>
            <div className="flex items-center justify-between mb-2 px-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Bot className="w-3.5 h-3.5" />
                AI Providers
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 hover:bg-accent hover:text-accent-foreground"
                onClick={() => setShowConnectionDialog(true)}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
            <div className="space-y-1">
              {connections.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-muted flex items-center justify-center">
                    <Bot className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No providers configured
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8 text-xs border-dashed hover:bg-accent hover:text-accent-foreground"
                    onClick={() => setShowConnectionDialog(true)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Provider
                  </Button>
                </div>
              ) : (
                connections.map((conn) => (
                  <div
                    key={conn.id}
                    className="group relative rounded-lg transition-all duration-200 flex items-center justify-between px-2 hover:bg-accent/50 border border-transparent"
                  >
                    <div className="flex-1 flex items-center gap-3 py-2.5 text-sm">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center border bg-background">
                        <Bot className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-medium text-foreground truncate max-w-[168px]">
                          {conn.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {conn.provider || "Custom Provider"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirmation({
                          type: "connection",
                          id: conn.id,
                          name: conn.name,
                        });
                      }}
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="h-px bg-border mx-2" />

          {/* Chat Sessions */}
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-2 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Conversations
            </h3>
            <div className="space-y-0.5">
              {sessions.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-muted flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No conversations yet
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {connections.length > 0
                      ? "Start a new chat"
                      : "Add a provider first"}
                  </p>
                </div>
              ) : (
                sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group relative rounded-lg transition-all duration-200 ${
                      activeSessionId === session.id
                        ? "bg-accent border border-accent-foreground/20"
                        : "hover:bg-accent/50 border border-transparent"
                    }`}
                  >
                    {editingSessionId === session.id ? (
                      <div className="flex items-center gap-1 p-2">
                        <Input
                          value={editingTitle}
                          onChange={(e) => setEditingTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleRenameSession(session.id, editingTitle);
                            } else if (e.key === "Escape") {
                              setEditingSessionId(null);
                            }
                          }}
                          className="h-7 text-sm"
                          autoFocus
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-accent"
                          onClick={() =>
                            handleRenameSession(session.id, editingTitle)
                          }
                        >
                          <Check className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-accent"
                          onClick={() => setEditingSessionId(null)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => onSessionSelect(session.id)}
                        className="w-full text-left p-2.5 flex items-center gap-3"
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            activeSessionId === session.id
                              ? "bg-background border border-accent-foreground/20"
                              : "bg-muted"
                          }`}
                        >
                          <MessageSquare className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground truncate leading-tight">
                            {session.title}
                          </p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            {formatRelativeTime(session.updatedAt)}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-36">
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingSessionId(session.id);
                                setEditingTitle(session.title);
                              }}
                              className="text-sm"
                            >
                              <Edit2 className="w-3.5 h-3.5 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirmation({
                                  type: "session",
                                  id: session.id,
                                  name: session.title,
                                });
                              }}
                              className="text-destructive hover:bg-destructive/10 text-sm"
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t bg-muted/30 space-y-2 p-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-9 justify-between group hover:bg-accent hover:text-accent-foreground"
          onClick={() => setShowInstructionsDialog(true)}
        >
          <span className="flex items-center text-sm">
            <FileText className="w-4 h-4 mr-2 text-muted-foreground group-hover:text-accent-foreground" />
            <span className="text-foreground">Global Instructions</span>
          </span>
          {globalInstructions.length > 0 && (
            <span className="text-xs bg-accent text-accent-foreground px-2 py-0.5 rounded-full font-medium">
              {globalInstructions.length}
            </span>
          )}
        </Button>

        {/* Schema Status */}
        {schemaCache && (
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground bg-muted/50 rounded-lg px-2 py-1.5">
            <Bot className="w-3.5 h-3.5" />
            <span>
              {Object.keys(schemaCache.databases).length} databases cached
            </span>
          </div>
        )}
      </div>

      <AIConnectionSheet
        isOpen={showConnectionDialog}
        onOpenChange={setShowConnectionDialog}
      />

      <GlobalInstructionsSheet
        isOpen={showInstructionsDialog}
        onOpenChange={setShowInstructionsDialog}
      />

      <ConfirmAction
        isOpen={deleteConfirmation.type !== null}
        title={
          deleteConfirmation.type === "connection"
            ? "Delete AI Provider"
            : "Delete Chat"
        }
        description={
          deleteConfirmation.type === "connection"
            ? `Are you sure you want to delete "${deleteConfirmation.name}"? This action cannot be undone.`
            : `Are you sure you want to delete "${deleteConfirmation.name}"? All messages in this conversation will be permanently deleted.`
        }
        confirmText="Delete"
        variant="destructive"
        onConfirm={
          deleteConfirmation.type === "connection"
            ? handleDeleteConnection
            : handleDeleteSession
        }
        onCancel={() =>
          setDeleteConfirmation({ type: null, id: null, name: "" })
        }
      />
    </div>
  );
}
